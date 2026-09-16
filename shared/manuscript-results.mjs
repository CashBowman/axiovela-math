// Manuscript labels are navigation metadata, never proof or certificate status.
const kinds =
  "Theorem|Lemma|Claim|Proposition|Corollary|Definition|Assumption|Conjecture";
const titlePattern = new RegExp(
  `^(${kinds})\\s+(\\d+(?:\\.\\d+)*[a-z]?)(?=$|[\\s:.)–—-])`,
  "i",
);
const stableRef = /^(?:idea|claim):[a-zA-Z0-9_-]+$/;
export function parseAuxLabels(aux = "") {
  const labels = {};
  for (const m of aux.matchAll(/\\newlabel\{([^{}]+)\}\{\{([^{}]*)\}/g))
    if (stableRef.test(m[1]) && /^[\dA-Za-z]+(?:\.[\dA-Za-z]+)*$/.test(m[2]))
      labels[m[1]] = m[2];
  return labels;
}
export function manuscriptResults(
  source = "",
  format = "markdown",
  compiled = {},
) {
  const items = [];
  let section = "Manuscript",
    sectionOrder = 0;
  if (format === "latex") {
    // TeX is not a regular language: use compiled labels for numbers, not a
    // simulated counter. This scan only finds explicit stable result anchors.
    const clean = source.replace(/(?<!\\)%[^\n]*/g, "");
    const unnumbered = new Set(
      [...clean.matchAll(/\\newtheorem\*\{([^}]+)\}/g)].map((m) => m[1]),
    );
    const envKinds = new Map([["proof", "proof"]]);
    for (const m of clean.matchAll(
      /\\newtheorem\*?\{([^}]+)\}(?:\[[^\]]+\])?\{([^}]+)\}/g,
    ))
      if (new RegExp(`^(${kinds})$`, "i").test(m[2]))
        envKinds.set(m[1], m[2].toLowerCase());
    const names = [
      ...new Set([...envKinds.keys(), ...kinds.toLowerCase().split("|")]),
    ]
      .filter((n) => /^[a-zA-Z]+$/.test(n))
      .join("|");
    const tokens = new RegExp(
      "\\\\section(\\*)?(?:\\[[^\\]]*\\])?\\{([^{}]+)\\}|\\\\begin\\{(" +
        names +
        ")\\}(?:\\[([^\\]]*)\\])?([\\s\\S]*?)\\\\end\\{\\3\\}",
      "g",
    );
    for (const m of clean.matchAll(tokens)) {
      if (m[2]) {
        section = m[2];
        sectionOrder++;
        continue;
      }
      const kind =
        envKinds.get(m[3]) ||
        (new RegExp(`^(${kinds})$`, "i").test(m[3])
          ? m[3].toLowerCase()
          : null);
      if (!kind || unnumbered.has(m[3])) continue;
      const ref = /\\label\{((?:idea|claim):[a-zA-Z0-9_-]+)\}/.exec(m[5])?.[1];
      if (!ref) continue;
      const number =
        kind !== "proof" && compiled.source === source
          ? compiled.labels?.[ref]
          : null;
      items.push({
        ref,
        kind,
        number: number || null,
        title: m[4] || "",
        section,
        sectionOrder,
        order: items.length,
        pending: kind !== "proof" && !number,
      });
    }
    return items;
  }
  // Portable ordinary Markdown: explicit numbered result headings followed by
  // an invisible stable-id comment. Existing numbers are preserved verbatim.
  let fenced = false;
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(lines[i]);
    if (!heading) continue;
    const title = heading[2].replace(/\*\*/g, ""),
      match = titlePattern.exec(title);
    if (!match && /^Proof(?:\s+of\s+|$)/i.test(title)) {
      const ref =
        /<!--\s*axiovela-result:\s*((?:idea|claim):[a-zA-Z0-9_-]+)\s*-->/.exec(
          lines.slice(i + 1, i + 4).join("\n"),
        )?.[1];
      if (ref)
        items.push({
          ref,
          kind: "proof",
          number: null,
          title,
          section,
          sectionOrder,
          order: items.length,
          pending: false,
        });
      continue;
    }
    if (!match) {
      if (heading[1].length <= 2) {
        section = title;
        sectionOrder++;
      }
      continue;
    }
    const nearby = lines.slice(i + 1, i + 4).join("\n"),
      ref =
        /<!--\s*axiovela-result:\s*((?:idea|claim):[a-zA-Z0-9_-]+)\s*-->/.exec(
          nearby,
        )?.[1];
    items.push({
      ref: ref || null,
      kind: match[1].toLowerCase(),
      number: match[2],
      title: title.slice(match[0].length).replace(/^[\s:.)–—-]+/, ""),
      section,
      sectionOrder,
      order: items.length,
    });
  }
  return items;
}
export function matchManuscriptResults(results, items) {
  const matched = new Map(),
    used = new Set();
  for (const r of results) {
    const direct = items.filter((i) => i.ref === r.ref);
    let item = direct.length === 1 ? direct[0] : null;
    // Compatibility for already numbered manuscripts: exact unique heading
    // match, never fuzzy title/statement matching or guessing an ordinal.
    if (!direct.length) {
      const m = titlePattern.exec(r.title),
        title = m && r.title.slice(m[0].length).replace(/^[\s:.)–—-]+/, "");
      const exact = m
        ? items.filter(
            (i) =>
              !i.ref &&
              i.kind === m[1].toLowerCase() &&
              i.number === m[2] &&
              i.title === title,
          )
        : [];
      if (exact.length === 1) item = exact[0];
    }
    if (item && !used.has(item)) {
      matched.set(r.ref, item);
      used.add(item);
    }
  }
  return matched;
}
export const manuscriptNumberingInstructions = `When writing a manuscript, use a coherent mathematical-paper numbering convention, normally one shared result counter per section across theorems, lemmas, propositions and corollaries, unless the existing paper or journal specifies another convention. Number by manuscript order, not by certificate-panel order. Preserve stable research/connections.json node ids when results move. For Markdown, use ordinary numbered headings such as ### Lemma 2.1: Stability and immediately follow each result heading with <!-- axiovela-result: idea:stable-id --> (or claim:stable-id for an existing claim). Keep visible headings and cross-references consistent when renumbering. For LaTeX, use amsthm theorem environments and put \\label{idea:stable-id} or \\label{claim:stable-id} inside each result; use \\ref for cross-references. The app reads the actual compiled labels, including custom numbering. Place a proof with its parent result; do not allocate an independent proof number. If a proof has its own existing graph node, anchor its Markdown Proof heading or LaTeX proof environment with that node id and retain its directed supports/proves link to the parent result. Do not assign manuscript numbers to working results that have not been included in the chosen draft. Markdown and LaTeX are independent drafts: update only the requested format, preserve the other. Numbering never implies that a proposed theorem has been proved or formally certified.`;
