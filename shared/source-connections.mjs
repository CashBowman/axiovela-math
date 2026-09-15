// Assistant-authored nodes and links are interpretations, never verifier records.
export function mergeSourceConnections(project, records) {
  if (!records || typeof records !== "object") return {};
  const input = Array.isArray(records) ? { links: records } : records;
  const graphNodes = [...(project.graphNodes || [])],
    sourceNotes = { ...(project.sourceNotes || {}) };
  for (const row of (Array.isArray(input.nodes) ? input.nodes : []).slice(
    0,
    300,
  )) {
    if (
      !row ||
      !["claim", "theorem", "proof"].includes(row.kind) ||
      typeof row.id !== "string" ||
      !/^[\w-]{1,64}$/.test(row.id) ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      row.title.length > 200 ||
      typeof row.text !== "string" ||
      row.text.length > 24000
    )
      continue;
    const node = {
      id: row.id,
      kind: row.kind,
      title: row.title.trim(),
      text: row.text,
      origin: "assistant",
      status: "unverified",
    };
    const index = graphNodes.findIndex((n) => n.id === node.id);
    if (index < 0) graphNodes.push(node);
    else graphNodes[index] = node;
  }
  const claims = [...project.claims];
  for (const row of (Array.isArray(input.claimUpdates)
    ? input.claimUpdates
    : []
  ).slice(0, 300)) {
    const index = claims.findIndex((c) => c.id === row?.id),
      old = claims[index];
    if (
      !old ||
      row.baseRevision !== old.revision ||
      typeof row.statement !== "string" ||
      !row.statement.trim() ||
      row.statement.length > 24000
    )
      continue;
    const changed = row.statement !== old.statement;
    const reviewNote =
      typeof row.reviewNote === "string"
        ? row.reviewNote.slice(0, 24000)
        : old.reviewNote;
    if (changed)
      claims[index] = {
        ...old,
        statement: row.statement,
        revision: old.revision + 1,
        status: "conjecture",
        reviewer: "",
        reviewNote: "",
        priorRevisions: [
          ...(old.priorRevisions || []),
          {
            statement: old.statement,
            revision: old.revision,
            status: old.status,
            reviewer: old.reviewer,
            reviewNote: old.reviewNote,
          },
        ],
      };
    else if (
      ["conjecture", "informal-proof", "needs-repair", "refuted"].includes(
        row.status,
      ) &&
      old.status !== "human-reviewed"
    )
      claims[index] = { ...old, status: row.status, reviewNote };
  }
  const nodes = new Set([
    ...project.papers.map((p) => "paper:" + p.id),
    ...project.claims.map((c) => "claim:" + c.id),
    ...graphNodes.map((n) => "idea:" + n.id),
    ...Object.keys(project.evidenceNotes || {}).map((id) => "evidence:" + id),
  ]);
  const links = [...(project.links || [])];
  const endpoint = (value) => {
    if (typeof value !== "string") return null;
    if (nodes.has(value)) return value;
    const paper = project.papers.find((p) =>
      [
        p.sourceUrl,
        p.localPath,
        `papers/${p.id}.pdf`,
        ...(p.aliases || []),
        ...(p.aliases || []).map((a) => "paper:" + a),
      ].includes(value),
    );
    return paper ? "paper:" + paper.id : value;
  };
  for (const row of (Array.isArray(input.sourceNotes)
    ? input.sourceNotes
    : []
  ).slice(0, 500)) {
    if (!row || typeof row.text !== "string" || row.text.length > 12000)
      continue;
    const key = endpoint(row.source);
    if (key?.startsWith("paper:") && nodes.has(key))
      sourceNotes[key] = row.text;
  }
  for (const record of (Array.isArray(input.links) ? input.links : []).slice(
    0,
    500,
  )) {
    const row = record && {
      ...record,
      from: endpoint(record.from),
      to: endpoint(record.to),
    };
    if (
      !row ||
      !nodes.has(row.from) ||
      !nodes.has(row.to) ||
      row.from === row.to ||
      ![
        "uses",
        "extends",
        "related to",
        "contradicts",
        "supports",
        "proves",
        "depends on",
      ].includes(row.type) ||
      typeof row.reason !== "string" ||
      !row.reason.trim() ||
      row.reason.length > 2000
    )
      continue;
    const key = JSON.stringify([row.from, row.to, row.type]),
      id = "assistant-" + encodeURIComponent(key);
    if (project.dismissedConnections?.includes(id)) continue;
    const index = links.findIndex(
      (l) => l.from === row.from && l.to === row.to && l.type === row.type,
    );
    const link = {
      id,
      from: row.from,
      to: row.to,
      type: row.type,
      reason: row.reason,
      origin: "assistant",
      reviewed: false,
    };
    if (index < 0) links.push(link);
    else if (links[index].origin === "assistant") links[index] = link;
  }
  for (const id of (Array.isArray(input.removeNodes)
    ? input.removeNodes
    : []
  ).slice(0, 300)) {
    const index = graphNodes.findIndex(
      (n) => n.id === id && n.origin === "assistant",
    );
    if (index >= 0) graphNodes.splice(index, 1);
    for (let i = links.length - 1; i >= 0; i--)
      if (links[i].from === "idea:" + id || links[i].to === "idea:" + id)
        links.splice(i, 1);
  }
  for (const row of (Array.isArray(input.removeLinks)
    ? input.removeLinks
    : []
  ).slice(0, 500)) {
    if (!row) continue;
    const from = endpoint(row.from),
      to = endpoint(row.to);
    for (let i = links.length - 1; i >= 0; i--)
      if (
        links[i].from === from &&
        links[i].to === to &&
        links[i].type === row.type
      )
        links.splice(i, 1);
  }
  const patch = {};
  for (const [key, value] of Object.entries({
    links,
    graphNodes,
    sourceNotes,
    claims,
  }))
    if (
      JSON.stringify(value) !==
      JSON.stringify(project[key] || (key === "sourceNotes" ? {} : []))
    )
      patch[key] = value;
  return patch;
}
