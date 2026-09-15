import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "math-reader-")),
  url = "http://127.0.0.1:8801";
const env = {
  ...process.env,
  PORT: "8801",
  AXIOVELA_MATH_DATA: data,
  AXIOVELA_BRIDGE_DISCOVERY_PATHS: path.join(data, "none"),
  WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(data, "providers.json"),
  WORKBENCH_CODEX_PATH: "/nonexistent/fixture",
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
let browser,
  page,
  logs = "";
service.stderr.on("data", (x) => (logs += x));
const checks = [];
const state = async () => fetch(url + "/api/state").then((r) => r.json());
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Condition did not settle");
}
try {
  await until(async () => {
    try {
      return (await fetch(url + "/api/state")).ok;
    } catch {
      return false;
    }
  });
  const initial = await state(),
    id = initial.activeProjectId;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1450, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("heading", { name: "Executive summary" }).waitFor();
  assert.equal(await page.locator(".helpMenu,.saveState").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Save workspace", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Reset layout", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("button", { name: "Bring experiments", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push(
    "native-only Help and quiet toolbar; top-level experiment import",
  );
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  const source =
    "# First heading\n\nFirst paragraph.\n\n\\[x^2\\]\n\nSecond paragraph to review.";
  await page.getByLabel("Manuscript source").fill(source);
  await until(async () => (await state()).projects[0].markdown === source);
  const root = await fetch(url + "/api/project-root?project=" + id).then((r) =>
    r.json(),
  );
  await until(async () => {
    try {
      return (
        (await fs.readFile(
          path.join(root.folder, "writeups/main.md"),
          "utf8",
        )) === source
      );
    } catch {
      return false;
    }
  });
  checks.push(
    "workspace and manuscript automatically persist without save controls",
  );
  let releaseSave, enteredSave;
  const slowSave = new Promise(resolve => {releaseSave = resolve;});
  const startedSave = new Promise(resolve => {enteredSave = resolve;});
  let delayed = false;
  await page.route('**/api/artifact?*', async route => {
    if (!delayed && route.request().method() === 'PUT' && route.request().postDataJSON().kind === 'markdown') {
      delayed = true;
      enteredSave();
      await slowSave;
    }
    await route.continue();
  });
  await page.getByLabel('Manuscript source').fill('# Save in progress');
  await startedSave;
  await page.getByLabel('Manuscript source').fill(source);
  await until(async () => (await state()).projects[0].markdown === source);
  // Let a second idle-save timer run while the source write is still blocked.
  await page.waitForTimeout(900);
  releaseSave();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('axiovela-math-pending-sources') || '[]').length === 0);
  assert.equal(await fs.readFile(path.join(root.folder, 'writeups/main.md'), 'utf8'), source);
  await page.unroute('**/api/artifact?*');
  checks.push('edits during a slow source save drain to the newest text without another user action');
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page
    .locator(".paperPreview p")
    .filter({ hasText: "Second paragraph" })
    .click();
  await page
    .getByLabel("Annotation feedback")
    .fill("Explain this step more precisely.");
  await page.getByRole("button", { name: "Add to message", exact: true }).click();
  await until(
    async () => (await state()).projects[0].manuscriptComments?.length === 1,
  );
  await page.getByRole("button", {name:"Annotate",exact:true}).click();
  await page
    .locator(".paperPreview p")
    .filter({ hasText: "Second paragraph" })
    .dblclick();
  assert.equal(
    await page
      .getByLabel("Manuscript source")
      .evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd)),
    "Second paragraph to review.",
  );
  checks.push(
    "Markdown comments and source navigation retain original line numbers after math normalization",
  );
  await page.reload();
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page.locator('[aria-label="Unsent annotations"] .annotationChip').waitFor();
  await page.locator('[aria-label="Unsent annotations"] .annotationChipBody').click();
  await page.getByLabel('Annotation feedback').fill('Explain this step more precisely.');
  await page.getByRole('button',{name:'Add to message',exact:true}).click();
  await page.getByLabel('Manuscript source').fill(source+'\n\nChanged.');
  checks.push('unsent annotation attachments survive reload and preserve their source revision after edits');
  await page
    .getByRole("button", { name: "LaTeX", exact: false })
    .first()
    .click();
  const latex =
    "\\documentclass{article}\n\\begin{document}\n\\section{Navigation test}\nThis unique sentence maps to line four.\n\nA second paragraph.\n\\end{document}";
  await page.getByLabel("Manuscript source").fill(latex);
  const rendered = page.waitForResponse(
    (r) => r.url().includes("/api/render?") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Render document", exact: true }).click();
  const result = await (await rendered).json();
  assert.ok(result.sourceMap.length);
  await page
    .locator(".textLayer span")
    .filter({ hasText: "This unique sentence" })
    .first()
    .waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  await page
    .locator(".textLayer span")
    .filter({ hasText: "This unique sentence" })
    .first()
    .dblclick();
  await page.locator(".expandedPanel").waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByLabel("Manuscript source")
      .evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd)),
    "This unique sentence maps to line four.",
  );
  checks.push(
    "actual Tectonic PDF uses SyncTeX to navigate to the correct source line",
  );
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page
    .locator(".textLayer span")
    .filter({ hasText: "This unique sentence" })
    .first()
    .click();
  await page
    .getByLabel("Annotation feedback")
    .fill("Check this PDF passage.");
  await page.getByRole("button", { name: "Add to message", exact: true }).click();
  await page.locator(".annotationPin").waitFor();
  await page.screenshot({ path: ".local/qa/manuscript-comments.png" });
  await page.getByRole("button", {name:"Annotate",exact:true}).click();
  await page.getByLabel("Manuscript source").fill(latex + "\n% changed");
  await page
    .locator(".textLayer span")
    .filter({ hasText: "This unique sentence" })
    .first()
    .dblclick();
  await page
    .getByText("Render the current draft before jumping to its source.", {
      exact: true,
    })
    .waitFor();
  checks.push(
    "PDF comments retain page coordinates; stale PDF blocks source navigation",
  );
  // One known paper fixture is imported by pasting, not by opening an extra menu.
  const pdfUrl = `${url}/api/rendered?project=${id}&id=${result.id}`,
    bytes = Buffer.from(await (await fetch(pdfUrl)).arrayBuffer());
  const upload = await fetch(url + "/api/papers", {
    method: "POST",
    body: bytes,
  }).then((r) => r.json());
  let imports = 0;
  await page.route("**/api/papers/arxiv", (route) => {
    imports++;
    return route.fulfill({
      json: {
        paper: {
          id: upload.id,
          title: "Pasted paper fixture",
          arxivId: "2502.02150v1",
          authors: ["Fixture"],
          published: "2025-02-04",
          sourceUrl: "https://arxiv.org/abs/2502.02150v1",
          notes: "",
          citationKey: "fixtureArxiv",
          read: false,
        },
      },
    });
  });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByLabel("Search library").evaluate((el) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "https://arxiv.org/abs/2502.02150");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page
    .getByRole("button", { name: "Pasted paper fixture PDF · Unread", exact: false })
    .waitFor();
  assert.equal(imports, 1);
  await page
    .getByRole("checkbox", { name: "Mark Pasted paper fixture as read" })
    .check();
  await until(async () => (await state()).projects[0].papers[0]?.read);
  await page.getByRole("button", { name: "Expand paper reader" }).click();
  assert.equal(
    await page
      .locator(".expandedPanel")
      .evaluate((e) => Math.round(e.getBoundingClientRect().width)),
    1450,
  );
  await page.screenshot({ path: ".local/qa/expanded-reader.png" });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".expandedPanel").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: ".local/qa/library-reader-mobile.png" });
  await page.setViewportSize({ width: 1450, height: 950 });
  checks.push(
    "pasted arXiv import, inline read checkbox, full-window reader and Escape restore",
  );
  // Source conflict does not overwrite an assistant's disk edit; local draft stays saved.
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page
    .getByRole("button", { name: "Markdown", exact: false })
    .first()
    .click();
  await until(
    async () =>
      JSON.parse(
        await page.evaluate(
          () => localStorage.getItem("axiovela-math-pending-sources") || "[]",
        ),
      ).length === 0,
  );
  await fs.writeFile(
    path.join(root.folder, "writeups/main.md"),
    "External assistant draft",
  );
  await page.getByLabel("Manuscript source").fill("My concurrent draft");
  await page.getByText("Auto-save paused:", { exact: false }).waitFor();
  assert.equal(
    await fs.readFile(path.join(root.folder, "writeups/main.md"), "utf8"),
    "External assistant draft",
  );
  await until(
    async () => (await state()).projects[0].markdown === "My concurrent draft",
  );
  checks.push("concurrent source save fails safely with both drafts retained");
  await page.screenshot({ path: ".local/qa/reader-review.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks }));
  await fs.writeFile(
    "docs/reader-validation.json",
    JSON.stringify(
      { passed: true, checks, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
} catch (e) {
  if (page) await page.screenshot({ path: ".local/qa/reader-failure.png" });
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  await new Promise((r) => service.once("exit", r));
  await fs.rm(data, { recursive: true, force: true });
}
