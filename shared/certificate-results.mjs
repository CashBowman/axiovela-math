import {
  manuscriptResults,
  matchManuscriptResults,
} from "./manuscript-results.mjs";
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
export function certificateOutline(results, links = [], manuscript = {}) {
  const matches = matchManuscriptResults(
    results,
    manuscriptResults(
      manuscript.source,
      manuscript.format,
      manuscript.compiled,
    ),
  );
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
  const labeled = new Map(
    results.map((r) => {
      const item = matches.get(r.ref),
        kind = item?.kind || r.kind;
      const parent =
        r.kind === "proof" && item
          ? links.find(
              (l) =>
                l.from === r.ref &&
                ["proves", "supports"].includes(l.type) &&
                matches.has(l.to),
            )
          : null;
      const parentItem = parent && matches.get(parent.to);
      const label = parentItem
        ? "Proof of " +
          parentItem.kind[0].toUpperCase() +
          parentItem.kind.slice(1) +
          (parentItem.number ? " " + parentItem.number : "")
        : kind[0].toUpperCase() +
          kind.slice(1) +
          (item?.number
            ? " " + item.number
            : item?.pending
              ? " · render to number"
              : "");
      return [
        r.ref,
        {
          ...r,
          displayTitle: item?.title || r.title,
          label,
          section: item?.section || parentItem?.section || "Working results",
          manuscriptOrder: item
            ? item.order
            : parentItem
              ? parentItem.order + 0.5
              : Infinity,
          prerequisites: [...dependencies.get(r.ref)],
          circular: false,
        },
      ];
    }),
  );
  const ordered = [],
    pending = new Set(results.map((r) => r.ref));
  while (pending.size) {
    const available = [...pending].filter((ref) =>
      [...dependencies.get(ref)].every((dep) => !pending.has(dep)),
    );
    if (!available.length) {
      // Keep every result accessible. Don't pretend a cycle has a valid order.
      for (const ref of pending)
        ordered.push({ ...labeled.get(ref), circular: true });
      break;
    }
    // Independent supporting work comes before independent main conclusions.
    available.sort(
      (a, b) =>
        Number(!!byRef.get(a).mainResult) - Number(!!byRef.get(b).mainResult),
    );
    const ref = available[0];
    ordered.push(labeled.get(ref));
    pending.delete(ref);
  }
  return ordered.sort((a, b) => a.manuscriptOrder - b.manuscriptOrder);
}
export function resultCheckState(result, data) {
  if (!result?.formal)
    return {
      label: "Not started",
      tone: "muted",
      detail: "No formal declaration is linked to this result yet.",
    };
  if (data.running)
    return {label: "Checking proofs", tone: "muted", detail: "Lean is checking the saved project and linked theorems."};
  if (!data.sourceHash)
    return {
      label: "Proof not saved",
      tone: "attention",
      detail:
        "A formalization plan exists, but its Lean entry file is missing. Ask the Math Assistant to save the Lean proof files.",
    };
  if (!result.formal.declarations?.length)
    return {
      label: "Theorem not linked",
      tone: "attention",
      detail:
        "The plan does not name the Lean theorems or definitions for this result. Ask the Math Assistant to link this result to its saved Lean declarations.",
    };
  if (data.stale)
    return {
      label: "Recheck needed",
      tone: "attention",
      detail:
        "The saved formalization has changed since the last project check.",
    };
  const record = data.records?.[0];
  if (record?.status === "build-passed" && record.declarationChecks?.length) {
    const checks = result.formal.declarations.map(name => record.declarationChecks.find(c => c.name === name));
    if (checks.every(c => c?.status === 'checked')) return {
      label: 'Proofs verified', tone: 'build',
      detail: 'Lean found each linked theorem and its proof uses only standard Lean axioms, with no unfinished proofs in its dependencies. Lean checks the formal statements. The assistant separately assesses their match to your mathematical claim.',
    };
    const statuses = checks.map(c => c?.status);
    return {label: statuses.includes('incomplete') ? 'Proof incomplete' : statuses.includes('extra-axioms') ? 'Uses extra assumptions' : statuses.includes('missing') ? 'Theorem not found' : statuses.includes('not-a-theorem') ? 'Linked item is not a theorem' : 'Proof check incomplete', tone: 'attention',
      detail: 'The file compiled, but the named theorem checks did not all pass. Ask the Math Assistant to repair the formalization; details are shown below.'};
  }
  if (record?.status === "build-passed")
    return {
      label: "Proof checks pending",
      tone: "muted",
      detail:
        "Lean accepted the saved entry file, but this older check did not audit the linked theorems. Run Lean check to check their proofs and transitive axioms automatically. The assistant assesses whether the statements match your claim.",
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
      label: leanCheckLabel(record.status),
      tone: "attention",
      detail: record.message || "Review the project check below.",
    };
  return {
    label: "Proof checks pending",
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

// Human-readable labels also cover historical verifier records without rewriting them.
export function leanCheckLabel(status) {
  return ({
    'build-passed': 'Compilation passed',
    'build-failed': 'Check failed',
    'tool-unavailable': 'Checker unavailable',
    'timed-out': 'Check timed out',
    canceled: 'Check stopped',
    stale: 'Recheck needed',
    preflight: 'Proof checks pending',
    'not-configured': 'Not started',
  })[status] || status?.replaceAll('-', ' ') || 'Not checked';
}
export function leanItemLabel(label) {
  return ({
    'Admission preflight': 'Unfinished proofs and added axioms',
    'Statement correspondence': 'Does the Lean statement match your result?',
    'Pinned Lean toolchain': 'Fixed Lean version',
    'Locked dependencies': 'Fixed library versions',
  })[label] || label;
}
export function leanItemStatus(status) {
  return ({present: 'Found', clear: 'No obvious issues found', attention: 'Needs attention', missing: 'Missing', 'review-required': 'Assistant assessment'})[status] || status?.replaceAll('-', ' ');
}
