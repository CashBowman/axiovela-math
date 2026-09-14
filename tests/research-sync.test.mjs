import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reconcileResearch,resolveResearch} from '../shared/research-sync.mjs';
import {readResearchArtifacts} from '../server/research-artifacts.mjs';

const first={text:'First argument',hash:'one'},second={text:'Revised argument',hash:'two'};
test('research catches up without erasing independent edits or missing documents',()=>{
 const initial={summary:'My summary',proof:'',notes:'My notes'};
 const {patch,conflicts}=reconcileResearch(initial,{proof:first});
 assert.deepEqual(conflicts,{});assert.equal(patch.proof,first.text);assert.equal(patch.summary,undefined);
 const project={...initial,...patch};
 assert.deepEqual(reconcileResearch(project,{}).patch,{});
 assert.equal(reconcileResearch(project,{proof:second}).patch.proof,second.text);
 for(const proof of ['My correction','']){
  const local={...project,proof};
  assert.deepEqual(reconcileResearch(local,{proof:first}).patch,{});
  assert.equal(reconcileResearch(local,{proof:second}).conflicts.proof,second);
 }
 assert.equal(reconcileResearch({proof:'Existing legacy argument'},{proof:first}).conflicts.proof,first);
});
test('research conflict decisions persist across reload and retain replaced text',()=>{
 const local={proof:'My correction',researchSync:{proof:first}};
 const kept=JSON.parse(JSON.stringify({...local,...resolveResearch(local,'proof',second,false)}));
 assert.deepEqual(reconcileResearch(kept,{proof:second}),{patch:{},conflicts:{}});
 assert.equal(kept.proof,local.proof);
 const accepted={...local,...resolveResearch(local,'proof',second,true)};
 assert.equal(accepted.proof,second.text);assert.equal(accepted.researchHistory[0].text,local.proof);
 assert.equal(reconcileResearch(accepted,{proof:{text:'Next',hash:'three'}}).patch.proof,'Next');
});
test('research reads real files with content revisions and rejects oversized files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'math-research-sync-'));
 try{
  await fs.mkdir(path.join(root,'research'));
  assert.deepEqual(await readResearchArtifacts(root),{});
  await fs.writeFile(path.join(root,'research/proof.md'),first.text);
  const old=await readResearchArtifacts(root);assert.equal(old.proof.text,first.text);assert.equal(old.proof.hash.length,64);
  await fs.writeFile(path.join(root,'research/proof.md'),second.text);
  assert.notEqual((await readResearchArtifacts(root)).proof.hash,old.proof.hash);
  await fs.writeFile(path.join(root,'research/summary.md'),'x'.repeat(1024*1024+1));
  await assert.rejects(readResearchArtifacts(root),/under 1 MB/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
