import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "math-annotations-")),
  url = "http://127.0.0.1:8802";
const env = {
  ...process.env,
  PORT: "8802",
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
let browser,
  page,
  logs = "";
service.stderr.on("data", (x) => (logs += x));
const checks = [];
const state = async () => fetch(url + "/api/state").then((r) => r.json());
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Condition did not settle");
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
  const initial = await state(),
    id = initial.activeProjectId;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1450, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("heading", { name: "Executive summary" }).waitFor();
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page.getByRole("button", { name: "Write-up default format" }).click();
  await page.getByRole("radio", { name: "LaTeX", exact: true }).click();
  assert.equal(await page.getByLabel("Manuscript source").inputValue(), "");
  await page
    .getByRole("button", { name: "Markdown", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Export workspace JSON", exact: true })
      .isVisible(),
    false,
  );
  await page
    .getByRole("heading", { name: "Open or create a research project" })
    .waitFor();
  await page.screenshot({ path: ".local/qa/project-simple-dialog.png" });
  await page
    .getByLabel("Project folder", { exact: true })
    .fill("Composer fixture");
  await page
    .getByRole("button", { name: "Open or create", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="Manuscript source"]')
      .value === "",
  );
  await page.getByLabel("File menu").click();
  await page
    .getByRole("button", { name: "Open project…", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Untitled mathematics project", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="Manuscript source"]')
      .value === "",
  );
  checks.push(
    "three-dot default format applies to new projects and preserves existing format; simple project dialog and File browsing",
  );
  const source =
    "# Passage review\n\nFirst sentence explains the idea. A second sentence has **important assumptions** and a precise conclusion.\n\nThis next paragraph discusses why those assumptions matter. It should remain connected to the argument.";
  await page.getByLabel("Manuscript source").fill(source);
  await until(
    async () =>
      (await state()).projects.find((p) => p.id === id).markdown === source,
  );
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await selectText(page.locator(".paperPreview p").first(), "explains");
  assert.equal(
    await page
      .getByRole("dialog", { name: "Add annotation" })
      .locator("blockquote")
      .textContent(),
    "First sentence explains the idea.",
  );
  await note("Make this sentence clearer.");
  await page.getByRole("button", { name: "Comment 1", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Choose writing model and provider" })
    .click();
  await page.getByRole("button", { name: "Use model", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("writing access").selectOption("full");
  await selectText(
    page.locator(".paperPreview .markdown"),
    "important assumptions",
    "why those assumptions matter.",
  );
  assert.ok(
    (
      await page
        .getByRole("dialog", { name: "Add annotation" })
        .locator("blockquote")
        .textContent()
    ).startsWith("A second sentence"),
  );
  await note("Explain how these hypotheses connect.");
  assert.equal(
    await page.getByRole("button", { name: /^Comments/ }).count(),
    0,
  );
  assert.equal(
    await page
      .locator('[aria-label="Unsent annotations"] .annotationChip')
      .count(),
    2,
  );
  const chats = () =>
    fetch(url + "/api/conversations?project=" + id).then((r) => r.json());
  assert.equal(
    (await chats()).conversations.find((c) => c.role === "writing").turns
      .length,
    0,
  );
  await page
    .getByLabel("writing message")
    .fill("Please clarify the selected statement and preserve the scope.");
  await page.screenshot({ path: ".local/qa/annotation-composer.png" });
  const originalChat = await page
    .getByLabel("writing conversation", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "New writing conversation" }).click();
  await until(
    async () =>
      (await page.locator('[aria-label="Unsent annotations"]').count()) === 0,
  );
  await page.getByLabel("writing message").fill("Separate draft");
  await page
    .getByLabel("writing conversation", { exact: true })
    .selectOption(originalChat);
  await until(
    async () =>
      (await page
        .locator('[aria-label="Unsent annotations"] .annotationChip')
        .count()) === 2,
  );
  assert.equal(
    await page.getByLabel("writing message").inputValue(),
    "Please clarify the selected statement and preserve the scope.",
  );
  await page
    .getByRole("button", { name: "Remove annotation 2 from message" })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page
    .locator('[aria-label="Unsent annotations"] .annotationChip')
    .waitFor();
  assert.equal(
    await page.getByLabel("writing message").inputValue(),
    "Please clarify the selected statement and preserve the scope.",
  );
  await page
    .locator('[aria-label="Unsent annotations"] .annotationChipBody')
    .click();
  await page
    .getByLabel("Annotation feedback")
    .fill("Please clarify this sentence.");
  await page.keyboard.press("Control+Enter");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .waitFor();
  const chat = (await chats()).conversations.find((c) => c.role === "writing"),
    turn = chat.turns.at(-1);
  assert.equal(chat.mode, "full");
  assert.equal(turn.mode, "ask");
  assert.equal(turn.review.comments.length, 1);
  assert.equal(
    turn.review.comments[0].comment,
    "Please clarify this sentence.",
  );
  assert.equal(
    turn.message,
    "Please clarify the selected statement and preserve the scope.",
  );
  assert.equal(turn.review.source, source);
  assert.equal(
    await page.locator('[aria-label="Unsent annotations"]').count(),
    0,
  );
  assert.equal(await page.getByLabel("Manuscript source").inputValue(), source);
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply revision" }).click();
  await until(async () =>
    (await state()).projects
      .find((p) => p.id === id)
      .markdown.includes("idea clearly."),
  );
  assert.equal(
    (await state()).projects.find((p) => p.id === id).latex,
    initial.projects[0].latex,
  );
  checks.push(
    "Lavish-style unsent annotation chips persist, edit and remove; one explicit message sends text plus notes in a read-only proposal turn",
  );
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: "Apply revision" }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Keep current draft" }).click();
  await page
    .getByRole("button", { name: "LaTeX", exact: false })
    .first()
    .click();
  const latex =
    "\\documentclass{article}\n\\begin{document}\nFirst sentence explains the idea. A second sentence follows it.\\par\nThis longer passage spans multiple rendered lines when it is included in a sufficiently narrow typeset column, and it needs a detailed explanation of the assumptions and their consequences.\\newpage\nSecond page has visible text without clicking.\\newpage\nThird page supports continuous scrolling.\\newpage\nFourth page is the end.\n\\end{document}";
  await page.getByLabel("Manuscript source").fill(latex);
  await page.getByRole("button", { name: "Render document", exact: true }).click();
  await page
    .locator('[data-page="1"] .textLayer span')
    .filter({ hasText: "First sentence" })
    .first()
    .waitFor({ timeout: 120000 });
  const pdf = page.getByRole("region", { name: "Publication PDF" });
  assert.equal(await page.locator(".pdfPage").count(), 4);
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  await page.getByRole("button", { name: "Fit width", exact: true }).click();
  await page.waitForFunction(() => {
    const p = document.querySelector(".pdfPage"),
      pane = document.querySelector(".pdfCanvasScroll");
    return p.getBoundingClientRect().width <= pane.clientWidth - 34;
  });
  await page.locator('[data-page="1"] .textLayer span').first().waitFor();
  const headerHeight = await page
    .locator(".manuscriptPreview>.panelHead")
    .evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(headerHeight < 70);
  assert.equal(await page.locator(".previewToolbar").count(), 1);
  const before = Number(await pdf.getAttribute("data-zoom"));
  await page.keyboard.press("Control+=");
  await until(async () => Number(await pdf.getAttribute("data-zoom")) > before);
  await page.keyboard.press("Control+-");
  await until(
    async () =>
      Math.abs(Number(await pdf.getAttribute("data-zoom")) - before) < 0.005,
  );
  await page
    .locator(".pdfCanvasScroll")
    .evaluate((el) =>
      el.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -30,
          clientX: 400,
          clientY: 350,
        }),
      ),
    );
  await until(async () => Number(await pdf.getAttribute("data-zoom")) > before);
  await page.getByRole("button", { name: "Fit width", exact: true }).click();
  await page.waitForFunction(()=>Math.abs(document.querySelector('.pdfPage').getBoundingClientRect().width-(document.querySelector('.pdfCanvasScroll').clientWidth-36))<2);
  await page.locator(".pdfCanvasScroll").evaluate((el) => {
    const page = el.querySelector('[data-page="2"]');
    el.scrollTop = page.offsetTop;
  });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "2",
  );
  await page
    .locator('[data-page="2"] .textLayer span')
    .filter({ hasText: "Second page" })
    .waitFor();
  await page.getByRole("button", { name: "Next PDF page" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "3",
  );
  await page.locator('[data-page="3"] canvas').waitFor();
  await page.getByRole("button", { name: "Previous PDF page" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "2",
  );
  await page.locator('[data-page="2"] canvas').waitFor();
  const stable = await pdf.getAttribute("data-zoom");
  await page.waitForTimeout(600);
  assert.equal(await pdf.getAttribute("data-zoom"), stable);
  const painted = await page.locator('[data-page="2"] canvas').evaluate((c) => {
    const bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < bytes.length; i += 4)
      if (bytes[i] < 100 && bytes[i + 3] > 0) dark++;
    return dark;
  });
  assert.ok(painted > 100, "PDF canvas contains visible text before clicking");
  await page.screenshot({ path: ".local/qa/continuous-pdf-header.png" });
  await page.getByLabel("PDF page number").fill("1");
  await page.locator('[data-page="1"] .textLayer span').first().waitFor();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await selectText(
    page.locator('[data-page="1"] .textLayer'),
    "longer passage",
    "their consequences.",
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".draftHighlight").length > 1,
  );
  await note("Clarify this longer PDF passage.");
  await page.getByRole("button", { name: "Comment 1", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".expandedPanel").waitFor({ state: "hidden" });
  assert.equal(
    await page
      .locator('[aria-label="Unsent annotations"] .annotationChip')
      .count(),
    1,
  );
  checks.push(
    "continuous four-page PDF, page arrows, Axiovela preview header, Ctrl +/- and pinch events, stable fit width, visible canvas before click, multiline annotation",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  await page.screenshot({ path: ".local/qa/continuous-pdf-mobile.png" });
  assert.deepEqual(errors, []);
  checks.push("narrow layout and no JavaScript runtime errors");
  await fs.writeFile(
    "docs/annotation-validation.json",
    JSON.stringify(
      {
        passed: true,
        checks,
        liveCredentialsUsed: false,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ passed: true, checks }));
} catch (e) {
  if (page) await page.screenshot({ path: ".local/qa/annotation-failure.png" });
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  await new Promise((r) => service.once("exit", r));
  await fs.rm(data, { recursive: true, force: true });
}
