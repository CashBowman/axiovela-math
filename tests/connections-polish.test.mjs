import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { blankProject } from "../shared/research.mjs";
import { addLibrarySources } from "../shared/library.mjs";
import { sourceForReference } from "../shared/assistant-output.mjs";
import { readingIdentity } from "../shared/reading-annotations.mjs";
import { prepareReadingFeedback } from "../server/reading-feedback.mjs";
import { mergeSourceConnections } from "../shared/source-connections.mjs";
import { Store } from "../server/store.mjs";

test("cross-publisher duplicates retain user identity, notes, aliases, citations and read state without repeated migration", async () => {
  const a = {
    id: "user",
    title: "Flow Matching on General Geometries",
    arxivId: "2302.03660",
    sourceType: "pdf",
    notes: "Exact assumptions",
    read: true,
    citationKey: "userKey",
  };
  const b = {
    id: "ai",
    title: "Flow Matching on General Geometries",
    sourceUrl: "https://example.org/proceedings",
    sourceType: "pdf",
    notes: "Theorem 2",
    discovered: true,
    citationKey: "aiKey",
  };
  const p = {
    ...blankProject("p"),
    papers: [a, b],
    links: [{ id: "edge", from: "paper:ai", to: "claim:C1", type: "uses" }],
    bibliography: "@misc{aiKey,title={Keep my custom entry}}",
  };
  const patch = addLibrarySources(p, []),
    next = { ...p, ...patch };
  assert.equal(patch.papers.length, 1);
  assert.equal(patch.papers[0].id, "user");
  assert.equal(patch.papers[0].read, true);
  assert.equal(patch.papers[0].discovered, false);
  assert.match(patch.papers[0].notes, /Exact assumptions\n\nTheorem 2/);
  assert.ok(patch.papers[0].aliases.includes("ai"));
  assert.equal(patch.links[0].from, "paper:user");
  assert.match(patch.bibliography, /Keep my custom entry/);
  assert.equal(
    sourceForReference({ path: "papers/ai.pdf" }, next.papers).id,
    "user",
  );
  assert.deepEqual(addLibrarySources(next, [b]), {});
  assert.deepEqual(addLibrarySources(next, []), {});
  const originalTarget = { kind: "paper", id: "ai" },
    sourceHash = createHash("sha256")
      .update(readingIdentity(p, originalTarget))
      .digest("hex");
  next.manuscriptComments = [
    {
      id: "note",
      target: originalTarget,
      sourceHash,
      anchor: { quote: "Original PDF selection" },
      comment: "Check scope.",
    },
  ];
  assert.equal(prepareReadingFeedback(next, ["note"], "research").length, 1);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-backup-"));
  try {
    const store = new Store(dir);
    let state = await store.read();
    state.projects = [p];
    state.activeProjectId = "p";
    state = await store.save(state, 0);
    state.projects = [next];
    await store.save(state, 1);
    const backup = JSON.parse(
      await fs.readFile(path.join(dir, "backups/before-source-merge-1.json")),
    );
    assert.equal(backup.projects[0].papers.length, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("source matching is conservative for short/generic titles and handles arXiv variants", () => {
  const p = { ...blankProject("p"), papers: [{ id: "a", title: "A theorem" }] };
  assert.equal(
    addLibrarySources(p, [{ id: "b", title: "A theorem" }]).papers.length,
    2,
  );
  const arxiv = {
    ...p,
    papers: [{ id: "a", arxivId: "2302.03660v2", title: "Original article" }],
  };
  assert.equal(
    addLibrarySources(arxiv, [
      {
        id: "b",
        sourceUrl: "https://arxiv.org/pdf/2302.03660.pdf",
        title: "An alternate title",
      },
    ]).papers.length,
    1,
  );
});
test("AI map imports typed ideas and source context without granting proof or review status", () => {
  const p = {
    ...blankProject("p"),
    papers: [{ id: "s", aliases: ["old"], notes: "Manual note" }],
  };
  const input = {
    nodes: [
      {
        id: "t",
        kind: "theorem",
        title: "Curvature bound",
        text: "Under compactness.",
        status: "verified",
      },
      { id: "proof", kind: "proof", title: "Argument", text: "A gap remains." },
    ],
    sourceNotes: [{ source: "paper:old", text: "Theorem 2, page 4." }],
    links: [
      {
        from: "idea:proof",
        to: "idea:t",
        type: "proves",
        reason: "Proposed argument; gap remains.",
      },
      {
        from: "idea:t",
        to: "paper:old",
        type: "uses",
        reason: "Assumes compactness.",
      },
      { from: "idea:t", to: "paper:missing", type: "uses", reason: "Invalid." },
    ],
  };
  const patch = mergeSourceConnections(p, input);
  assert.equal(patch.graphNodes.length, 2);
  assert.equal(patch.links.length, 2);
  assert.ok(patch.graphNodes.every((n) => n.status === "unverified"));
  assert.equal(patch.sourceNotes["paper:s"], "Theorem 2, page 4.");
  assert.equal(p.papers[0].notes, "Manual note");
  assert.deepEqual(mergeSourceConnections({ ...p, ...patch }, input), {});
});
test("panel snapshots route to the correct assistant and retain their quoted context", () => {
  const p = blankProject("p"),
    target = {
      kind: "panel",
      id: "snapshot",
      title: "Certificate checks",
      source: "No formal source saved yet",
      role: "research",
    };
  p.manuscriptComments = [
    {
      id: "a",
      target,
      anchor: { quote: target.source },
      comment: "Explain this.",
      sourceHash: createHash("sha256")
        .update(readingIdentity(p, target))
        .digest("hex"),
    },
  ];
  assert.equal(
    prepareReadingFeedback(p, ["a"], "research")[0].title,
    "Certificate checks (selected snapshot)",
  );
  assert.throws(
    () => prepareReadingFeedback(p, ["a"], "writing"),
    /another assistant/,
  );
});

test("selected AI graph nodes supply context to the Math Assistant", async () => {
  const { libraryContext } = await import("../shared/harness.mjs");
  const p = {
    ...blankProject("p"),
    graphNodes: [
      {
        id: "proof",
        kind: "proof",
        title: "A candidate proof",
        text: "One gap remains.",
        status: "unverified",
      },
    ],
  };
  assert.match(
    libraryContext(p, { kind: "idea", id: "proof" }),
    /One gap remains/,
  );
  assert.throws(
    () => libraryContext(p, { kind: "idea", id: "missing" }),
    /no longer exists/,
  );
});

test("AI corrections invalidate old claim reviews and explicitly remove obsolete graph items", () => {
  const claim = {
    id: "C1",
    statement: "All objects satisfy the bound.",
    revision: 2,
    status: "human-reviewed",
    reviewer: "Reviewer",
    reviewNote: "Prior review",
  };
  const p = {
    ...blankProject("p"),
    claims: [claim],
    graphNodes: [{ id: "old", kind: "proof", origin: "assistant" }],
    links: [{ id: "l", from: "idea:old", to: "claim:C1", type: "supports" }],
  };
  const patch = mergeSourceConnections(p, {
    claimUpdates: [
      {
        id: "C1",
        baseRevision: 2,
        statement: "Compact objects satisfy the bound.",
        status: "human-reviewed",
        reviewNote: "Cannot carry this forward",
      },
    ],
    removeNodes: ["old"],
  });
  assert.equal(patch.claims[0].revision, 3);
  assert.equal(patch.claims[0].status, "conjecture");
  assert.equal(patch.claims[0].reviewNote, "");
  assert.equal(patch.claims[0].priorRevisions[0].reviewer, "Reviewer");
  assert.equal(patch.graphNodes.length, 0);
  assert.equal(patch.links.length, 0);
  assert.deepEqual(
    mergeSourceConnections(
      { ...p, ...patch },
      {
        claimUpdates: [{ id: "C1", baseRevision: 2, statement: "Stale edit" }],
      },
    ),
    {},
  );
});

test("summary feedback is revision-bound and rejects an earlier summary after editing", () => {
  const p = { ...blankProject("p"), summary: "The assumptions need checking." },
    target = { kind: "summary" };
  p.manuscriptComments = [
    {
      id: "s",
      target,
      anchor: { quote: p.summary },
      comment: "Clarify.",
      sourceHash: createHash("sha256")
        .update(readingIdentity(p, target))
        .digest("hex"),
    },
  ];
  assert.equal(
    prepareReadingFeedback(p, ["s"], "research")[0].title,
    "Executive summary",
  );
  p.summary = "Revised assumptions.";
  assert.throws(() => prepareReadingFeedback(p, ["s"], "research"), /changed/);
});
