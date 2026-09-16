import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium, _electron } from "playwright";
import { Store } from "../server/store.mjs";
import { Projects } from "../server/projects.mjs";
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "math-navigator-ui-")),
  data = path.join(tmp, "data"),
  home = path.join(tmp, "home");
await fs.mkdir(home);
const store = new Store(data);
await store.save(await store.read(), 0);
const projects = new Projects(data, store);
await projects.init();
for (const name of ["Alpha", "Beta"])
  await projects.openOrCreate({
    directory: path.join(tmp, name),
    revision: (await store.read()).revision,
  });
let state = await store.read();
state.projects = state.projects.filter(
  (p) => p.name !== "Untitled mathematics project",
);
for (const p of state.projects) {
  p.papers = [
    {
      id: "paper",
      title: "Shared source",
      notes: "",
      sourceUrl: "https://arxiv.org/abs/2302.03660",
      sourceType: "web",
      text: "Synthetic source fixture.",
    },
  ];
  p.question = p.name + " mathematical question";
  p.markdown = `# ${p.name} independent draft`;
}
state.activeProjectId = state.projects[0].id;
await store.save(state, state.revision);
const [alpha, beta] = state.projects;
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: home,
  AXIOVELA_MATH_DATA: data,
  AXIOVELA_MATH_DESKTOP_PROFILE: path.join(tmp, "profile"),
  AXIOVELA_BRIDGE_DISCOVERY_PATHS: "[]",
  WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(tmp, "providers.json"),
  WORKBENCH_CODEX_PATH: path.resolve("scripts/fixtures/assistant-rpc.mjs"),
  AXIOVELA_LAKE_PATH: "/nonexistent/fixture-lake",
  PORT: "8812",
};
for (const key of Object.keys(env))
  if (
    /^(OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|ELECTRON_RUN_AS_NODE$|AXIOVELA_MATH_DESKTOP_SMOKE$)/.test(
      key,
    )
  )
    delete env[key];
const binary = process.env.AXIOVELA_PROJECT_TEST_BINARY;
let service,
  browser,
  app,
  page,
  origin,
  modelCalls = 0;
const errors = [];
await fs.mkdir(".local/qa", { recursive: true });
const suffix = binary ? "packaged" : "browser";
async function menu() {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const m = page.getByRole("region", { name: "Saved projects" });
  await m.locator(".savedProject").first().waitFor();
  return m;
}
async function atlas() {
  const m = await menu();
  await m.getByRole("button", { name: "Connections & manage" }).click();
  const d = page.getByRole("dialog", {
    name: "Project connections and saved folders",
  });
  await d.locator("[data-node]").first().waitFor();
  return d;
}
try {
  if (binary) {
    app = await _electron.launch({
      executablePath: path.resolve(binary),
      args: [],
      env,
    });
    page = await app.firstWindow();
    page.on("dialog",()=>{});
  } else {
    service = spawn(process.execPath, ["server/index.mjs"], {
      env,
      stdio: "pipe",
    });
    origin = "http://127.0.0.1:8812";
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin + "/api/state")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(origin);
  }
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/messages")
      modelCalls++;
  });
  await page.getByRole("heading", { name: "Executive summary" }).waitFor();
  origin = new URL(page.url()).origin;
  // Desktop selects its isolated profile workspace; use API fixtures there too.
  if (binary) {
    const current = await page.evaluate(() =>
      fetch("/api/state").then((r) => r.json()),
    );
    state.revision = current.revision;
    await page.evaluate(async (state) => {
      const r = await fetch("/api/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(state.revision),
        },
        body: JSON.stringify(state),
      });
      if (!r.ok) throw Error(await r.text());
    }, state);
    await page.reload();
    await page.getByRole("heading", { name: "Executive summary" }).waitFor();
  }
  const header = await page
    .locator(".projectStrip")
    .evaluate((e) => e.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  await page.getByLabel("Manuscript source").fill("# Alpha unsaved manuscript");
  let m = await menu();
  await m.getByRole("button", { name: "Pin Beta", exact: true }).click();
  await m.getByRole("button", { name: "Unpin Beta", exact: true }).waitFor();
  assert.match(await m.locator(".savedProject").first().innerText(), /Beta/);
  await page.screenshot({ path: `.local/qa/project-switcher-${suffix}.png` });
  await m.getByTitle(beta.folder, { exact: true }).click();
  await m.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector(".projectTab.active")?.textContent.includes("Beta"),
  );
  await page
    .getByLabel("Manuscript source")
    .fill("# Beta independent manuscript");
  await page.getByRole("button", { name: "Close Alpha", exact: true }).click();
  m = await menu();
  await m.getByTitle(alpha.folder, { exact: true }).click();
  await m.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector(".projectTab.active")?.textContent.includes("Alpha"),
  );
  assert.equal(
    await page.getByLabel("Manuscript source").inputValue(),
    "# Alpha unsaved manuscript",
  );
  assert.equal(
    await page.locator(".projectTab").filter({ hasText: "Alpha" }).count(),
    1,
  );
  m = await menu();
  await m.getByRole("searchbox", { name: "Find projects" }).fill("Beta");
  assert.equal(await m.locator(".savedProject").count(), 1);
  await m.getByRole("searchbox").press("ArrowDown");
  assert.match(
    await page.evaluate(() => document.activeElement.textContent),
    /Beta/,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Projects", exact: true })
      .evaluate((e) => document.activeElement === e),
    true,
  );
  await page.locator(".paperPreview .markdown h1").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  m = await menu();
  await m.getByRole("searchbox").fill("");
  await m.getByRole("button", { name: "Connections & manage" }).click();
  let d = page.getByRole("dialog", {
    name: "Project connections and saved folders",
  });
  const edge = d.locator('[data-edge^="shared:"]');
  await edge.waitFor();
  await edge.focus();
  await edge.press("Enter");
  await d.getByRole("region", { name: "Connection explanation" }).waitFor();
  assert.match(
    await d.getByRole("region", { name: "Connection explanation" }).innerText(),
    /Both project libraries/,
  );
  await d.getByRole("button", { name: "Close connection explanation" }).click();
  assert.equal(await edge.evaluate((e) => e === document.activeElement), true);
  await d.getByRole("button", { name: "Add connection", exact: true }).click();
  let form = d.getByRole("form", { name: "Edit project connection" });
  await form.getByLabel("Connection from").selectOption("project:" + alpha.id);
  await form.getByLabel("Connection to").selectOption("project:" + beta.id);
  await form.getByLabel("Connection relationship").selectOption("tests");
  await form
    .getByLabel("Connection explanation")
    .fill(
      "Alpha tests the conjecture in Beta; the link does not assert proof.",
    );
  await form.getByRole("button", { name: "Save connection" }).click();
  await form.waitFor({ state: "hidden" });
  const manual = d.getByRole("button", {
    name: "Explain connection: Alpha tests Beta",
    exact: true,
  });
  await manual.focus();
  await manual.press("Space");
  await d.getByRole("button", { name: "Edit connection", exact: true }).click();
  await form
    .getByLabel("Connection explanation")
    .fill("Revised scope, still conjectural.");
  await form.getByRole("button", { name: "Save connection" }).click();
  await form.waitFor({ state: "hidden" });
  await page.screenshot({
    path: `.local/qa/project-connections-${suffix}.png`,
  });
  await page.setViewportSize({ width: 1000, height: 720 });
  assert.ok(await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 2));
  await page.screenshot({
    path: `.local/qa/project-connections-narrow-${suffix}.png`,
  });
  await page.keyboard.press("Escape");
  await d.waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Manuscript source").inputValue(),
    "# Alpha unsaved manuscript",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Projects", exact: true })
      .evaluate((e) => document.activeElement === e),
    true,
  );
  await page.waitForFunction(
    () => window.getSelection().toString() === "Alpha unsaved manuscript",
  );
  await page.reload();
  await page.getByRole("heading", { name: "Executive summary" }).waitFor();
  d = await atlas();
  await d
    .getByRole("button", {
      name: "Explain connection: Alpha tests Beta",
      exact: true,
    })
    .press("Enter");
  assert.match(
    await d.getByRole("region", { name: "Connection explanation" }).innerText(),
    /Revised scope/,
  );
  await d
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await d
    .getByRole("button", {
      name: "Explain connection: Alpha tests Beta",
      exact: true,
    })
    .waitFor({ state: "hidden" });
  await fs.rename(alpha.folder, alpha.folder + " moved");
  await d.getByRole("button", { name: "Refresh", exact: true }).click();
  let card = d.locator(".atlasProject").filter({ hasText: "Alpha" });
  await card.getByText("Folder unavailable", { exact: true }).waitFor();
  await card.getByRole("button", { name: "Locate", exact: true }).click();
  await d.getByLabel("Existing project location").fill(alpha.folder + " moved");
  await d.getByRole("button", { name: "Save location" }).click();
  await d
    .getByRole("form", { name: "Locate project" })
    .waitFor({ state: "hidden" });
  await card
    .getByRole("button", { name: "Remove from list", exact: true })
    .click();
  await card.waitFor({ state: "hidden" });
  assert.ok(await fs.stat(alpha.folder + " moved"));
  assert.equal(
    await page.locator(".projectTab").filter({ hasText: "Alpha" }).count(),
    1,
  );
  await d.getByRole("button", { name: "Close projects" }).click();
  await page
    .locator(".projectTab")
    .filter({ hasText: "Beta" })
    .getByRole("button", { name: "Beta", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".projectTab.active")?.textContent.includes("Beta"),
  );
  await page.getByRole("button", { name: "Write-up", exact: true }).click();
  assert.equal(
    await page.getByLabel("Manuscript source").inputValue(),
    "# Beta independent manuscript",
  );
  assert.ok(header <= 65, `Header height ${header}`);
  assert.equal(modelCalls, 0);
  assert.deepEqual(errors, []);
  console.log(
    `Project navigator ${suffix}: pin/search/keyboard, canonical tab reopening, independent drafts, exact symmetric edges, manual CRUD/reload, relocation, non-destructive hiding and zero model calls passed.`,
  );
} catch (e) {
  if (page)
    await page
      .screenshot({ path: `.local/qa/project-navigator-failure-${suffix}.png` })
      .catch(() => {});
  throw e;
} finally {
  await app?.close();
  await browser?.close();
  if (service) {
    service.kill("SIGTERM");
    await new Promise((r) => service.once("exit", r));
  }
  await fs.rm(tmp, { recursive: true, force: true });
}
