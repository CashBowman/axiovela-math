import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverRuntime,runAssistant} from '../server/axiovela/assistant-runtime.mjs';
import {discoverApi,runApi,executeResearchTool} from '../server/axiovela/assistant-api.mjs';
import {saveProvider} from '../server/axiovela/provider-settings.mjs';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {Chats} from '../server/chat.mjs';
import {inspectLean} from '../server/checks.mjs';
const callbacks={onSession:()=>{},onEvent:()=>{},onOutput:()=>{},onEffective:()=>{}};
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-math-provider-'));try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('all five native adapters discover and execute fixture protocols',async()=>fixture(async cwd=>{
 for(const id of ['codex','claude','gemini','opencode','pi']){
  process.env[`WORKBENCH_${id.toUpperCase()}_PATH`]=path.resolve(`scripts/fixtures/${id==='codex'?'assistant-rpc':'provider-cli'}.mjs`);
  const c=await discoverRuntime(id,cwd,true);assert.equal(c.available,true,id);assert.ok(c.models.length);
  let session;const text=await runAssistant({selection:{adapterId:id,modelId:c.models[0].id,effort:''},cwd,prompt:id==='codex'?'FIXTURE_STATE':'STATE',mode:id==='opencode'?'full':'ask',signal:new AbortController().signal,...callbacks,onSession:id=>{session=id;}});assert.ok(text.length);assert.ok(session);
 }
}));
test('four direct API adapters execute tool loops with isolated credentials',async()=>fixture(async cwd=>{
 process.env.WORKBENCH_PROVIDER_SETTINGS_PATH=path.join(cwd,'private/providers.json');const original=globalThis.fetch;
 try{for(const id of ['openai-api','anthropic-api','gemini-api','compatible-api']){
  await saveProvider(id,{apiKey:'fixture-key',...(id==='compatible-api'?{endpoint:'http://127.0.0.1:5555/v1'}:{})});let round=0;const modelId=id==='openai-api'?'gpt-5':id==='gemini-api'?'gemini-fixture':'fixture-model';const args={path:`research/${id}.md`,content:'Exact fixture output'};
  globalThis.fetch=async(url,init)=>{if(init.method==='GET')return Response.json(id==='gemini-api'?{models:[{name:'models/'+modelId,supportedGenerationMethods:['generateContent']}]}:{data:[{id:modelId}]});round++;const first=round===1;
   if(id==='openai-api')return Response.json({status:'completed',output:first?[{type:'function_call',call_id:'1',name:'write_file',arguments:JSON.stringify(args)}]:[{type:'message',content:[{type:'output_text',text:'Completed fixture'}]}]});
   if(id==='anthropic-api')return Response.json({stop_reason:first?'tool_use':'end_turn',content:first?[{type:'tool_use',id:'1',name:'write_file',input:args}]:[{type:'text',text:'Completed fixture'}]});
   if(id==='gemini-api')return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:first?[{functionCall:{name:'write_file',args}}]:[{text:'Completed fixture'}]}}]});
   return Response.json({choices:[{message:{role:'assistant',content:first?null:'Completed fixture',...(first?{tool_calls:[{id:'1',type:'function',function:{name:'write_file',arguments:JSON.stringify(args)}}]}:{})}}]});};
  const c=await discoverApi(id);assert.equal(c.available,true);assert.ok(!JSON.stringify(c).includes('fixture-key'));
  await runApi({selection:{adapterId:id,modelId,effort:''},cwd,mode:'auto',prompt:'Write a fixture.',signal:new AbortController().signal,...callbacks},c.models[0]);assert.equal(await fs.readFile(path.join(cwd,args.path),'utf8'),args.content);assert.equal(round,2);
 }
 await assert.rejects(executeResearchTool('write_file',{path:'blocked',content:'x'},{cwd,mode:'ask',signal:new AbortController().signal}),/does not permit/);
 }finally{globalThis.fetch=original;}
}));
test('conversation cancellation retains queue and separate roles stay independent',async()=>fixture(async dir=>{
 process.env.WORKBENCH_CODEX_PATH=path.resolve('scripts/fixtures/assistant-rpc.mjs');const store=new Store(dir);const initial=await store.read();const s=await store.save(initial,0);const id=s.activeProjectId;const projects=new Projects(dir,store);await projects.init();const chats=new Chats(projects,store);const a=await chats.newConversation(id,'research'),b=await chats.newConversation(id,'writing');
 await chats.send(id,a.id,'FIXTURE_HANG');await chats.send(id,a.id,'Keep this queued');await chats.send(id,b.id,'FIXTURE_STATE');
 await chats.cancel(id,a.id);for(let i=0;i<150&&chats.controllers.size;i++)await new Promise(r=>setTimeout(r,30));assert.equal(a.turns[0].status,'canceled');assert.equal(a.queue.length,1);assert.equal(a.queuePaused,true);assert.equal(b.turns[0].status,'complete');assert.notEqual(a.sessionId,b.sessionId);
 // Completion removes the process controller before its final disk write settles.
 await chats.persist(id);
 const restored=new Chats(projects,store);const list=await restored.load(id);assert.equal(list.find(c=>c.id===a.id).queue.length,1);
}));

test('all API protocols expose read-only attempt retrieval and retain the entire current request',async()=>fixture(async cwd=>{
 process.env.WORKBENCH_PROVIDER_SETTINGS_PATH=path.join(cwd,'private/providers.json');const original=globalThis.fetch;
 try{for(const id of ['openai-api','anthropic-api','gemini-api','compatible-api']){
  await saveProvider(id,{apiKey:'fixture-key',...(id==='compatible-api'?{endpoint:'http://127.0.0.1:5555/v1'}:{})});let round=0,queries=0;
  const args={query:'spectral',targetRef:'claim:C1',status:'blocked',label:''};
  globalThis.fetch=async(url,init)=>{
   const body=JSON.parse(init.body);round++;const first=round===1;
   const serialized=JSON.stringify(body);assert.match(serialized,/CURRENT_REQUEST_START/);assert.match(serialized,/CURRENT_MEMORY_END/);
   assert.match(serialized,/query_proof_attempts/);assert.doesNotMatch(serialized,/"name":"write_file"/);
   if(!first)assert.match(serialized,/saved spectral obstruction/);
   if(id==='openai-api')return Response.json({status:'completed',output:first?[{type:'function_call',call_id:'q1',name:'query_proof_attempts',arguments:JSON.stringify(args)}]:[{type:'message',content:[{type:'output_text',text:'Used saved attempts'}]}]});
   if(id==='anthropic-api')return Response.json({stop_reason:first?'tool_use':'end_turn',content:first?[{type:'tool_use',id:'q1',name:'query_proof_attempts',input:args}]:[{type:'text',text:'Used saved attempts'}]});
   if(id==='gemini-api')return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:first?[{functionCall:{name:'query_proof_attempts',args}}]:[{text:'Used saved attempts'}]}}]});
   return Response.json({choices:[{message:{role:'assistant',content:first?null:'Used saved attempts',...(first?{tool_calls:[{id:'q1',type:'function',function:{name:'query_proof_attempts',arguments:JSON.stringify(args)}}]}:{})}}]});
  };
  const result=await runApi({selection:{adapterId:id,modelId:'fixture-model',effort:''},cwd,mode:'ask',prompt:'CURRENT_REQUEST_START'+'.'.repeat(33000)+'CURRENT_MEMORY_END',signal:new AbortController().signal,...callbacks,queryProofAttempts:async filters=>{queries++;assert.deepEqual(filters,args);return {attempts:[{outcome:'saved spectral obstruction'}]};}},{id:'fixture-model'});
  assert.equal(result,'Used saved attempts');assert.equal(queries,1);assert.equal(round,2);
 }}finally{globalThis.fetch=original;}
}));
test('Lean missing project remains unverified and reports a useful obligation',async()=>fixture(async root=>{
 const r=await inspectLean(root,true);assert.equal(r.status,'not-configured');assert.equal(r.formalCertificate,false);assert.equal(r.checks[0].status,'missing');
}));

test('new requests ignore legacy task settings; paused legacy queue preserves its recipe',async()=>fixture(async dir=>{
 process.env.WORKBENCH_CODEX_PATH=path.resolve('scripts/fixtures/assistant-rpc.mjs');
 const store=new Store(dir);const initial=await store.read();initial.projects[0].claims=[{id:'C1',statement:'An exact target fixture.',revision:1,status:'conjecture',reviewer:'',reviewNote:''}];
 const s=await store.save(initial,0),id=s.activeProjectId;const projects=new Projects(dir,store);await projects.init();const chats=new Chats(projects,store);const c=await chats.newConversation(id,'research');
 const wait=async()=>{for(let i=0;i<200&&chats.controllers.size;i++)await new Promise(r=>setTimeout(r,20));assert.equal(chats.controllers.size,0);await chats.persist(id);};
 await chats.patch(id,c.id,{task:'literature'});
 await chats.send(id,c.id,'FIXTURE_PROMPT',{context:{kind:'claim',id:'C1'}});await wait();
 const prompt=JSON.parse(c.turns[0].output).prompt;
 assert.match(prompt,/Search primary literature/);assert.match(prompt,/Currently selected Library claim/);assert.match(prompt,/An exact target fixture/);assert.match(prompt,/No dollar ceiling is enforced/);
 assert.equal(c.turns[0].task,'general');assert.match(prompt,/Select only the methods relevant/);assert.equal(c.turns[0].promptHash.length,64);
 await assert.rejects(chats.send(id,c.id,'Missing source',{context:{kind:'paper',id:'nonexistent'}}),/no longer exists/);
 assert.equal(chats.controllers.size,0);assert.equal(chats.admissions.size,0);
 await chats.send(id,c.id,'FIXTURE_HANG');await chats.send(id,c.id,'FIXTURE_PROMPT',{task:'literature',context:{kind:'claim',id:'C1'}});await chats.cancel(id,c.id);await wait();
 await chats.patch(id,c.id,{task:'attack'});assert.equal(c.queue[0].task,'literature');
 await chats.queueAction(id,c.id,{resume:true});await wait();
 assert.equal(c.turns.at(-1).task,'literature');assert.match(JSON.parse(c.turns.at(-1).output).prompt,/Search primary literature/);
 assert.equal(c.queue.length,0);
 const w=await chats.newConversation(id,'writing');await chats.send(id,w.id,'FIXTURE_PROMPT',{format:'latex'});await wait();assert.match(JSON.parse(w.turns[0].output).prompt,/Selected manuscript format: latex/);
}));

test('concurrent first loads and conversation creation retain both histories',async()=>fixture(async dir=>{
 const store=new Store(dir),initial=await store.read();const s=await store.save(initial,0);const projects=new Projects(dir,store);await projects.init();const chats=new Chats(projects,store);
 const [a,b]=await Promise.all([chats.newConversation(s.activeProjectId,'research'),chats.newConversation(s.activeProjectId,'writing'),chats.load(s.activeProjectId)]);
 assert.notEqual(a.id,b.id);assert.equal((await chats.load(s.activeProjectId)).length,2);
 const reopened=new Chats(projects,store);assert.equal((await reopened.load(s.activeProjectId)).length,2);
}));
