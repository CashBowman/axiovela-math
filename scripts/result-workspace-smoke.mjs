import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "math-results-ui-")),
  url = "http://127.0.0.1:8806";
const env = {
  ...process.env,
  PORT: "8806",
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
let browser, page;
const checks = [];
async function until(fn) {
  for (let i = 0; i < 250; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Condition timed out");
}
const api = async (route, body, method = "POST") => {
  const r = await fetch(
    url + route,
    body
      ? {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(method === "PUT" && body.revision != null
              ? { "If-Match": String(body.revision) }
              : {}),
          },
          body: JSON.stringify(body),
        }
      : {},
  );
  assert.ok(r.ok, await r.clone().text());
  return r.json();
};
try {
  await until(async () => {
    try {
      return (await fetch(url + "/api/state")).ok;
    } catch {
      return false;
    }
  });
  const initial = await api("/api/state"),
    id = initial.activeProjectId;
  await api("/api/conversations?project=" + id, { role: "research" });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByLabel("research message").fill("FIXTURE_RESULT_OUTLINE");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await until(
    async () => (await api("/api/state")).projects[0].graphNodes?.length === 2,
  );
  await page.locator(".inlineReview p").first().waitFor();
  await page
    .locator(".inlineReview p")
    .first()
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  const feedback = page.getByLabel("Annotation feedback");
  await feedback.fill("Clarify the assumptions.");
  await feedback.press("Shift+Enter");
  await feedback.press("x");
  assert.match(await feedback.inputValue(), /\nx$/);
  await feedback.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  assert.equal(
    await page.getByRole("dialog", { name: "Add annotation" }).count(),
    1,
  );
  await feedback.press("Enter");
  await page
    .getByRole("dialog", { name: "Add annotation" })
    .waitFor({ state: "hidden" });
  await page
    .locator('[aria-label="Unsent annotations"] .annotationChip')
    .waitFor();
  assert.equal(
    (await api("/api/conversations?project=" + id)).conversations[0].turns
      .length,
    1,
  );
  checks.push(
    "Enter explicitly attaches without sending; Shift+Enter inserts newline and composition Enter does not submit",
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByLabel("Filter library").selectOption("lemma");
  await page
    .getByRole("button", { name: /Supporting identity unverified/ })
    .waitFor();
  await page.getByLabel("Filter library").selectOption("all");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const edge = page.getByRole("button", {
    name: /Explain connection: Main additive identity depends on Supporting identity/,
  });
  await edge.focus();
  await edge.press("Enter");
  await page.getByRole("region", { name: "Connection explanation" }).waitFor();
  await page
    .getByText("The induction route uses the base case.", { exact: false })
    .first()
    .waitFor();
  await page.screenshot({ path: ".local/qa/result-connections.png" });
  await page
    .getByRole("button", { name: "Close connection explanation" })
    .click();
  const hit = page.locator(".edgeHit");
  const point = await hit.evaluate((el) => {
    const svg = el.ownerSVGElement,
      p = svg.createSVGPoint();
    const midpoint=el.getPointAtLength(el.getTotalLength()/2);
    p.x = midpoint.x;
    p.y = midpoint.y;
    const q = p.matrixTransform(el.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(point.x, point.y);
  await page.getByRole("region", { name: "Connection explanation" }).waitFor();
  checks.push(
    "fixture assistant saves result outline automatically; Library filters lemmas; keyboard and mouse edge explanation",
  );
  await page
    .getByRole("button", { name: "Lean Certificates", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Main additive identity", exact: true })
    .waitFor();
  assert.equal(await page.locator(".resultCard").count(), 2);
  assert.match(await page.locator(".resultCard").first().innerText(), /Lemma/);
  assert.match(await page.locator(".resultCard").last().innerText(), /Builds on Lemma/);
  await page.getByRole("region", {name: "Selected result"}).getByRole("button", {name: "Lemma",exact:true}).click();
  await page.getByRole("heading", {name: "Supporting identity", exact:true}).waitFor();
  await page.getByRole("button", {name: /Theorem Main result Main additive identity/}).click();
  await page.getByText("fixture_add_zero", { exact: true }).first().waitFor();
  await page
    .getByRole("button", { name: /Lemma Supporting identity Not formalized/ })
    .click();
  await page
    .getByRole("heading", { name: "Supporting identity", exact: true })
    .waitFor();
  assert.match(
    await page.getByRole("region", { name: "Selected result" }).innerText(),
    /No formal declaration is linked/,
  );
  await page
    .getByRole("button", { name: /Theorem Main result Main additive identity/ })
    .click();
  await page.screenshot({ path: ".local/qa/result-certificates.png" });
  checks.push(
    "selectable result cards, explicit per-result mappings, unformalized lemma stays unverified",
  );
  // A real compiled PDF exercises fullscreen header size and retained reader state.
  const rendered = await api("/api/render?project=" + id, {
    source:
      "\\documentclass{article}\n\\begin{document}\nA readable first page.\\newpage A readable second page.\n\\end{document}",
    bibliography: "",
  });
  const bytes = await fetch(
    url + "/api/rendered?project=" + id + "&id=" + rendered.id,
  ).then((r) => r.arrayBuffer());
  const upload = await fetch(url + "/api/papers", {
    method: "POST",
    body: bytes,
  }).then((r) => r.json());
  const latest = await api("/api/state");
  latest.projects[0].papers.push({
    ...upload,
    title:
      "A long paper title that should stay compact when reading a complete document in fullscreen",
    sourceUrl: "https://example.org/paper",
    sourceType: "pdf",
    citationKey: "reader",
    notes: "",
    read: false,
  });
  await api("/api/state", latest, "PUT");
  await page.reload();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.locator(".pdfPage canvas").first().waitFor();
  await page.getByRole("button", { name: "Expand paper reader" }).click();
  const geometry = await page.locator(".expandedPanel").evaluate((el) => ({
    head: el.querySelector(".panelHead").getBoundingClientRect().height,
    toolbar: el.querySelector(".pdfToolbar").getBoundingClientRect().height,
    top: el.querySelector(".pdfCanvasScroll").getBoundingClientRect().top,
    height: innerHeight,
  }));
  assert.ok(geometry.top <= 100, JSON.stringify(geometry));
  assert.ok(geometry.top / geometry.height < 0.11);
  assert.equal(await page.locator(".sourceOrigin a").count(), 0);
  await page
    .getByRole("link", { name: "Open original", exact: true })
    .waitFor();
  await page
    .locator(".expandedPanel .textLayer span")
    .filter({ hasText: "A readable first page." })
    .first()
    .waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector(".expandedPanel .pdfPage .pdfPaint");
    return el && getComputedStyle(el).transform === "matrix(1, 0, 0, 1, 0, 0)";
  });
  await page.screenshot({ path: ".local/qa/result-reader-fullscreen.png" });
  await page.getByLabel("PDF page number").fill("2");
  await page.getByLabel("PDF page number").press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "2",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="PDF page number"]').value === "2" &&
      !document.querySelector(".expandedPanel"),
  );
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  assert.equal(await page.getByLabel("PDF page number").inputValue(), "2");
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.getByRole("button", { name: "Expand paper reader" }).click();
  assert.ok(
    await page
      .locator(".pdfCanvasScroll")
      .evaluate((el) => el.getBoundingClientRect().top < 115),
  );
  await page.screenshot({ path: ".local/qa/result-reader-narrow.png" });
  checks.push(
    "real PDF fullscreen chrome below 100px; narrow-window controls; page retained through tab changes",
  );
  await page.getByRole("button", {name:"Restore paper reader"}).click();
  await page.getByRole("button", {name:"Write-up",exact:true}).click();
  await page.getByLabel("Manuscript source").fill("## 3. Results\n### Lemma 3.1: Supporting identity\n<!-- axiovela-result: idea:helper -->\nA supporting result.\n### Theorem 3.2: Main additive identity\n<!-- axiovela-result: idea:zero -->\nA proposed conclusion.");
  await page.getByRole("button", {name:"Lean Certificates",exact:true}).click();
  await page.locator(".resultCard").filter({hasText:"Theorem 3.2"}).waitFor();
  assert.match(await page.locator(".resultCard").first().innerText(),/Lemma 3.1/);
  await page.screenshot({path:".local/qa/manuscript-numbering-markdown.png"});
  await page.getByRole("button", {name:"Write-up",exact:true}).click();
  await page.getByRole("button", {name:/^LaTeX/}).first().click();
  await page.getByLabel("Manuscript source").fill(String.raw`\documentclass{article}
\usepackage{amsthm}
\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\begin{document}
\setcounter{section}{2}
\section{Results}
\begin{lemma}[Supporting identity]\label{idea:helper}A supporting result.\end{lemma}
\begin{theorem}[Main additive identity]\label{idea:zero}A proposed conclusion.\end{theorem}
\end{document}`);
  await until(async()=> (await api("/api/manuscript-labels?project="+id)).labels?.["idea:zero"]==="3.2");
  await page.getByRole("button", {name:"Lean Certificates",exact:true}).click();
  await page.locator(".resultCard").filter({hasText:"Theorem 3.2"}).waitFor();
  assert.match(await page.locator(".resultCard").first().innerText(),/Lemma 3.1/);
  await page.screenshot({path:".local/qa/manuscript-numbering-latex.png"});
  checks.push("Markdown manuscript anchors and actual Tectonic auxiliary labels give identical section-based result numbers with stable certificate mappings");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    ".local/result-workspace-validation.json",
    JSON.stringify(
      { passed: true, checks, geometry, liveCredentialsUsed: false },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(checks));
} catch (e) {
  if (page)
    await page.screenshot({ path: ".local/qa/result-workspace-failure.png" });
  throw e;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  await new Promise((r) => service.once("exit", r));
  await fs.rm(data, { recursive: true, force: true });
}
