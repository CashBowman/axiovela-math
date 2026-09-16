import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'math-desktop-acceptance-'));
const env={...process.env,AXIOVELA_MATH_DESKTOP_PROFILE:profile,AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(profile,'none'),WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(profile,'providers.json'),WORKBENCH_CODEX_PATH:path.resolve('scripts/fixtures/assistant-rpc.mjs'),AXIOVELA_LAKE_PATH:'/nonexistent/fixture-lake'};
for(const key of ['ELECTRON_RUN_AS_NODE','AXIOVELA_MATH_DESKTOP_SMOKE','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
let app,page;const checks=[];
const executablePath=path.resolve('out/Axiovela Math-linux-x64/axiovela-math');
async function launch(){app=await electron.launch({executablePath,args:[],env,timeout:30000});page=await app.firstWindow();page.on('dialog',()=>{});await page.getByRole('heading',{name:'Executive summary'}).waitFor();}
try{
 await launch();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await page.evaluate(()=>typeof window.methodflowDesktop.chooseExperimentProject),'function');
 assert.deepEqual(await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(i=>i.label)),['File','Edit','View','Help']);
 const selected=path.join(profile,'chosen-project');await fs.mkdir(selected);
 await app.evaluate(({dialog},chosen)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[chosen]});},selected);
 assert.equal(await page.evaluate(()=>window.methodflowDesktop.chooseExperimentProject()),selected);checks.push('packaged preload and trusted native folder picker');
 await page.getByRole('button',{name:'Choose research model and provider'}).click();await page.getByRole('button',{name:'Use model',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByLabel('research message').fill('FIXTURE_CODE');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('Get-Location',{exact:false}).waitFor();
 await page.bringToFront();await page.getByRole('button',{name:'Copy',exact:true}).click();for(let i=0;i<30;i++){if((await app.evaluate(({clipboard})=>clipboard.readText())).includes('Get-Location'))break;await new Promise(r=>setTimeout(r,100));}assert.ok((await app.evaluate(({clipboard})=>clipboard.readText())).includes('Get-Location'));checks.push('packaged fixture provider and native clipboard');
 await page.getByLabel('research message').fill('FIXTURE_ATTEMPT');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.waitForFunction(async()=>{const s=await(await fetch('/api/state')).json();const r=await(await fetch('/api/proof-attempts?project='+s.activeProjectId+'&query=spectral')).json();return r.total===1&&r.attempts[0]?.status==='blocked';});checks.push('packaged proof-attempt checkpoint capture and background retrieval');
 const shared=await page.getByLabel('research conversation',{exact:true}).inputValue();await page.getByRole('button',{name:'Lean Certificates',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="research conversation"]')?.value===id,shared);
 await page.getByLabel('research message').fill('FIXTURE_LEAN_ARTIFACT');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('heading',{name:'Formal source saved',exact:true}).waitFor();await page.getByRole('heading',{name:'Addition of zero',exact:true}).waitFor();await page.getByRole('button',{name:'Set up Lean',exact:true}).waitFor();checks.push('shared native Research/Lean conversation saves formal source and renders certificate notes');
 await page.getByRole('button',{name:'Research',exact:true}).click();
 await page.getByLabel('research message').fill('Preserved chat draft');
 for(const tab of ['Library','Lean Certificates','Write-up']){await page.getByRole('button',{name:tab,exact:true}).click();assert.equal(await page.getByLabel(/^(research|writing|lean) task$/).count(),0);}
 await page.getByRole('button',{name:'LaTeX',exact:false}).first().click();await page.getByLabel('Manuscript source').fill('\\documentclass{article}\n\\begin{document}\nExplicit test manuscript.\n\\end{document}');await page.getByRole('button',{name:'Render document',exact:true}).click();await page.getByRole('region',{name:'Publication PDF'}).waitFor({timeout:120000});checks.push('bundled Tectonic renders a real publication PDF');
 await page.locator('.pdfPage canvas').first().waitFor();await page.getByRole('button',{name:'Expand manuscript preview'}).click();await page.waitForFunction(()=>Math.abs(document.querySelector('.pdfPage').getBoundingClientRect().width-(document.querySelector('.pdfCanvasScroll').clientWidth-36))<2);const before=Number(await page.locator('.pdfReader').getAttribute('data-zoom'));await page.evaluate(()=>{window.zoomProbe=[];window.addEventListener('math-reader-zoom',e=>window.zoomProbe.push({type:'native',direction:e.detail,zoom:document.querySelector('.pdfReader')?.dataset.zoom}));document.addEventListener('keydown',e=>window.zoomProbe.push({type:'key',key:e.key,control:e.ctrlKey}),true);});await app.evaluate(({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].webContents;wc.sendInputEvent({type:'keyDown',keyCode:'=',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'=',modifiers:['control']});});await page.waitForFunction(z=>Number(document.querySelector('.pdfReader').dataset.zoom)>z,before);await app.evaluate(({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].webContents;wc.sendInputEvent({type:'keyDown',keyCode:'-',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'-',modifiers:['control']});});await page.waitForFunction(z=>Math.abs(Number(document.querySelector('.pdfReader').dataset.zoom)-z)<.01,before);await page.keyboard.press('Escape');checks.push('native Ctrl+= and Ctrl+- zoom the expanded PDF symmetrically');
 await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(x=>x.label==='File').submenu.items.find(x=>x.label==='New project…').click());await page.getByRole('heading',{name:'Open or create a research project'}).waitFor();assert.equal(await page.getByRole('button',{name:'Export workspace JSON',exact:true}).count(),0);await page.getByRole('button',{name:'Browse folders…'}).click();await page.waitForFunction(expected=>document.querySelector('[aria-label="Project folder"]').value===expected,selected);await page.keyboard.press('Escape');await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(x=>x.label==='File').submenu.items.find(x=>x.label==='Open project…').click());await page.getByRole('heading',{name:'Recent projects'}).waitFor();await page.keyboard.press('Escape');checks.push('native File commands separate a compact folder picker from recent projects and exports');
 await page.getByRole('button',{name:'Markdown',exact:false}).first().click();await page.getByLabel('Manuscript source').fill('A sentence to annotate.');
 await page.locator('.paperPreview p').evaluate(el=>{const n=el.firstChild,r=document.createRange();r.setStart(n,2);r.setEnd(n,10);const s=window.getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.getByRole('dialog',{name:'Add annotation'}).waitFor();
 await page.keyboard.press('Control+c');assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),'sentence');
 await app.evaluate(({Menu})=>{globalThis.originalPopup=Menu.prototype.popup;Menu.prototype.popup=function(){globalThis.contextRoles=this.items.map(i=>i.role);};});
 const selectionPoint=await page.evaluate(()=>{const r=window.getSelection().getRangeAt(0).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await page.mouse.click(selectionPoint.x,selectionPoint.y,{button:'right'});
 for(let i=0;i<30 && !(await app.evaluate(()=>globalThis.contextRoles?.includes('copy')));i++)await new Promise(r=>setTimeout(r,100));
 assert.ok((await app.evaluate(()=>globalThis.contextRoles))?.includes('copy'));
 await page.getByLabel('Annotation feedback').click({button:'right'});
 for(let i=0;i<30 && !(await app.evaluate(()=>globalThis.contextRoles?.includes('paste')));i++)await new Promise(r=>setTimeout(r,100));
 assert.ok((await app.evaluate(()=>globalThis.contextRoles))?.includes('paste'));
 await app.evaluate(({Menu})=>{Menu.prototype.popup=globalThis.originalPopup;});
 assert.equal(await page.getByRole('button',{name:'Copy passage',exact:true}).count(),0);
 await page.getByLabel('Annotation feedback').focus();await page.keyboard.press('Control+v');assert.equal(await page.getByLabel('Annotation feedback').inputValue(),'sentence');
 await page.getByLabel('Annotation feedback').fill('Clarify this sentence.');await page.getByRole('button',{name:'Add to message',exact:true}).click();await page.locator('[aria-label="Unsent annotations"] .annotationChip').waitFor();checks.push('packaged passage highlights, native Copy/Paste shortcuts and context menus, compact annotation popup and unsent feedback');

 await page.route('**/api/state',r=>r.request().method()==='PUT'?r.abort():r.continue());await page.getByRole('button',{name:'Markdown',exact:false}).first().click();await page.getByLabel('Manuscript source').fill('# Desktop recovery fixture');
 await app.evaluate(({dialog,app})=>{globalThis.closeAttempts=0;dialog.showMessageBoxSync=()=>{globalThis.closeAttempts++;return 0;};app.quit();});
 await page.waitForFunction(()=>document.querySelector('[aria-label="Manuscript source"]').value==='# Desktop recovery fixture');
 for(let i=0;i<50;i++){if(await app.evaluate(()=>globalThis.closeAttempts))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await app.evaluate(()=>globalThis.closeAttempts),1);assert.ok((await page.request.get(new URL('/api/activity',page.url()).href)).ok());checks.push('canceling Quit retains window, draft and backend');
 const oldOrigin=new URL(page.url()).origin;
 const closed=app.waitForEvent('close');await app.evaluate(({dialog,app})=>{dialog.showMessageBoxSync=()=>1;app.quit();});await closed;app=null;
 await launch();assert.equal(new URL(page.url()).origin,oldOrigin);assert.equal(await page.getByLabel('research message').inputValue(),'Preserved chat draft');
 await page.getByRole('button',{name:'Write-up',exact:true}).click();assert.equal(await page.getByLabel('Manuscript source').inputValue(),'# Desktop recovery fixture');checks.push('actual unsaved manuscript and chat draft survive desktop relaunch');
 await page.waitForFunction(()=>!localStorage.getItem('axiovela-math-pending-workspace'));assert.deepEqual(errors,[]);
 await fs.mkdir('.local/qa',{recursive:true});await page.screenshot({path:'.local/qa/desktop-acceptance.png'});
 await fs.writeFile('docs/desktop-acceptance-validation.json',JSON.stringify({passed:true,checks,liveCredentialsUsed:false,checkedAt:new Date().toISOString()},null,2)+'\n');console.log(JSON.stringify(checks));
}catch(e){if(page&&!page.isClosed()){await page.screenshot({path:'.local/qa/desktop-acceptance-failure.png'});console.error(await page.locator('[role=alert]').allTextContents());console.error(await page.evaluate(()=>({zoomProbe:window.zoomProbe,zoom:document.querySelector('.pdfReader')?.dataset.zoom,focus:document.activeElement?.outerHTML})));}throw e;}finally{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(profile,{recursive:true,force:true});}
