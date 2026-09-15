import test from "node:test";
import assert from "node:assert/strict";
import {
  certificateResults,
  resultCheckState,
  certificateProgress,
} from "../shared/certificate-results.mjs";
import { mergeSourceConnections } from "../shared/source-connections.mjs";
import { taskInstructions } from "../shared/harness.mjs";
import { leanSnapshot } from "../server/lean-workspace.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const project = {
  claims: [{ id: "C1", statement: "A conjecture", status: "human-reviewed" }],
  papers: [],
  graphNodes: [
    {
      id: "main",
      kind: "theorem",
      title: "Main result",
      text: "A proposed theorem.",
      mainResult: true,
    },
    { id: "helper", kind: "lemma", title: "Helper", text: "A needed lemma." },
  ],
};
test("result selection uses exact mappings and never confuses project compilation with certification", () => {
  const data = {
      sourceHash: "abc",
      records: [{ status: "build-passed", formalCertificate: true }],
      plan: {
        results: [
          {
            ref: "idea:helper",
            declarations: ["helper"],
            formalCertificate: true,
          },
        ],
      },
    },
    results = certificateResults(project, data);
  assert.equal(results.length, 3);
  assert.equal(resultCheckState(results[1], data).label, "Not formalized");
  assert.equal(
    resultCheckState(results[2], data).label,
    "Project build passed",
  );
  assert.equal(certificateProgress(results, data).certified, 0);
  assert.equal(certificateProgress(results, data).linked, 1);
  assert.equal(
    resultCheckState(results[2], { ...data, stale: true }).label,
    "Needs recheck",
  );
  assert.equal(
    resultCheckState(results[2], { ...data, sourceHash: null }).label,
    "Source missing",
  );
  assert.equal(
    resultCheckState({ ...results[2], formal: { declarations: [] } }, data)
      .label,
    "Mapping incomplete",
  );
});
test("legacy formalization stays selectable without attributing it to unrelated research claims", () => {
  const data = {
      plan: {
        title: "Legacy target",
        statement: "True",
        declarations: ["old"],
      },
      sourceHash: "abc",
    },
    results = certificateResults(project, data);
  assert.equal(results[0].ref, "formal:main");
  assert.equal(results[0].formal, data.plan);
  assert.equal(resultCheckState(results[1], data).label, "Not formalized");
});
test("assistant lemmas and main-result roles import without forged verdicts, and stable ids update", () => {
  let patch = mergeSourceConnections(project, {
    nodes: [
      {
        id: "helper",
        kind: "lemma",
        title: "New helper",
        text: "Explicit hypotheses.",
        mainResult: true,
        status: "verified",
      },
    ],
    links: [
      {
        from: "idea:main",
        to: "idea:helper",
        type: "depends on",
        reason: "Uniform control requires the helper under compactness.",
      },
    ],
  });
  assert.equal(patch.graphNodes.length, 2);
  assert.equal(patch.graphNodes[1].status, "unverified");
  assert.equal(patch.graphNodes[1].mainResult, true);
  assert.equal(patch.links.length, 1);
});
test("research and formalization recipes require automatic result artifacts, explicit dependencies and access honesty", () => {
  for (const role of ["research", "lean"]) {
    const prompt = taskInstructions(role);
    assert.match(prompt, /result outline automatically/);
    assert.match(prompt, /kind \(claim, theorem, lemma, proof\)/);
    assert.match(prompt, /A depends on B means A requires B/);
    assert.match(prompt, /read-only access/);
    assert.match(prompt, /results:\[/);
  }
});
test("saved result mappings omit assistant verdicts and validate endpoint references", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "math-result-mapping-"));
  try {
    await fs.mkdir(path.join(dir, "certificates"));
    await fs.writeFile(
      path.join(dir, "certificates/certificate.json"),
      JSON.stringify({
        results: [
          {
            ref: "idea:main",
            declarations: ["Main.result"],
            verified: true,
            status: "certified",
            obligations: ["Audit scope"],
          },
          { ref: "../../bad", declarations: ["x"] },
        ],
      }),
    );
    const data = await leanSnapshot(dir);
    assert.equal(data.plan.results.length, 1);
    assert.deepEqual(data.plan.results[0], {
      ref: "idea:main",
      declarations: ["Main.result"],
      assumptions: [],
      obligations: ["Audit scope"],
      scopeNotes: "",
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
