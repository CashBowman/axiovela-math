import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const data = await fs.mkdtemp(
    path.join(os.tmpdir(), "math-connections-polish-"),
  ),
  url = "http://127.0.0.1:8805";
const env = {
  ...process.env,
  PORT: "8805",
  AXIOVELA_MATH_DATA: data,
  AXIOVELA_BRIDGE_DISCOVERY_PATHS: path.join(data, "none"),
  WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(data, "providers.json"),
  WORKBENCH_CODEX_PATH: path.resolve("scripts/fixtures/assistant-rpc.mjs"),
  AXIOVELA_LAKE_PATH: "/nonexistent/fixture",
};
for (const key of [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "WORKBENCH_COMPATIBLE_API_KEY",
])
  delete env[key];
const service = spawn(process.execPath, ["server/index.mjs"], {
  env,
  stdio: "pipe",
});
let logs = "",
  browser,
  page;
service.stderr.on("data", (x) => (logs += x));
const checks = [];
const api = async (route, body) => {
  const r = await fetch(
    url + route,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const value = await r.json();
  if (!r.ok) throw Error(value.error);
  return value;
};
async function until(fn) {
  for (let i = 0; i < 250; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out");
}
async function selectText(locator, startText, endText = startText) {
  await locator.evaluate(
    (root, { startText, endText }) => {
      const nodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n,
        text = "";
      while ((n = walker.nextNode())) {
        nodes.push({ node: n, start: text.length });
        text += n.textContent;
      }
      const start = text.indexOf(startText),
        end = text.indexOf(endText, start) + endText.length;
      if (start < 0 || end < start) throw Error("Selection text missing");
      const a = nodes.findLast((x) => x.start <= start),
        b = nodes.findLast((x) => x.start < end),
        range = document.createRange();
      range.setStart(a.node, start - a.start);
      range.setEnd(b.node, end - b.start);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const rect = range.getBoundingClientRect();
      root.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          clientX: rect.left + 3,
          clientY: rect.top + 3,
        }),
      );
    },
    { startText, endText },
  );
}
async function note(text) {
  await page.getByLabel("Annotation feedback").fill(text);
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Add annotation" })
    .waitFor({ state: "hidden" });
}
try {
  await until(async () => {
    try {
      return (await fetch(url + "/api/state")).ok;
    } catch {
      return false;
    }
  });
  const state = await api("/api/state"),
    id = state.activeProjectId,
    root = (await api("/api/project-root?project=" + id)).folder;
  const title = "Flow Matching on General Geometries";
  state.projects[0].summary =
    "The geometric assumptions need careful justification. The next step is an exact comparison.";
  state.projects[0].papers = [
    {
      id: "original",
      title,
      sourceType: "web",
      sourceUrl: "https://example.org/arxiv",
      text: "A saved source explains the geometric assumptions.",
      contentVersion: 3,
      read: true,
      notes: "Keep this note.",
      citationKey: "original",
    },
    {
      id: "duplicate",
      title,
      sourceType: "web",
      sourceUrl: "https://example.org/proceedings",
      text: "A saved source explains the geometric assumptions.",
      contentVersion: 3,
      discovered: true,
      read: false,
      notes: "Compare Theorem 2.",
      citationKey: "duplicate",
    },
    {
      id: "ai-source",
      title: "An independent source on compact manifolds",
      sourceType: "web",
      sourceUrl: "https://example.org/manifolds",
      text: "An independent mathematical argument.",
      contentVersion: 3,
      discovered: true,
      notes: "",
      citationKey: "independent",
    },
  ];
  const response = await fetch(url + "/api/state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": String(state.revision),
    },
    body: JSON.stringify(state),
  });
  assert.ok(response.ok);
  await fs.writeFile(
    path.join(root, "research/connections.json"),
    JSON.stringify({
      nodes: [
        {
          id: "c",
          kind: "claim",
          title: "Candidate estimate",
          text: "A conjectured estimate.",
        },
        {
          id: "t",
          kind: "theorem",
          title: "Compactness theorem",
          text: "Assume compactness.",
        },
        {
          id: "p",
          kind: "proof",
          title: "Proof sketch",
          text: "One obligation remains.",
        },
      ],
      sourceNotes: [
        { source: "paper:duplicate", text: "Theorem 2 requires compactness." },
      ],
      links: [
        {
          from: "idea:c",
          to: "idea:t",
          type: "depends on",
          reason: "Uses compactness.",
        },
        {
          from: "idea:t",
          to: "paper:duplicate",
          type: "uses",
          reason: "Exact source hypotheses.",
        },
        {
          from: "idea:p",
          to: "idea:c",
          type: "supports",
          reason: "An unfinished argument.",
        },
      ],
    }),
  );
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page
    .getByRole("heading", { name: "Executive summary", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Choose research model and provider" })
    .click();
  await page.getByRole("button", { name: "Use model", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await selectText(
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Executive summary",
          exact: true,
        }),
      })
      .locator(".markdown p")
      .first(),
    "geometric assumptions",
  );
  await page.getByLabel("Annotation feedback").fill("A canceled thought.");
  await page
    .getByRole("heading", { name: "Math Assistant", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Add annotation" })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page
      .locator('[aria-label="Unsent annotations"] .annotationChip')
      .count(),
    0,
  );
  await selectText(
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Executive summary",
          exact: true,
        }),
      })
      .locator(".markdown p")
      .first(),
    "geometric assumptions",
  );
  await note("Check the summary assumptions.");
  await page.locator(".annotationChipBody").click();
  await page
    .getByLabel("Annotation feedback")
    .fill("Check the exact summary assumptions.");
  await page
    .getByRole("button", { name: "Add to message", exact: true })
    .click();
  assert.equal(
    await page
      .locator('[aria-label="Unsent annotations"] .annotationChip')
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "Lean Certificates", exact: true })
    .click();
  await selectText(
    page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Certificate checks",
          exact: true,
        }),
      })
      .getByRole("heading", {
        name: "No formal source saved yet",
        exact: true,
      }),
    "No formal source",
  );
  await note("Explain this check status.");
  assert.equal(
    await page
      .locator('[aria-label="Unsent annotations"] .annotationChip')
      .count(),
    2,
  );
  await page.getByLabel("research message").fill("FIXTURE_PROMPT");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await until(async () => {
    const chats = (await api("/api/conversations?project=" + id)).conversations;
    return chats.some((c) =>
      c.turns.some(
        (t) => t.status === "complete" && t.annotations?.length === 2,
      ),
    );
  });
  checks.push(
    "summary and Lean feedback stays unsent, cancels cleanly, edits in place and sends to the shared Math Assistant",
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await until(async () => (await page.locator(".libraryItem").count()) === 5);
  assert.equal(
    await page
      .getByRole("heading", { name: "Notes & relationships", exact: true })
      .count(),
    0,
  );
  await page.getByLabel("Filter library").selectOption("web");
  assert.equal(await page.locator(".libraryItem").count(), 2);
  assert.equal(await page.getByLabel("AI-added source").count(), 1);
  assert.equal(
    await page.getByLabel("Mark " + title + " as read").isChecked(),
    true,
  );
  await page.getByLabel("Filter library").selectOption("all");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  assert.equal(await page.locator(".graphCanvas [data-node]").count(), 5);
  assert.equal(await page.locator(".graphCanvas polygon").count(), 2);
  assert.equal(await page.locator(".graphCanvas rect").count(), 3);
  assert.equal(await page.locator(".graphLegend>span").count(), 6);
  await page
    .getByRole("button", { name: "Select " + title, exact: true })
    .click();
  await page.locator(".graphInspector summary").click();
  await page
    .getByText("Theorem 2 requires compactness.", { exact: true })
    .waitFor();
  await page.getByText("Keep this note.", { exact: true }).waitFor();
  await page
    .getByRole("button", {
      name: "Ask Math Assistant to update connections",
      exact: true,
    })
    .click();
  assert.match(
    await page.getByLabel("research message").inputValue(),
    /research\/connections.json/,
  );
  await fs.mkdir(".local/qa", { recursive: true });
  await page.screenshot({ path: ".local/qa/connections-polish.png" });
  const saved = (await api("/api/state")).projects[0];
  assert.equal(saved.papers.length, 2);
  assert.ok(
    (await fs.readdir(path.join(data, "backups"))).some((n) =>
      n.startsWith("before-source-merge-"),
    ),
  );
  checks.push(
    "duplicate consolidation, read state and reversible backup; right-aligned AI badge; filters; typed AI map and source context",
  );
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  const welcome = page.locator(".chatWelcome p").first();
  await selectText(welcome, "Prepare the final paper");
  await note("Use precise mathematical exposition.");
  assert.equal(
    await page
      .locator('[aria-label="Unsent annotations"] .annotationChip')
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "LaTeX", exact: false })
    .first()
    .click();
  let renders = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/render?")) renders++;
  });
  const latex =
    "\\documentclass{article}\n\\begin{document}\nAutomatic rendering one.\n\\end{document}";
  await page.getByLabel("Manuscript source").fill(latex);
  await page
    .getByRole("region", { name: "Publication PDF", exact: true })
    .waitFor({ timeout: 120000 });
  const first = await page
    .getByRole("link", { name: "Open PDF", exact: true })
    .getAttribute("href");
  await page.getByLabel("Manuscript source").fill(latex.replace("one", "two"));
  await until(
    async () =>
      (await page
        .getByRole("link", { name: "Open PDF", exact: true })
        .getAttribute("href")) !== first,
  );
  assert.equal(renders, 2);
  assert.equal(
    await page.getByRole("button", { name: "Annotate", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText("PDF DOCUMENT PREVIEW", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByText("Preview generated prose and export from this pane.", {
        exact: true,
      })
      .count(),
    0,
  );
  assert.equal(
    await page
      .locator(".manuscriptPreview>.panelHead")
      .getByRole("button", { name: "Export PDF", exact: true })
      .count(),
    1,
  );
  assert.ok(
    await page
      .locator(".manuscriptPreview>.panelHead")
      .evaluate((el) => el.clientHeight < 125),
  );
  await page
    .locator(".manuscriptPreview .textLayer span")
    .filter({ hasText: "Automatic rendering two." })
    .first()
    .waitFor();
  await page.screenshot({ path: ".local/qa/compact-preview.png" });
  checks.push(
    "Publication feedback routes separately; two debounced automatic renders; compact preview with no stale banner or annotation toggle",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks }));
} catch (error) {
  await page
    ?.screenshot({ path: ".local/connections-failure.png" })
    .catch(() => {});
  console.error(error, logs);
  process.exitCode = 1;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  await new Promise((r) => service.once("exit", r));
  await fs.rm(data, { recursive: true, force: true });
}
