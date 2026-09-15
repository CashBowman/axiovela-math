import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  sentenceBounds,
  quoteAnchor,
  reviewDraft,
  changedPassage,
} from "../shared/annotations.mjs";
import { prepareManuscriptReview } from "../server/manuscript-review.mjs";
test("selection expands to full sentences while retaining paragraph boundaries", () => {
  const text =
    "Heading\n\nFirst sentence. A longer second sentence.\n\nThird paragraph.";
  const start = text.indexOf("longer");
  const bounds = sentenceBounds(text, start, start + 3);
  assert.equal(
    text.slice(bounds.start, bounds.end),
    "A longer second sentence.",
  );
  const across = sentenceBounds(
    text,
    text.indexOf("second"),
    text.indexOf("paragraph") + 3,
  );
  assert.equal(
    text.slice(across.start, across.end),
    "A longer second sentence.\n\nThird paragraph.",
  );
  const last = sentenceBounds(text, text.length);
  assert.equal(text.slice(last.start, last.end), "Third paragraph.");
  const first = sentenceBounds(text, text.indexOf("First") + 2);
  assert.equal(text.slice(first.start, first.end), "First sentence.");
  const anchor = quoteAnchor(text, bounds.start, bounds.end);
  assert.equal(anchor.quote, "A longer second sentence.");
  assert.ok(anchor.prefix.includes("First sentence."));
});
test("review proposals require a single complete fenced manuscript", () => {
  assert.equal(
    reviewDraft(
      "Here is the revision:\n```markdown\n# Revised\n```",
      "markdown",
    ),
    "# Revised\n",
  );
  assert.throws(() => reviewDraft("Explanation only", "markdown"));
  assert.throws(() =>
    reviewDraft("```markdown\none\n```\n```markdown\ntwo\n```", "markdown"),
  );
  assert.throws(() => reviewDraft("```latex\nwrong format\n```", "markdown"));
  assert.deepEqual(changedPassage("one\ntwo\nthree", "one\nrevised\nthree"), {
    line: 1,
    before: "one\ntwo\nthree",
    after: "one\nrevised\nthree",
  });
});
test("review snapshots bind selected comments to current source, bibliography and role", () => {
  const p = {
    markdown: "Draft",
    latex: "TeX",
    bibliography: "",
    manuscriptComments: [],
  };
  const hash = createHash("sha256").update("Draft\0").digest("hex");
  p.manuscriptComments = [
    {
      id: "a",
      format: "markdown",
      sourceHash: hash,
      anchor: { quote: "Draft", start: 0, end: 5 },
      comment: "Explain.",
      resolved: false,
    },
    {
      id: "b",
      format: "markdown",
      sourceHash: hash,
      anchor: { quote: "Draft" },
      comment: "Unselected.",
      resolved: false,
    },
  ];
  const r = { format: "markdown", sourceHash: hash, commentIds: ["a"] };
  assert.equal(
    prepareManuscriptReview(p, r, "writing", "markdown").comments.length,
    1,
  );
  assert.throws(() =>
    prepareManuscriptReview(
      { ...p, bibliography: "changed" },
      r,
      "writing",
      "markdown",
    ),
  );
  assert.throws(() => prepareManuscriptReview(p, r, "research", "markdown"));
  assert.throws(() =>
    prepareManuscriptReview(
      p,
      { ...r, commentIds: ["a", "a"] },
      "writing",
      "markdown",
    ),
  );
  p.manuscriptComments[0].resolved = true;
  assert.throws(() => prepareManuscriptReview(p, r, "writing", "markdown"));
});
