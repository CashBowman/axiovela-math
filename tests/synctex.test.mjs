import test from "node:test";
import assert from "node:assert/strict";
import { parseSyncTeX, sourceAt } from "../shared/synctex.mjs";
import { normalizeMath } from "../src/markdown-format.mjs";
test("SyncTeX source records retain page and line, convert TeX scaled points to PDF points", () => {
  const map = parseSyncTeX(
    "Input:1:/temporary/export/main.tex\nMagnification:1000\nUnit:1\nX Offset:0\nY Offset:0\n{1\ng1,9:6553600,13107200\n{2\ng1,22:6553600,19660800",
  );
  assert.ok(Math.abs(map[0].x - 99.6264) < 0.001);
  assert.equal(sourceAt(map, 2, 100, 299).line, 22);
  assert.equal(sourceAt(map, 3, 0, 0), null);
  assert.throws(() => sourceAt(map, 1, NaN, 0));
});
test("display math normalization preserves original Markdown line anchors", () => {
  const source = "# Heading\n\n\\[x^2\\]\n\nTarget paragraph",
    lines = [];
  const result = normalizeMath(source, lines);
  assert.equal(lines[result.split("\n").indexOf("Target paragraph")], 5);
  assert.equal(lines[result.split("\n").indexOf("x^2")], 3);
});
