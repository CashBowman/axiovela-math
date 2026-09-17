import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "math-library-polish-")),
  url = "http://127.0.0.1:8803";
const env = {
  ...process.env,
  PORT: "8803",
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
  const source =
    "\\documentclass{article}\n\\title{A source with a readable title}\n\\begin{document}\n\\maketitle\nA first page for the persistent reader.\\newpage\nA second page for scrolling.\\newpage\nA third page.\n\\end{document}";
  const rendered = await api("/api/render?project=" + id, {
    source,
    bibliography: "",
  });
  const pdf = Buffer.from(
    await (
      await fetch(url + "/api/rendered?project=" + id + "&id=" + rendered.id)
    ).arrayBuffer(),
  );
  const paperId = "11111111-2222-3333-4444-555555555555";
  await fs.mkdir(path.join(root, "papers"), { recursive: true });
  await fs.writeFile(path.join(root, "papers", paperId + ".pdf"), pdf);
  await fs.writeFile(
    path.join(root, "research/summary.md"),
    "```markdown\n## Executive result\n\n**A precise summary** with $x^2$.\n```",
  );
  await fs.writeFile(
    path.join(root, "research/proof.md"),
    "```md\n## Proof argument\n\n1. First step.\n2. Second step with $y^2$.\n```",
  );
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("heading", { name: "Executive result" }).waitFor();
  await page.getByRole("heading", { name: "Proof argument" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Edit", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".markdown .katex").count(), 2);
  checks.push(
    "Executive summary and proof render Markdown and math without Edit buttons",
  );
  await until(async () =>
    (await api("/api/state")).projects[0].papers.some((p) => p.id === paperId),
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator(".pdfPage canvas").first().waitFor();
  // Keep object identity, paint pixels and scroll position across workspace tabs.
  await page.locator(".pdfCanvasScroll").evaluate((el) => {
    window.readerCanvas = el.querySelector("canvas");
    el.scrollTop = 300;
    window.readerScroll = el.scrollTop;
  });
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.getByRole("heading", { name: "Executive result" }).waitFor();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  assert.ok(
    await page
      .locator(".pdfCanvasScroll")
      .evaluate(
        (el) =>
          el.querySelector("canvas") === window.readerCanvas &&
          Math.abs(el.scrollTop - window.readerScroll) < 2,
      ),
  );
  checks.push(
    "Library preserves PDF canvas identity and reading position across tabs",
  );
  await page.getByRole("button", { name: "Zoom out PDF", exact: true }).click();
  const before = Number(
    await page.locator(".pdfReader").getAttribute("data-zoom"),
  );
  await page.getByRole("button", { name: "Expand paper reader" }).click();
  await until(
    async () =>
      Number(await page.locator(".pdfReader").getAttribute("data-zoom")) >
      before * 1.8,
  );
  await page.screenshot({ path: ".local/qa/library-fullscreen.png" });
  await page.getByRole("button", { name: "Restore paper reader" }).click();
  checks.push("Fullscreen refits the PDF even after manual zoom");
  const web = {
    id: "22222222-2222-3333-4444-555555555555",
    title: "Geometric intuition for a research argument",
    sourceUrl: "https://example.org/blog/geometry",
    sourceType: "web",
    contentVersion: 3,
    text: "An example blog source.\n\nIts claims still need to be checked against the original article.",
    citationKey: "geometryBlog",
    notes: "",
    read: false,
  };
  await page.route("**/api/library/link", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ paper: web }),
    }),
  );
  await page.getByLabel("Search library").evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, web.sourceUrl);
  await page.getByRole("heading", { name: web.title, level: 2 }).waitFor();
  await page.getByLabel("Filter library").selectOption("web");
  assert.equal(await page.locator(".libraryItem").count(), 1);
  await page.getByLabel("Filter library").selectOption("pdf");
  assert.equal(await page.locator(".libraryItem").count(), 1);
  await page.getByLabel("Filter library").selectOption("all");
  checks.push(
    "Pasted web links open readable snapshots and source-type filters organize the library",
  );
  const sourceButtons = page.locator('.libraryItem > button');
  await sourceButtons.last().click();
  await page.keyboard.press('ArrowUp');
  assert.equal(await sourceButtons.first().getAttribute('aria-pressed'), 'true');
  assert.equal(await sourceButtons.first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('ArrowUp');
  assert.equal(await sourceButtons.first().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('ArrowDown');
  await page.getByRole('heading', {name: web.title, level: 2}).waitFor();
  assert.equal(await sourceButtons.last().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await sourceButtons.last().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await sourceButtons.first().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('End');
  assert.equal(await sourceButtons.last().getAttribute('aria-pressed'), 'true');
  await page.getByLabel('Filter library').selectOption('pdf');
  assert.equal(await sourceButtons.count(), 1);
  assert.equal(await sourceButtons.first().getAttribute('tabindex'), '0');
  await sourceButtons.first().focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await sourceButtons.first().getAttribute('aria-pressed'), 'true');
  await page.getByLabel('Search library').fill('no matching keyboard fixture');
  assert.equal(await sourceButtons.count(), 0);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.getByLabel('Search library').evaluate(el => el === document.activeElement), true);
  await page.getByLabel('Search library').fill('');
  await page.getByLabel('Filter library').selectOption('all');
  const readBox = page.locator('.readToggle input').first();
  const wasRead = await readBox.isChecked();
  await readBox.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await sourceButtons.first().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Space');
  assert.equal(await readBox.isChecked(), !wasRead);
  await page.keyboard.press('Space');
  await sourceButtons.last().click();
  checks.push('Library arrows and Home/End move selection and focus; filters, empty search and read checkboxes retain normal behavior');
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("group", { name: "Source connections graph" }).waitFor();
  assert.equal(await page.locator(".graphCanvas [data-node]").count(), 2);
  await page
    .getByRole("button", { name: "Local connections", exact: true })
    .click();
  await page.getByRole("button", { name: "Zoom graph in" }).click();
  await page.screenshot({ path: ".local/qa/library-reference-map.png" });
  checks.push(
    "Reference graph shows all connected nodes with local focus and zoom",
  );
  // Fixture provider checks real server prompt plumbing and ordered streaming.
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose research model and provider" })
    .click();
  await page.getByRole("button", { name: "Use model", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("research message").fill("FIXTURE_MULTI_MESSAGE");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByText("First retained progress.", { exact: true }).waitFor();
  await page.getByText("Final accumulated answer.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Stop conversation" })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.getByText("First retained progress.", { exact: true }).count(),
    1,
  );
  checks.push(
    "Real adapter accumulates multiple message IDs without replacement or duplicate deltas",
  );
  const escaped = path
    .join(root, "papers", paperId + ".pdf")
    .replaceAll("_", "\\_");
  await page
    .getByLabel("research message")
    .fill("FIXTURE_DIRECTIVES " + escaped);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".followupChip").waitFor();
  await page.locator(".followupChip").click();
  assert.equal(
    await page.getByLabel("research message").inputValue(),
    "Develop the next lemma.",
  );
  assert.equal(
    await page.getByText(":codex-followup", { exact: false }).count(),
    0,
  );
  await page.locator(".sourceCitation").last().click();
  await page.getByRole("button", { name: "Restore paper reader" }).count();
  assert.equal(
    await page.locator(".topbar nav button.selected").textContent(),
    "Library",
  );
  checks.push(
    "Friendly source citations open Library; follow-up chips fill the unsent composer",
  );
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page.getByLabel("Write-up default format", { exact: true }).click();
  await page.getByRole("radio", { name: "LaTeX", exact: true }).click();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.getByLabel("research message").fill("FIXTURE_PRELIMINARY");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Stop conversation" })
    .waitFor({ state: "hidden" });
  await until(async () =>
    (await api("/api/state")).projects[0].latex.includes(
      "Preliminary fixture paper",
    ),
  );
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  assert.match(
    await page.getByLabel("Manuscript source").inputValue(),
    /Preliminary fixture paper/,
  );
  assert.equal((await api("/api/state")).projects[0].markdown, "");
  await page
    .getByRole("button", { name: "Render document", exact: true })
    .click();
  await page.locator(".manuscriptPreview .pdfPage canvas").first().waitFor();
  await page.screenshot({ path: ".local/qa/axiovela-writeup-parity.png" });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "main.pdf");
  assert.equal(
    (await fs.readFile(await download.path())).subarray(0, 5).toString(),
    "%PDF-",
  );
  checks.push(
    "Substantive research passes the chosen format and synchronizes a preliminary paper, preserving the other format",
  );
  await page
    .getByRole("button", { name: /^Markdown/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  assert.ok(
    await page
      .locator(".paperPreview .annotationSurface>.markdown")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 18),
  );
  await page.screenshot({ path: ".local/qa/writeup-fullscreen-readable.png" });
  await page
    .getByRole("button", { name: "Restore manuscript preview" })
    .click();
  await page.setViewportSize({ width: 980, height: 820 });
  await page.screenshot({ path: ".local/qa/writeup-narrow-parity.png" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  checks.push(
    "Readable fullscreen typography, narrow layout and no JavaScript errors",
  );
  await fs.writeFile(
    ".local/library-polish-validation.json",
    JSON.stringify(
      { passed: true, checks, liveCredentialsUsed: false },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(checks));
} catch (e) {
  if (page)
    await page.screenshot({ path: ".local/qa/library-polish-failure.png" });
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  await new Promise((r) => service.once("exit", r));
  await fs.rm(data, { recursive: true, force: true });
}
