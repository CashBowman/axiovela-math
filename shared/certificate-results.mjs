// Result roles and assistant mappings never confer a verifier verdict.
export function certificateResults(project, data = {}) {
  const mappings = data.plan?.results || [];
  const results = [
    ...(project.claims || []).map((c) => ({
      ref: "claim:" + c.id,
      kind: "claim",
      title:
        c.title ||
        c.id + " · " + c.statement.replace(/\s+/g, " ").slice(0, 120),
      statement: c.statement,
      mainResult: false,
    })),
    ...(project.graphNodes || []).map((n) => ({
      ref: "idea:" + n.id,
      kind: n.kind,
      title: n.title,
      statement: n.text,
      mainResult: n.mainResult === true,
    })),
  ].map((result) => ({
    ...result,
    formal: mappings.find((x) => x.ref === result.ref) || null,
  }));
  if (data.plan && !mappings.length)
    results.unshift({
      ref: "formal:main",
      kind: "theorem",
      title: data.plan.title || "Current formalization",
      statement: data.plan.statement,
      mainResult: true,
      formal: data.plan,
    });
  return results;
}

// Display-only outline. Saved IDs, statements and verifier mappings stay intact.
export function certificateOutline(results, links = []) {
  const byRef = new Map(results.map((r) => [r.ref, r]));
  const dependencies = new Map(results.map((r) => [r.ref, new Set()]));
  for (const link of links) {
    if (!byRef.has(link.from) || !byRef.has(link.to)) continue;
    if (["depends on", "uses", "extends"].includes(link.type))
      dependencies.get(link.from).add(link.to);
    // Supporting evidence precedes its conclusion without asserting proof.
    if (["supports", "proves"].includes(link.type))
      dependencies.get(link.to).add(link.from);
  }
  // Allocate labels before ordering so changes to links don't renumber results.
  const explicit = new Map(), used = new Map();
  for (const r of results) {
    const match = /^(Theorem|Lemma|Claim|Proposition|Corollary|Definition|Assumption|Conjecture|Proof)\s+(\d+(?:\.\d+)*[a-z]?)(?=$|[\s:.)–—-])/i.exec(r.title);
    if (!match) continue;
    const kind = match[1].toLowerCase(), number = match[2];
    explicit.set(r.ref, {kind, number, title: r.title.slice(match[0].length).replace(/^[\s:.)–—-]+/, "") || r.title});
    if (!used.has(kind)) used.set(kind, new Set());
    used.get(kind).add(number);
  }
  const labeled = new Map(results.map((r) => {
    const saved = explicit.get(r.ref), kind = saved?.kind || r.kind;
    if (!used.has(kind)) used.set(kind, new Set());
    let number = saved?.number;
    if (!number) {
      let n = 1;
      while (used.get(kind).has(String(n))) n++;
      number = String(n); used.get(kind).add(number);
    }
    return [r.ref, {...r, displayTitle: saved?.title || r.title,
      label: kind[0].toUpperCase() + kind.slice(1) + " " + number,
      prerequisites: [...dependencies.get(r.ref)], circular: false}];
  }));
  const ordered = [], pending = new Set(results.map((r) => r.ref));
  while (pending.size) {
    const available = [...pending].filter(ref => [...dependencies.get(ref)].every(dep => !pending.has(dep)));
    if (!available.length) {
      // Keep every result accessible. Don't pretend a cycle has a valid order.
      for (const ref of pending) ordered.push({...labeled.get(ref), circular: true});
      break;
    }
    // Independent supporting work comes before independent main conclusions.
    available.sort((a, b) => Number(!!byRef.get(a).mainResult) - Number(!!byRef.get(b).mainResult));
    const ref = available[0];
    ordered.push(labeled.get(ref)); pending.delete(ref);
  }
  return ordered;
}
export function resultCheckState(result, data) {
  if (!result?.formal)
    return {
      label: "Not formalized",
      tone: "muted",
      detail: "No formal declaration is linked to this result yet.",
    };
  if (!data.sourceHash)
    return {
      label: "Source missing",
      tone: "attention",
      detail:
        "A declaration mapping is saved, but the Lean entry file has not been saved.",
    };
  if (!result.formal.declarations?.length)
    return {
      label: "Mapping incomplete",
      tone: "attention",
      detail:
        "Name the formal declarations corresponding to this result before reviewing its certificate.",
    };
  if (data.stale)
    return {
      label: "Needs recheck",
      tone: "attention",
      detail:
        "The saved formalization has changed since the last project check.",
    };
  const record = data.records?.[0];
  if (record?.status === "build-passed")
    return {
      label: "Project build passed",
      tone: "build",
      detail:
        "The project entry file compiled. This result’s declaration mapping, axioms, dependencies and statement correspondence still require review.",
    };
  if (
    record &&
    [
      "build-failed",
      "tool-unavailable",
      "timed-out",
      "canceled",
      "stale",
    ].includes(record.status)
  )
    return {
      label: record.status.replaceAll("-", " "),
      tone: "attention",
      detail: record.message || "Review the project check below.",
    };
  return {
    label: "Awaiting check",
    tone: "muted",
    detail:
      "Formal source is saved. No passing build is recorded for the current project revision.",
  };
}
export function certificateProgress(results, data) {
  return {
    total: results.length,
    main: results.filter((r) => r.mainResult).length,
    linked: results.filter(
      (r) => r.formal?.declarations?.length && data.sourceHash,
    ).length,
    certified: 0,
  };
}
