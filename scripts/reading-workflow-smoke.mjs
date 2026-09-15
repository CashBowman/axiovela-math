import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const data = await fs.mkdtemp(path.join(os.tmpdir(), "math-reading-workflow-")),
  url = "http://127.0.0.1:8804";
const env = {
  ...process.env,
  PORT: "8804",
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
  await until(async()=>{try{return (await fetch(url+'/api/state')).ok;}catch{return false;}});
  let state=await api('/api/state');const id=state.activeProjectId;
  assert.equal(state.projects[0].markdown,'');assert.equal(state.projects[0].latex,'');
  const root=(await api('/api/project-root?project='+id)).folder;
  const source='First sentence explains the idea. A second sentence records the assumptions.\n\nA later paragraph keeps the proof separate from the sources.';
  await fs.writeFile(path.join(root,'research/proof.md'),source);
  const latex='\\documentclass{article}\n\\begin{document}\nA source sentence explains the theorem. Another sentence provides its hypotheses.\n\\end{document}';
  const rendered=await api('/api/render?project='+id,{source:latex,bibliography:''});
  const bytes=Buffer.from(await(await fetch(url+'/api/rendered?project='+id+'&id='+rendered.id)).arrayBuffer());
  await fs.mkdir(path.join(data,'papers'),{recursive:true});await fs.writeFile(path.join(data,'papers','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf'),bytes);
  state=await api('/api/state');state.projects[0].papers=[{id:'web-source',title:'A mathematical website',sourceUrl:'https://example.org/article',sourceType:'web',text:'## Sampling on a manifold\n\nA source passage explains the geometry. The manifold is \\(\\mathcal{M}\\subset\\mathbb{R}^n\\).\n\n\\[x^2+y^2=1\\]',contentVersion:2,capturedAt:'fixture',notes:'',citationKey:'websource'},{id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',title:'A readable PDF',sourceType:'pdf',notes:'',citationKey:'pdfsource'}];
  let saved=await fetch(url+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':String(state.revision)},body:JSON.stringify(state)});assert.ok(saved.ok);
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1680,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByRole('heading',{name:'Math Assistant',exact:true}).waitFor();
  await page.getByRole('button',{name:'Choose research model and provider'}).click();await page.getByRole('button',{name:'Use model',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Annotate',exact:true}).click();
  await page.getByText('First sentence explains the idea.',{exact:false}).first().waitFor();
  assert.ok(await page.locator('.paperPreview .markdown').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
  await selectText(page.locator('.paperPreview p').first(),'explains');await note('Clarify the proof sentence.');
  assert.equal(await page.locator('[aria-label="Unsent annotations"] .annotationChip').count(),1);
  const chatId=await page.getByLabel('research conversation',{exact:true}).inputValue();
  assert.equal((await api('/api/conversations?project='+id)).conversations.find(c=>c.id===chatId).turns.length,0);
  await page.getByRole('button',{name:'Library',exact:true}).click();
  await page.getByRole('heading',{name:'Sampling on a manifold',exact:true}).waitFor();
  assert.equal(await page.locator('.paperPreview .katex').count(),2);
  await page.getByRole('button',{name:'Annotate',exact:true}).click();
  await selectText(page.locator('.paperPreview p').first(),'explains');await note('Relate this source to the proof.');
  assert.equal(await page.locator('[aria-label="Unsent annotations"] .annotationChip').count(),2);
  await page.getByRole('button',{name:'A readable PDF PDF',exact:false}).click();
  await page.locator('.pdfPage .textLayer span').first().waitFor();
  await selectText(page.locator('.pdfPage .textLayer').first(),'explains');await note('State the exact PDF hypotheses.');
  assert.equal(await page.locator('[aria-label="Unsent annotations"] .annotationChip').count(),3);
  await page.getByLabel('research message').fill('FIXTURE_PROMPT Address all three notes together.');
  await page.screenshot({path:'.local/qa/reading-annotations.png'});
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await until(async()=>{const t=(await api('/api/conversations?project='+id)).conversations.find(c=>c.id===chatId).turns.at(-1);return t?.status==='complete';});
  const turn=(await api('/api/conversations?project='+id)).conversations.find(c=>c.id===chatId).turns.at(-1);
  assert.equal(turn.annotations.length,3);assert.match(turn.output,/READING FEEDBACK/);assert.match(turn.output,/Clarify the proof sentence/);assert.equal(turn.annotations[2].anchor.page,1);
  assert.equal(await page.locator('[aria-label="Unsent annotations"] .annotationChip').count(),0);
  await page.getByRole('button',{name:'Write-up',exact:true}).click();
  await page.getByRole('button',{name:'Choose writing model and provider'}).click();await page.getByRole('button',{name:'Use model',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.getByLabel('writing access').inputValue(),'auto');
  await page.getByLabel('writing message').fill('Write a complete paper FIXTURE_WRITING_CHAT');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await until(async()=>(await page.getByLabel('Manuscript source').inputValue()).includes('Recovered complete paper'));
  assert.equal((await api('/api/state')).projects[0].latex,'');
  assert.deepEqual(errors,[]);
  const result={passed:true,checks:['new projects have two empty manuscript formats','Math Assistant and readable default typography','proof, website and PDF sentence annotations queue together unsent','one explicit message sends all canonical notes and page anchors','publication chat saves full draft to editor independently of research chat','no browser runtime errors']};
  await fs.writeFile('.local/reading-workflow-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} catch (e) {
  if (page)
    await page.screenshot({ path: ".local/qa/reading-workflow-failure.png" });
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  await new Promise((r) => service.once("exit", r));
  await fs.rm(data, { recursive: true, force: true });
}
