// Bibliography metadata is deliberately minimal; unknown authors/dates are not invented.
const bibText = (value) =>
  String(value)
    .replace(/[\\{}%&#_$]/g, (c) => "\\" + c)
    .replace(/[\r\n]+/g, " ");
function generatedEntry(p) {
  return (
    "@misc{" +
    p.citationKey +
    ",\n  title = {" +
    bibText(p.title) +
    "}," +
    (p.sourceUrl ? "\n  url = {" + bibText(p.sourceUrl) + "}," : "") +
    "\n  note = {" +
    (p.sourceType === "web"
      ? "Web source"
      : "Imported PDF; bibliographic metadata needs review") +
    "}\n}\n"
  );
}
// Aliases keep old citations and saved files reachable after records are consolidated.
export function sourceAliases(p) {
  return [
    ...new Set(
      [
        p.id,
        p.pdfId,
        p.sourceUrl,
        p.localPath,
        p.originalName,
        ...(p.aliases || []),
      ].filter(Boolean),
    ),
  ];
}
const normalizedTitle = (p) =>
  String(p.title || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function canonicalSourceUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return value;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return value; }
}
function identity(p) {
  const keys = sourceAliases(p).map((x) => "ref:" + canonicalSourceUrl(x));
  if (p.contentHash) keys.push("hash:" + p.contentHash);
  if (p.doi)
    keys.push(
      "doi:" +
        p.doi.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi.org\//, ""),
    );
  const arxiv =
    p.arxivId || p.sourceUrl?.match(/arxiv.org\/(?:abs|pdf|html)\/([^?#]+)/)?.[1];
  if (arxiv)
    keys.push("arxiv:" + arxiv.replace(/\.pdf$/, "").replace(/v\d+$/, ""));
  const title = normalizedTitle(p);
  // Never merge generic placeholders or short, ambiguous names by title alone.
  if (
    title.length >= 24 &&
    title.split(" ").length >= 4 &&
    !/^(imported pdf|source from|untitled|abstract|unknown|subject|pdf title unavailable)/.test(title) &&
    !/[a-f0-9]{24}/.test(title) &&
    !/[.](html?|pdf)$/i.test(p.title || "")
  )
    keys.push("title:" + title);
  return keys;
}
export function addLibrarySources(project, incoming = []) {
  const papers = [],
    index = new Map();
  let bibliography = project.bibliography || "";
  const aliases = new Map(),
    mergedIds = [];
  for (const row of [...project.papers, ...incoming]) {
    const old = identity(row)
      .map((k) => index.get(k))
      .find(Boolean);
    if (!old) {
      const next = { ...row };
      papers.push(next);
      for (const k of identity(next)) index.set(k, next);
      continue;
    }
    if (row.id === old.id && !row.contentVersion) continue;
    if (
      row.id === old.id &&
      row.contentVersion === old.contentVersion &&
      row.capturedAt === old.capturedAt
    )
      continue;
    const prior = { ...old };
    const upgrade = row.contentVersion && row.capturedAt !== old.capturedAt;
    // Keep the first (usually user-imported) identity and PDF; retain every alternate URL/file.
    const pdf =
      old.sourceType !== "web" ? old : row.sourceType !== "web" ? row : null;
    const notes =
      old.notes && row.notes && !old.notes.includes(row.notes)
        ? old.notes + "\n\n" + row.notes
        : old.notes || row.notes || "";
    Object.assign(old, {
      ...row,
      ...old,
      ...(upgrade ? row : {}),
      id: prior.id,
      title: prior.titleEdited
        ? prior.title
        : upgrade
          ? row.title
          : prior.title,
      titleEdited: prior.titleEdited,
      notes,
      read: !!(prior.read || row.read),
      citationKey: prior.citationKey || row.citationKey,
      discovered: !!prior.discovered,
      ...(pdf === old
        ? {
            annotationRevision:
              prior.annotationRevision ||
              prior.contentHash ||
              prior.capturedAt ||
              prior.id,
            text: prior.text,
          }
        : {}),
      aliases: [
        ...new Set([...sourceAliases(prior), ...sourceAliases(row)]),
      ].sort(),
      ...(pdf ? { sourceType: "pdf", pdfId: pdf.pdfId || pdf.id } : {}),
    });
    if (prior.citationKey && bibliography.includes(generatedEntry(prior)))
      bibliography = bibliography.replace(
        generatedEntry(prior),
        generatedEntry(old),
      );
    if (row.id !== old.id) {
      aliases.set(row.id, old.id);
      mergedIds.push(row.id);
    }
    for (const k of identity(old)) index.set(k, old);
  }
  for (const p of [...papers, ...project.papers, ...incoming])
    if (p.citationKey && !bibliography.includes("{" + p.citationKey + ","))
      bibliography += "\n\n" + generatedEntry(p);
  const patch = {};
  if (JSON.stringify(papers) !== JSON.stringify(project.papers))
    patch.papers = papers;
  if (bibliography !== project.bibliography) patch.bibliography = bibliography;
  const renamedIds = project.papers.filter(p => papers.some(q => q.id === p.id && q.title !== p.title)).map(p => p.id);
  if (renamedIds.length || mergedIds.some((id) => project.papers.some((p) => p.id === id))) {
    const endpoint = (x) =>
      x?.startsWith("paper:") && aliases.has(x.slice(6))
        ? "paper:" + aliases.get(x.slice(6))
        : x;
    patch.links = (project.links || [])
      .map((l) => ({ ...l, from: endpoint(l.from), to: endpoint(l.to) }))
      .filter(
        (l, i, a) =>
          l.from !== l.to &&
          a.findIndex(
            (x) => x.from === l.from && x.to === l.to && x.type === l.type,
          ) === i,
      );
    // Annotation targets retain their original IDs/revisions through aliases.
    // Preserve full original records for reversible migration, including conflicting metadata.
    patch.sourceMergeHistory = [
      ...(project.sourceMergeHistory || []),
      {
        at: new Date().toISOString(),
        papers: project.papers.filter((p) => mergedIds.includes(p.id) || renamedIds.includes(p.id)),
        links: project.links || [],
      },
    ];
  }
  // An enriched record can bridge two formerly unrelated rows (URL + PDF hash).
  // Collapse the remaining group in another pass, retaining all alias migrations.
  if (papers.length < project.papers.length + incoming.length && papers.some((p, i) =>
      papers.slice(0, i).some(q => identity(q).some(k => identity(p).includes(k))))) {
    return {...patch, ...addLibrarySources({...project, ...patch})};
  }
  return patch;
}
