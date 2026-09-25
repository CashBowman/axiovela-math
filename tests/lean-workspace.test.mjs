import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {Chats} from '../server/chat.mjs';
import {LeanWorkspace,leanDraft} from '../server/lean-workspace.mjs';
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'math-lean-flow-')),oldCodex=process.env.WORKBENCH_CODEX_PATH,oldLake=process.env.AXIOVELA_LAKE_PATH;try{process.env.WORKBENCH_CODEX_PATH=path.resolve('scripts/fixtures/assistant-rpc.mjs');process.env.AXIOVELA_LAKE_PATH=path.join(dir,'missing-lake');const store=new Store(dir),initial=await store.read(),s=await store.save(initial,0),id=s.activeProjectId,projects=new Projects(dir,store);await projects.init();const lean=new LeanWorkspace(dir,projects),chats=new Chats(projects,store,null,lean),root=await projects.root(id);await fn({dir,store,id,projects,lean,chats,root});await chats.persist(id);}finally{if(oldCodex===undefined)delete process.env.WORKBENCH_CODEX_PATH;else process.env.WORKBENCH_CODEX_PATH=oldCodex;if(oldLake===undefined)delete process.env.AXIOVELA_LAKE_PATH;else process.env.AXIOVELA_LAKE_PATH=oldLake;await fs.rm(dir,{recursive:true,force:true});}}
async function finish(chats,id){for(let i=0;i<300&&(chats.controllers.size||chats.admissions.size);i++)await new Promise(r=>setTimeout(r,20));assert.equal(chats.controllers.size,0);await chats.persist(id);}
test('shared formalization request writes files and records independent preflight',()=>fixture(async({id,chats,lean,root})=>{
 const c=await chats.newConversation(id,'research');assert.equal(c.mode,'auto');
 await chats.send(id,c.id,'FIXTURE_LEAN_ARTIFACT',{workspace:'lean'});await finish(chats,id);
 const snapshot=await lean.read(id);assert.ok(snapshot.sourceHash);assert.equal(snapshot.plan.title,'Addition of zero');assert.equal(snapshot.records.length,1);assert.equal(snapshot.records[0].status,'preflight');assert.equal(snapshot.records[0].formalCertificate,false);assert.equal(snapshot.lakeAvailable,false);assert.equal(snapshot.stale,false);
 assert.equal(c.turns[0].workspace,'lean');assert.equal(c.turns[0].leanCheck.id,snapshot.records[0].id);
 await fs.writeFile(path.join(root,'certificates/Helper.lean'),'theorem changed : True := by trivial');assert.equal((await lean.read(id)).stale,true);
}));
test('read-only remains read-only; explicit legacy-draft save never overwrites existing source',()=>fixture(async({id,chats,lean,root})=>{
 const c=await chats.newConversation(id,'research');await chats.patch(id,c.id,{mode:'ask'});await chats.send(id,c.id,'FIXTURE_LEAN_ARTIFACT',{workspace:'lean'});await finish(chats,id);assert.equal((await lean.read(id)).sourceHash,null);
 await chats.send(id,c.id,'FIXTURE_LEAN_DRAFT');await finish(chats,id);const turn=c.turns.at(-1);
 await lean.saveDraft(id,c,turn.id);assert.match(await fs.readFile(path.join(root,'certificates/Main.lean'),'utf8'),/retained_draft/);assert.equal(c.mode,'ask');await lean.saveDraft(id,c,turn.id);
 await fs.writeFile(path.join(root,'certificates/Main.lean'),'theorem local_edit : True := by trivial');await assert.rejects(lean.saveDraft(id,c,turn.id),/already saved/);assert.match(await fs.readFile(path.join(root,'certificates/Main.lean'),'utf8'),/local_edit/);
 assert.equal(leanDraft('```lean\na\n```\n```lean\nb\n```'),null);
}));
test('legacy Lean histories migrate without losing turns, queued followups or permissions',()=>fixture(async({id,projects,chats,root})=>{
 const c=await chats.newConversation(id,'research');const file=path.join(root,'assistant/conversations.json');c.role='lean';c.mode='ask';c.queue=[{id:'retained',message:'Continue the theorem',task:'lean'}];await chats.persist(id);
 const reopened=new Chats(projects,chats.store);const list=await reopened.load(id);assert.equal(list[0].role,'research');assert.equal(list[0].previousRole,'lean');assert.equal(list[0].mode,'ask');assert.equal(list[0].queue[0].message,'Continue the theorem');assert.equal(JSON.parse(await fs.readFile(file.replace('.json','.before-shared-lean.json'),'utf8'))[0].role,'lean');
 const made=await reopened.newConversation(id,'lean');assert.equal(made.role,'research');
}));
test('full-access change performs a real checker process; missing tools and forged note verdicts cannot certify',()=>fixture(async({dir,id,chats,lean,root})=>{
 const executable=path.join(dir,'lake');await fs.writeFile(executable,`#!/usr/bin/env node\nif(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['env','lean','Main.lean']))process.exit(2);\nconsole.log('deterministic checker fixture');\n`,{mode:0o755});process.env.AXIOVELA_LAKE_PATH=executable;
 const c=await chats.newConversation(id,'research');await chats.patch(id,c.id,{mode:'full'});await chats.send(id,c.id,'FIXTURE_LEAN_ARTIFACT');await finish(chats,id);
 let snap=await lean.read(id);assert.equal(snap.records[0].status,'build-passed');assert.equal(snap.records[0].formalCertificate,false);assert.match(snap.records[0].diagnostics,/checker fixture/);
 await fs.writeFile(path.join(root,'certificates/certificate.json'),JSON.stringify({title:'Forged success',status:'verified',formalCertificate:true}));snap=await lean.read(id);assert.equal(snap.plan.formalCertificate,undefined);assert.equal(snap.stale,true);
 process.env.AXIOVELA_LAKE_PATH=path.join(dir,'missing');assert.equal((await lean.check(id,true)).status,'tool-unavailable');
}));

test('project editing automatically checks saved theorems; read-only changes only inspect files',()=>fixture(async({dir,id,lean,root})=>{
 const executable=path.join(dir,'lake-fixture');
 await fs.writeFile(executable,`#!/usr/bin/env node\nconst fs=require('fs');const file=process.argv[4];if(file!=='Main.lean'){const text=fs.readFileSync(file,'utf8');const marker=text.match(/AXIOVELA_AUDIT_[a-f0-9]+:/)[0];console.log(marker+JSON.stringify({name:'target',kind:'theorem',type:'True',axioms:[]}));}\n`,{mode:0o755});
 process.env.AXIOVELA_LAKE_PATH=executable;
 await fs.mkdir(path.join(root,'certificates'),{recursive:true});
 for(const [name,text] of Object.entries({'Main.lean':'theorem target : True := by trivial','lean-toolchain':'leanprover/lean4:v4.19.0','lake-manifest.json':'{}','certificate.json':JSON.stringify({declarations:['target']})}))await fs.writeFile(path.join(root,'certificates',name),text);
 const readOnly=await lean.afterTurn(id,null,'ask');assert.equal(readOnly.status,'preflight');assert.equal(readOnly.declarationChecks,undefined);
 const editing=await lean.afterTurn(id,null,'auto');assert.equal(editing.status,'build-passed');assert.equal(editing.declarationChecks[0].status,'checked');assert.equal(editing.formalCertificate,false);
}));
