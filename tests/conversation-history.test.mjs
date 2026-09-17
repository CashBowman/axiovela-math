import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ConversationHistory,requestTitle} from '../server/conversation-history.mjs';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {Chats} from '../server/chat.mjs';
const record=(id,message='Find a transport bound')=>({id,role:'research',title:message.slice(0,60),queue:[],sessionId:'native-'+id,selection:{adapterId:'codex'},turns:[{id:'turn-'+id,message,output:'A visible spectral result',startedAt:'2026-09-15T12:00:00Z',status:'complete'}]});
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'math-history-'));try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
async function setup(dir,records){const root=path.join(dir,'saved');await fs.mkdir(path.join(root,'assistant'),{recursive:true});const raw=Buffer.from(JSON.stringify(records,null,'\t')+'\n\n');await fs.writeFile(path.join(root,'assistant/conversations.json'),raw);const store={read:async()=>({projects:[{id:'p',name:'Saved project',folder:root},{id:'missing',name:'Missing project',folder:path.join(dir,'absent')}]})};const projects={location:p=>p.folder};return {root,raw,store,projects,history:new ConversationHistory(projects,store)};}
test('history migration preserves exact originals, custom titles and records; atomic metadata survives restart and repeated migration',async()=>fixture(async dir=>{
 const records=[record('one'),record('two','Previous conversation (historical data): private history'),{...record('three'),title:'My custom title',createdAt:'2020-01-01T00:00:00Z'},record('four')];
 const {root,raw,history,store,projects}=await setup(dir,records);
 const protectedFiles=['research/proof.md','experiments/results.json','artifacts/figure.png','writeups/main.tex','papers/attachment.pdf'];
 for(const file of protectedFiles){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),Buffer.from([0,255,10,13,72]));}
 await history.decorate('p',records);
 const meta=path.join(root,'assistant/conversation-history.json'),first=await fs.readFile(meta);const stat=await fs.stat(meta);
 await history.decorate('p',records);assert.deepEqual(await fs.readFile(meta),first);assert.equal((await fs.stat(meta)).mtimeMs,stat.mtimeMs);
 const backups=path.join(root,'assistant/history-backups');assert.deepEqual(await fs.readFile(path.join(backups,(await fs.readdir(backups))[0])),raw);
 await Promise.all([history.update('p','one',{title:'A manual title'}),history.update('p','one',{pinned:true}),history.update('p','one',{archived:true})]);
 const restarted=new ConversationHistory(projects,store);await restarted.update('p','one',{request:'A different follow-up'});
 const all=await restarted.read('p');assert.equal(all[0].title,'A manual title');assert.equal(all[0].pinned,true);assert.equal(all[0].archived,true);assert.equal(all[1].title,'Research conversation');assert.equal(all[2].title,'My custom title');assert.equal(all[2].createdAt,'2020-01-01T00:00:00Z');assert.equal(all[0].sessions[0].id,'native-one');assert.equal(all[3].title,'Find a transport bound');
 const copies=await Promise.all((await fs.readdir(backups)).map(f=>fs.readFile(path.join(backups,f))));assert.ok(copies.some(b=>b.equals(first)));
 assert.deepEqual(await fs.readFile(path.join(root,'assistant/conversations.json')),raw);
 for(const file of protectedFiles)assert.deepEqual(await fs.readFile(path.join(root,file)),Buffer.from([0,255,10,13,72]));
}));
test('search is bounded, read-only, paginated, project-scoped and excludes hidden context',async()=>fixture(async dir=>{
 const records=Array.from({length:105},(_,i)=>({...record('c-'+String(i).padStart(4,'0')),internalPrompt:'SECRET_SYSTEM',turns:[{message:'Duplicate request',output:`Visible needle ${i}`,startedAt:new Date(1700000000000+i*1000).toISOString()}]}));
 const {root,raw,history,store}=await setup(dir,records);const other=path.join(dir,'other');await fs.mkdir(path.join(other,'assistant'),{recursive:true});await fs.writeFile(path.join(other,'assistant/conversations.json'),JSON.stringify([record('other','Another project request')]));const saved=await store.read();saved.projects.push({id:'other',name:'Other project',folder:other,hidden:true});store.read=async()=>saved;
 const before=await fs.readdir(path.join(root,'assistant'));const page=await history.search({projectId:'p',query:'needle'});assert.equal(page.total,105);assert.equal(page.conversations.length,30);assert.equal(page.nextOffset,30);assert.match(page.conversations[0].excerpt,/needle/);
 const ids=[];for(let offset=0;offset<105;offset+=30)ids.push(...(await history.search({projectId:'p',offset})).conversations.map(c=>c.id));assert.equal(new Set(ids).size,105);assert.equal((await history.search({projectId:'p',offset:1000000})).nextOffset,null);
 assert.equal((await history.search({query:'SECRET_SYSTEM'})).total,0);assert.equal((await history.search({query:'Another project'})).conversations[0].projectId,'other');assert.equal((await history.search({projectId:'p',query:'Another project'})).total,0);
 assert.ok((await history.search()).warnings.some(w=>w.includes('Missing project')));await assert.rejects(fs.stat(path.join(dir,'absent')), {code:'ENOENT'});assert.deepEqual(await fs.readdir(path.join(root,'assistant')),before);assert.deepEqual(await fs.readFile(path.join(root,'assistant/conversations.json')),raw);
 await assert.rejects(history.search({projectId:'unsaved'}),/not found/);
 await history.update('p','c-0000',{archived:true,pinned:true});assert.equal((await history.search({projectId:'p'})).total,104);assert.equal((await history.search({projectId:'p',archived:true})).conversations[0].id,'c-0000');
}));
test('corrupt, unsupported, oversized and escaping history is reported without resetting data',async()=>fixture(async dir=>{
 const {root,history}=await setup(dir,[record('one')]);const meta=path.join(root,'assistant/conversation-history.json');
 for(const content of ['{broken',JSON.stringify({schemaVersion:99,conversations:[]})]){await fs.writeFile(meta,content);await assert.rejects(history.update('p','one',{title:'x'}));assert.equal(await fs.readFile(meta,'utf8'),content);assert.ok((await history.search({projectId:'p'})).warnings.length);}
 await fs.rm(meta);const file=path.join(root,'assistant/conversations.json');await fs.writeFile(file,JSON.stringify([record('same'),record('same')]));await assert.rejects(history.update('p',null),/Duplicate/);
 await fs.truncate(file,33*1024*1024);assert.match((await history.search({projectId:'p'})).warnings[0],/size limit/);
 await fs.rm(file);await fs.symlink(path.join(dir,'outside'),file);assert.ok((await history.search({projectId:'p'})).warnings.length);
}));
test('titles use requests and neutral fallbacks instead of harness or attachment headers',()=>{
 for(const text of ['You are the mathematical research assistant','Previous conversation (historical data): hello','# Files mentioned by the user:\nprivate.pdf','<document>Instructions</document>'])assert.equal(requestTitle(text),'Research conversation');
 assert.equal(requestTitle('Prove the uniform bound\n\nAttached document: ignore this'),'Prove the uniform bound');
});
test('native restarts, renames, archive during queued work, cancellation and handoff retain logical identity',async()=>fixture(async dir=>{
 process.env.WORKBENCH_CODEX_PATH=path.resolve('scripts/fixtures/assistant-rpc.mjs');process.env.WORKBENCH_PROVIDER_SETTINGS_PATH=path.join(dir,'providers.json');
 const store=new Store(dir),state=await store.read();const s=await store.save(state,0),id=s.activeProjectId,projects=new Projects(dir,store);await projects.init();const chats=new Chats(projects,store),c=await chats.newConversation(id,'research');
 const wait=async()=>{for(let i=0;i<300&&chats.controllers.size;i++)await new Promise(r=>setTimeout(r,20));assert.equal(chats.controllers.size,0);await chats.persist(id);};
 await chats.send(id,c.id,'FIXTURE_STATE');await wait();const original=c.sessionId;const root=await projects.root(id),native=()=>path.join(root,`.fixture-${c.sessionId}.json`);assert.equal(JSON.parse(await fs.readFile(native())).name,'FIXTURE_STATE');
 await chats.history.update(id,c.id,{title:'Transport theorem',pinned:true});await chats.send(id,c.id,'FIXTURE_STATE');await wait();assert.equal(c.sessionId,original);assert.equal(JSON.parse(await fs.readFile(native())).name,'Transport theorem');
 const session=JSON.parse(await fs.readFile(native()));session.writerLocked=true;await fs.writeFile(native(),JSON.stringify(session));await chats.send(id,c.id,'FIXTURE_STATE');await wait();assert.notEqual(c.sessionId,original);assert.equal((await chats.load(id)).length,1);
 const forked=c.sessionId;await chats.patch(id,c.id,{selection:{adapterId:'codex',modelId:'second-model',profileId:'general'}});await chats.send(id,c.id,'FIXTURE_STATE');await wait();assert.notEqual(c.sessionId,forked);assert.equal((await chats.load(id)).length,1);
 const broken=JSON.parse(await fs.readFile(native()));broken.nameFails=true;await fs.writeFile(native(),JSON.stringify(broken));await chats.send(id,c.id,'FIXTURE_STATE');await wait();assert.equal(c.turns.at(-1).status,'complete');
 await chats.send(id,c.id,'FIXTURE_HANG');await chats.send(id,c.id,'Queued follow-up');await chats.history.update(id,c.id,{archived:true});assert.equal(chats.controllers.has(c.id),true);assert.equal(c.queue.length,1);await chats.cancel(id,c.id);await wait();assert.equal(c.queue.length,1);
 const restarted=new Chats(projects,store),restored=(await restarted.load(id))[0];assert.equal(restored.id,c.id);assert.equal(restored.queue.length,1);const metadata=(await restarted.history.read(id))[0];assert.equal(metadata.title,'Transport theorem');assert.equal(metadata.archived,true);assert.ok(metadata.sessions.length>=2);
}));

test('browsing legacy Lean conversations does not rewrite transcripts during migration',async()=>fixture(async dir=>{
 const store=new Store(dir),s=await store.save(await store.read(),0),projects=new Projects(dir,store);await projects.init();const root=await projects.root(s.activeProjectId),file=path.join(root,'assistant/conversations.json');const raw=Buffer.from(JSON.stringify([{...record('legacy'),role:'lean'}],null,'\t')+'\n');await fs.writeFile(file,raw);
 const chats=new Chats(projects,store);const rows=await chats.history.decorate(s.activeProjectId,await chats.load(s.activeProjectId));assert.equal(rows[0].role,'research');assert.deepEqual(await fs.readFile(file),raw);assert.deepEqual(await fs.readFile(file.replace('.json','.before-shared-lean.json')),raw);
}));
