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
