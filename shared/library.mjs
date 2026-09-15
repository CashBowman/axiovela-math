// Bibliography metadata is deliberately minimal; unknown authors/dates are not invented.
const bibText = (value) =>
  String(value)
    .replace(/[\\{}%&#_$]/g, (c) => "\\" + c)
    .replace(/[\r\n]+/g, " ");
export function addLibrarySources(project, incoming) {
  const additions = incoming.filter(
    (p) =>
      !project.papers.some(
        (x) => x.id === p.id || (p.sourceUrl && x.sourceUrl === p.sourceUrl),
      ),
  );
  if (!additions.length) return {};
  let bibliography = project.bibliography;
  for (const p of additions) {
    if (!p.citationKey || bibliography.includes("{" + p.citationKey + ","))
      continue;
    bibliography +=
      "\n\n@misc{" +
      p.citationKey +
      ",\n  title = {" +
      bibText(p.title) +
      "}," +
      (p.sourceUrl ? "\n  url = {" + bibText(p.sourceUrl) + "}," : "") +
      "\n  note = {" +
      (p.sourceType === "web"
        ? "Web source"
        : "Imported PDF; bibliographic metadata needs review") +
      "}\n}\n";
  }
  return { papers: [...project.papers, ...additions], bibliography };
}
