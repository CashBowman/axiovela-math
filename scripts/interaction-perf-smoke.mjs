import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {Chats} from '../server/chat.mjs';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-input-perf-'));
const store=new Store(data),state=await store.read(),id=state.activeProjectId;
const paragraph=i=>`### Step ${i}\n\nThis sentence explains the argument and its assumptions. The bound is $\\|x\\|^2 \\leq C \\sum_{j=1}^n x_j^2$ and the conclusion remains conditional.\n\n$$\\int_0^1 f(t)\\,dt = \\sum_{k=1}^n a_k.$$\n`;
state.projects[0].proof=Array.from({length:70},(_,i)=>paragraph(i)).join('\n');
await store.save(state,0);const projects=new Projects(data,store);await projects.init();const chats=new Chats(projects,store),c=await chats.newConversation(id,'research');
c.turns=Array.from({length:24},(_,i)=>({id:'turn-'+i,message:'Explain part '+i,output:Array.from({length:6},(_,j)=>paragraph(i*6+j)).join('\n'),status:'complete',events:[],startedAt:new Date().toISOString(),completedAt:new Date().toISOString()}));await chats.persist(id);
const env={...process.env,PORT:'8817',AXIOVELA_MATH_DATA:data,AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(data,'none'),WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(data,'providers.json'),WORKBENCH_CODEX_PATH:path.resolve('scripts/fixtures/assistant-rpc.mjs'),AXIOVELA_LAKE_PATH:path.join(data,'no-lake')};
for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
const service=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe'}),url='http://127.0.0.1:8817';let browser;
const out=process.env.PERF_LABEL||'current';
try {
 for(let i=0;i<100;i++){try{if((await fetch(url+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1560,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.chatMessages article').last().waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.chatMessages .katex').length>100);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 await page.getByLabel('research message').focus();
 await page.evaluate(()=>window.retainedChatMath=document.querySelector('.chatMessages .katex'));
 let start=performance.now();await page.getByLabel('research message').pressSequentially('typing measurement');const chatMs=performance.now()-start;
 const retainedChat=await page.evaluate(()=>window.retainedChatMath===document.querySelector('.chatMessages .katex'));
 const before=await metrics();await page.waitForTimeout(1800);const after=await metrics();
 // Open a passage annotation in the long proof without changing its contents.
 const proof=page.getByLabel('Reading annotation surface').filter({hasText:'Step 0'}).first();
 await proof.locator('p').first().evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const node=walker.nextNode();const range=document.createRange();range.setStart(node,0);range.setEnd(node,20);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);const r=range.getBoundingClientRect();root.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:r.left+2,clientY:r.top+2}));});
 const feedback=page.getByLabel('Annotation feedback');await feedback.waitFor();await feedback.focus();
 await page.evaluate(()=>window.retainedProofMath=document.querySelector('.annotationSurface .katex'));
 start=performance.now();await feedback.pressSequentially('annotation measurement');const annotationMs=performance.now()-start;
 const retainedProof=await page.evaluate(()=>window.retainedProofMath===document.querySelector('.annotationSurface .katex'));
 const {profile}=await cdp.send('Profiler.stop');await fs.mkdir('.local/qa',{recursive:true});await fs.writeFile(`.local/qa/input-${out}.cpuprofile`,JSON.stringify(profile));
 const result={fixture:{turns:24,chatEquations:288,proofSections:70},chatTypingMs:Math.round(chatMs),annotationTypingMs:Math.round(annotationMs),idleTaskMs:Math.round(1000*(after.TaskDuration-before.TaskDuration)),retainedChat,retainedProof,errors};
 await fs.writeFile(`.local/qa/input-${out}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 assert.deepEqual(errors,[]);
 if(process.env.PERF_ASSERT==='1'){assert.ok(retainedChat,'Typing must retain rendered chat mathematics');assert.ok(retainedProof,'Typing must retain rendered proof mathematics');assert.ok(chatMs<1500,'Chat typing exceeded 1.5 seconds for 18 characters');assert.ok(annotationMs<1500,'Annotation typing exceeded 1.5 seconds for 22 characters');}
} finally {await browser?.close();service.kill('SIGTERM');await new Promise(r=>service.once('exit',r));await fs.rm(data,{recursive:true,force:true});}
