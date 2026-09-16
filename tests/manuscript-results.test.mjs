import test from "node:test";
import assert from "node:assert/strict";
import {
  manuscriptResults,
  parseAuxLabels,
} from "../shared/manuscript-results.mjs";
import {
  certificateOutline,
  certificateProgress,
} from "../shared/certificate-results.mjs";
const results = [
  { ref: "idea:main", kind: "theorem", title: "Main target", mainResult: true },
  { ref: "idea:helper", kind: "lemma", title: "Helper" },
  { ref: "idea:proof", kind: "proof", title: "Supporting argument" },
  { ref: "idea:future", kind: "claim", title: "Future target" },
];
const md =
  "## 2. Main argument\n### Lemma 2.1: Stability\n<!-- axiovela-result: idea:helper -->\n\nA statement.\n### Theorem 2.2: Convergence\n<!-- axiovela-result: idea:main -->\n### Proof of Theorem 2.2\n<!-- axiovela-result: idea:proof -->\n";
test("manuscript order and numbering are shared, stable references survive renumbering, proofs follow parents", () => {
  const links = [{ from: "idea:proof", to: "idea:main", type: "proves" }];
  const list = certificateOutline(results, links, {
    source: md,
    format: "markdown",
  });
  assert.deepEqual(
    list.map((x) => x.label),
    ["Lemma 2.1", "Theorem 2.2", "Proof of Theorem 2.2", "Claim"],
  );
  assert.equal(list.at(-1).section, "Working results");
  const reordered = certificateOutline(results, links, {
    source: md.replaceAll("2.1", "3.4").replaceAll("2.2", "3.5"),
    format: "markdown",
  });
  assert.equal(reordered[1].ref, "idea:main");
  assert.equal(reordered[1].label, "Theorem 3.5");
  assert.equal(certificateProgress(reordered, {}).certified, 0);
});
test("unlinked or ambiguous results are not assigned invented paper numbers", () => {
  assert.ok(
    certificateOutline(results).every(
      (r) => r.section === "Working results" && !/\d/.test(r.label),
    ),
  );
  const duplicated = md + md;
  assert.ok(
    certificateOutline(results, [], { source: duplicated }).every(
      (r) => r.section === "Working results",
    ),
  );
  assert.equal(manuscriptResults("```md\n" + md + "\n```").length, 0);
});
test("LaTeX uses compiled labels, not guesses about macros or counters; stale compiles cannot supply numbers", () => {
  const source = String.raw`\documentclass{article}\newtheorem{thm}{Theorem}[section]\newtheorem{lem}[thm]{Lemma}\begin{document}\section{Results}\begin{lem}[Stability]\label{idea:helper}a\end{lem}\begin{thm}[Convergence]\label{idea:main}b\end{thm}\end{document}`;
  const labels = parseAuxLabels(
    String.raw`\newlabel{idea:helper}{{A.3}{1}}\newlabel{idea:main}{{A.4}{1}{Convergence}{thm.4}{}}\newlabel{bad}{{999}{1}}`,
  );
  const list = certificateOutline(results, [], {
    source,
    format: "latex",
    compiled: { source, labels },
  });
  assert.deepEqual(
    list.slice(0, 2).map((r) => r.label),
    ["Lemma A.3", "Theorem A.4"],
  );
  assert.match(
    certificateOutline(results, [], {
      source,
      format: "latex",
      compiled: { source: "stale", labels },
    })[0].label,
    /render to number/,
  );
  assert.equal(
    certificateOutline(results, [], {
      source: md,
      format: "markdown",
      compiled: { source, labels },
    })[0].label,
    "Lemma 2.1",
  );
});
