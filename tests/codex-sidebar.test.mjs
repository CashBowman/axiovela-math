import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {archiveCompletedMathThread,runAssistant} from '../server/axiovela/assistant-runtime.mjs';
test('sidebar cleanup only archives an idle, unpinned root with no loaded workers',async()=>{
 for(const state of [{status:'idle',archive:true},{status:'active'},{status:'notLoaded',archive:true},{status:'idle',pinned:true},{status:'idle',workers:true},{status:'idle',cursor:true},{status:'unknown'}]){
  const calls=[];const rpc={request:async(method)=>{calls.push(method);if(method==='thread/read')return {thread:{id:'root',isPinned:state.pinned,status:{type:state.status}}};if(method==='thread/loaded/list')return {data:state.workers?['root','worker']:['root'],nextCursor:state.cursor?'next':null};return {};}};
  assert.equal(await archiveCompletedMathThread(rpc,'root'),!!state.archive);assert.equal(calls.includes('thread/archive'),!!state.archive);
 }
});
test('completed Math sessions archive, resume under the same ID, and tolerate cleanup failure',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'math-sidebar-'));process.env.WORKBENCH_CODEX_PATH=path.resolve('scripts/fixtures/assistant-rpc.mjs');
 try{
  let sessionId;const events=[];const opts={selection:{adapterId:'codex',modelId:'test-model',effort:'low'},cwd:dir,prompt:'FIXTURE_STATE',mode:'ask',archiveAfterTurn:true,conversationTitle:'A useful title',signal:new AbortController().signal,onSession:id=>{sessionId=id;},onEvent:e=>events.push(e),onOutput:()=>{},onEffective:()=>{}};
  await runAssistant(opts);const file=path.join(dir,`.fixture-${sessionId}.json`);let native=JSON.parse(await fs.readFile(file));assert.equal(native.archived,true);assert.equal(native.name,'A useful title');const first=sessionId;
  await runAssistant({...opts,sessionId});assert.equal(sessionId,first);native=JSON.parse(await fs.readFile(file));assert.equal(native.turns,2);assert.equal(native.archived,true);
  native.archiveFails=true;await fs.writeFile(file,JSON.stringify(native));await runAssistant({...opts,sessionId});assert.ok(events.some(e=>e.label.includes('sidebar cleanup was unavailable')));assert.equal(JSON.parse(await fs.readFile(file)).turns,3);
  const control=new AbortController();const pending=runAssistant({...opts,sessionId,prompt:'FIXTURE_HANG',signal:control.signal});await new Promise(r=>setTimeout(r,150));control.abort();await assert.rejects(pending,/canceled|closed/i);assert.equal(JSON.parse(await fs.readFile(file)).archived,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
