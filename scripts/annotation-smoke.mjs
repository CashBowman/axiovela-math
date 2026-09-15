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
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
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
  const source =
    "# Passage review\n\nFirst sentence explains the idea. A second sentence has **important assumptions** and a precise conclusion.\n\nThis next paragraph discusses why those assumptions matter. It should remain connected to the argument.";
  await page.getByLabel("Manuscript source").fill(source);
  await until(async () => (await state()).projects[0].markdown === source);
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await selectText(page.locator(".paperPreview p").first(), "explains");
  assert.equal(
    await page
      .getByRole("dialog", { name: "Add annotation" })
      .locator("blockquote")
      .textContent(),
    "First sentence explains the idea.",
  );
  await page.locator(".draftHighlight").first().waitFor();
  await note("Make this sentence clearer.");
  await page.getByRole("button", { name: "Comment 1", exact: true }).waitFor();
  await selectText(
    page.locator(".paperPreview .markdown"),
    "important assumptions",
    "why those assumptions matter.",
  );
  const quote = await page
    .getByRole("dialog", { name: "Add annotation" })
    .locator("blockquote")
    .textContent();
  assert.ok(quote.startsWith("A second sentence"));
  assert.ok(quote.endsWith("matter."));
  await note("Explain how these hypotheses connect.");
  checks.push(
    "sentence snapping and multi-paragraph selection retain full quotes across inline formatting",
  );
  await page.getByRole("button", { name: "Comment 1", exact: true }).click();
  await page
    .getByText("Make this sentence clearer.", { exact: true })
    .waitFor();
  await page
    .locator("[data-comment-id]")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByLabel("Annotation feedback")
    .fill("Please clarify this sentence.");
  await page.keyboard.press("Control+Enter");
  await page
    .getByRole("dialog", { name: "Edit annotation" })
    .waitFor({ state: "hidden" });
  await page.screenshot({ path: ".local/qa/annotation-markdown.png" });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".annotationOverlay").isVisible(), false);
  assert.equal(await page.locator(".manuscriptComments").isVisible(), false);
  await page.emulateMedia({ media: "screen" });
  checks.push("printed Markdown excludes review controls and annotation marks");
  await page.reload();
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page.getByRole("button", { name: "Comment 2", exact: true }).waitFor();
  await page.getByRole("button", { name: "Comment 1", exact: true }).click();
  await page
    .getByText("Please clarify this sentence.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  await page.getByRole("button", { name: "Comment 2", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".expandedPanel").waitFor({ state: "hidden" });
  checks.push(
    "numbered highlights, edited notes and anchors survive reload, expansion and responsive reflow",
  );
  // Selected feedback uses a fresh read-only provider turn, preserving the normal access setting and unsent chat draft.
  await page
    .getByRole("button", { name: "Choose writing model and provider" })
    .click();
  await page.getByRole("button", { name: "Use model", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("writing access").selectOption("full");
  await page.getByLabel("writing message").fill("Keep this unsent message");
  await page
    .getByRole("checkbox", { name: "Include comment 1 in feedback" })
    .check();
  await page
    .getByRole("button", { name: "Send feedback · 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .waitFor();
  const chats = await fetch(url + "/api/conversations?project=" + id).then(
      (r) => r.json(),
    ),
    chat = chats.conversations.find((c) => c.role === "writing"),
    turn = chat.turns.at(-1);
  assert.equal(chat.mode, "full");
  assert.equal(turn.mode, "ask");
  assert.equal(turn.review.comments.length, 1);
  assert.equal(turn.review.source, source);
  assert.ok(turn.output.includes("read-only"));
  assert.equal(await page.getByLabel("Manuscript source").inputValue(), source);
  assert.equal(
    await page.getByLabel("writing message").inputValue(),
    "Keep this unsent message",
  );
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply revision", exact: true })
    .waitFor();
  await page.screenshot({ path: ".local/qa/annotation-proposal.png" });
  await page.getByRole("button", { name: "Keep current draft" }).click();
  assert.equal(await page.getByLabel("Manuscript source").inputValue(), source);
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply revision" }).click();
  await until(async () =>
    (await state()).projects[0].markdown.includes("idea clearly."),
  );
  await page.getByText("Earlier revision", { exact: false }).first().waitFor();
  assert.equal((await state()).projects[0].latex, initial.projects[0].latex);
  checks.push(
    "selected feedback reaches actual fixture provider read-only; proposal stays unapplied until acceptance; independent LaTeX and unsent chat are preserved",
  );
  await page
    .getByRole("button", { name: "Review proposed revision", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: "Apply revision" }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Keep current draft" }).click();
  checks.push("stale proposals cannot overwrite a newer manuscript");
  await page.getByRole("button", { name: "Close comments" }).click();
  await page
    .getByLabel("Manuscript source")
    .fill("# Mathematical objects\n\n$$\nx^2 + y^2 = z^2\n$$\n\n");
  await page.locator(".katex-display").click();
  await page.getByRole("dialog", { name: "Add annotation" }).waitFor();
  assert.ok(
    (
      await page
        .getByRole("dialog", { name: "Add annotation" })
        .locator("blockquote")
        .textContent()
    ).includes("z"),
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("Manuscript source").focus();
  await page.getByLabel("Manuscript source").press("Control+End");
  await page
    .locator('input[type=file][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles("public/workbench-mark.png");
  await page.locator(".paperPreview img").waitFor();
  await page.locator(".paperPreview img").click();
  await page
    .getByLabel("Annotation feedback")
    .fill("Use a descriptive figure caption.");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page.getByRole("button", { name: "Comment 3", exact: true }).waitFor();
  checks.push(
    "display equations and project-owned figures support contextual feedback",
  );
  await page
    .getByRole("button", { name: "LaTeX", exact: false })
    .first()
    .click();
  const latex =
    "\\documentclass{article}\n\\begin{document}\nFirst sentence explains the idea. A second sentence follows it.\\par\nThis longer passage spans multiple rendered lines when it is included in a sufficiently narrow typeset column, and it needs a detailed explanation of the assumptions and their consequences.\n\\end{document}";
  await page.getByLabel("Manuscript source").fill(latex);
  await page.getByRole("button", { name: "Render PDF", exact: true }).click();
  await page
    .locator(".textLayer span")
    .filter({ hasText: "First sentence" })
    .first()
    .waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await selectText(page.locator(".textLayer"), "explains");
  assert.equal(
    await page
      .getByRole("dialog", { name: "Add annotation" })
      .locator("blockquote")
      .textContent(),
    "First sentence explains the idea.",
  );
  await note("Clarify this PDF sentence.");
  await page.getByRole("button", { name: "Comment 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "Zoom in PDF" }).click();
  await page.getByRole("button", { name: "Comment 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  await page.getByRole("button", { name: "Fit width" }).click();
  await page.getByRole("button", { name: "Comment 1", exact: true }).click();
  await page.getByText("Clarify this PDF sentence.", { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const page = document.querySelector(".pdfPage"),
      pane = document.querySelector(".pdfCanvasScroll");
    return (
      page &&
      pane &&
      page.getBoundingClientRect().width <= pane.clientWidth - 34
    );
  });
  await page.locator(".textLayer span").first().waitFor();
  await page.getByRole("button", { name: "Comment 1", exact: true }).waitFor();
  await page.locator(".passageHighlight").first().waitFor();
  await page.screenshot({ path: ".local/qa/annotation-pdf.png" });
  await page.keyboard.press("Escape");
  await selectText(
    page.locator(".textLayer"),
    "longer passage",
    "their consequences.",
  );
  assert.ok(
    (
      await page
        .getByRole("dialog", { name: "Add annotation" })
        .locator("blockquote")
        .textContent()
    ).includes("their consequences."),
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".draftHighlight").length > 1,
  );
  await page.getByRole("dialog", { name: "Add annotation" }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Add annotation" })
    .waitFor({ state: "hidden" });
  checks.push(
    "PDF text-layer anchors stay aligned through zoom and full-window fit; Escape cancels a popover",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Expand manuscript preview" }).click();
  await page.screenshot({ path: ".local/qa/annotation-mobile.png" });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  checks.push("narrow-window layout and no runtime errors");
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
