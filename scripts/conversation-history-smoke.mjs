import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {blankProject} from '../shared/research.mjs';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'math-history-ui-'));
const store=new Store(data),initial=await store.read();initial.projects[0].name='History Alpha';const second=blankProject('history-beta','History Beta');initial.projects.push(second);const state=await store.save(initial,0),projects=new Projects(data,store);await projects.init();
const originals=[];
for(const [index,p] of state.projects.entries()){
 const root=await projects.root(p.id);const conversations=Array.from({length:index?1:95},(_,i)=>({id:`history-${index}-${String(i).padStart(4,'0')}`,role:index?'writing':'research',title:index?'Second project manuscript':`Transport estimate ${i}`,selection:{adapterId:'codex',modelId:'fixture-model'},mode:'ask',queue:[],turns:[{id:`t-${i}`,status:'complete',message:`User request ${i}`,output:`Matching spectral excerpt ${i}`,startedAt:new Date(1700000000000+i*1000).toISOString()}]}));
 const file=path.join(root,'assistant/conversations.json'),raw=Buffer.from(JSON.stringify(conversations,null,'\t')+'\n');await fs.writeFile(file,raw);originals.push([file,raw]);
}
const port=8819,url=`http://127.0.0.1:${port}`,env={...process.env,PORT:String(port),AXIOVELA_MATH_DATA:data,AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(data,'none'),WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(data,'no-providers.json'),AXIOVELA_LAKE_PATH:'/nonexistent/fixture-lake'};
for(const id of ['CODEX','CLAUDE','GEMINI','OPENCODE','PI'])env[`WORKBENCH_${id}_PATH`]=path.resolve(`scripts/fixtures/${id==='CODEX'?'assistant-rpc':'provider-cli'}.mjs`);
for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
const service=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe'});let logs='',browser,page;service.stderr.on('data',x=>logs+=x);
try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 const open=async role=>{await page.getByRole('button',{name:`History for ${role}`,exact:true}).click();await page.locator('.historyCard').first().waitFor();};
 await open('research');assert.equal(await page.locator('.historyCard').count(),30);await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('Transport estimate 64',{exact:true}).waitFor();
 await page.getByLabel('Search conversations').fill('spectral excerpt 2');await page.getByText('11 conversations',{exact:true}).waitFor();
 await page.getByLabel('Search conversations').fill('Transport estimate 0');await page.getByText('1 conversation',{exact:true}).waitFor();await page.getByRole('button',{name:'Rename',exact:true}).click();await page.getByLabel('Conversation title').fill('Manually named bound');await page.getByRole('button',{name:'Save title',exact:true}).click();await page.getByText('No matching conversations.').waitFor();
 await page.getByLabel('Search conversations').fill('Manually named');await page.getByRole('button',{name:'Pin',exact:true}).click();await page.getByRole('button',{name:'Unpin',exact:true}).waitFor();await page.getByRole('button',{name:'Archive',exact:true}).click();await page.getByText('No matching conversations.').waitFor();await page.getByLabel('History visibility').selectOption('archived');await page.getByRole('button',{name:'Unarchive',exact:true}).waitFor();
 await page.reload();await open('research');await page.getByLabel('History visibility').selectOption('archived');await page.getByText('★ Manually named bound',{exact:true}).waitFor();await page.getByRole('button',{name:'Unarchive',exact:true}).click();await page.getByText('No matching conversations.').waitFor();await page.getByLabel('History visibility').selectOption('active');await page.getByText('★ Manually named bound',{exact:true}).click();await page.getByRole('dialog',{name:'Conversation history'}).waitFor({state:'hidden'});assert.equal(await page.getByLabel('research conversation',{exact:true}).inputValue(),'history-0-0000');
 await open('research');await page.getByLabel('History scope').selectOption('');await page.getByLabel('Search conversations').fill('Second project manuscript');await page.getByText('Second project manuscript',{exact:true}).waitFor();await page.getByText('Second project manuscript',{exact:true}).click();await page.getByLabel('writing conversation',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="writing conversation"]')?.value==='history-1-0000');
 await page.waitForFunction(async id=>(await(await fetch('/api/state')).json()).activeProjectId===id,second.id);
 await open('writing');await fs.mkdir('.local/qa',{recursive:true});await page.screenshot({path:'.local/qa/conversation-history.png'});await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Conversation history'}).waitFor({state:'hidden'});
 for(const [file,raw] of originals)assert.deepEqual(await fs.readFile(file),raw);
 assert.deepEqual(errors,[]);console.log('History UI passed: 96 conversations, search, pagination, rename/pin/archive/reload, cross-project reopening, unchanged transcripts, no runtime errors.');
} catch(e){if(page)await page.screenshot({path:'.local/qa/history-failure.png'});console.error(logs);throw e;}finally{await browser?.close();service.kill('SIGTERM');await new Promise(r=>service.once('exit',r));await fs.rm(data,{recursive:true,force:true});}
