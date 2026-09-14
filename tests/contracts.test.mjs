import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {blankProject,certificateGate,compilePrompt,reviewIssues} from '../shared/research.mjs';
import {Store,validateState} from '../server/store.mjs';
const claim={id:'C1',revision:2,certificateSourceHash:'sha256:example'};
const good={origin:'trusted-runner',claimId:'C1',claimRevision:2,sourceHash:'sha256:example',exitCode:0,toolchain:'lean-test',mathlibRevision:'test-commit',command:'lake build',hasSorry:false,unapprovedAxioms:[],statementAudit:'approved',majorGaps:[]};
test('certificate contract rejects contradictory success and missing fields',()=>{
 assert.equal(certificateGate(claim,good).accepted,true);
 for(const patch of [{majorGaps:['Central lemma false']},{majorGaps:undefined},{unapprovedAxioms:undefined},{hasSorry:true},{statementAudit:'unknown'},{origin:'model'},{exitCode:null}])assert.equal(certificateGate(claim,{...good,...patch}).accepted,false);
});
test('certificate contract rejects changed target and stale source',()=>{
 assert.equal(certificateGate({...claim,revision:3},good).accepted,false);
 assert.equal(certificateGate({...claim,certificateSourceHash:'changed'},good).accepted,false);
 assert.equal(certificateGate(claim,null).accepted,false);
});
test('workspace rejects invented formal status and unrecorded human review',()=>{
 const p=blankProject('test');const s={activeProjectId:p.id,projects:[p]};
 p.claims=[{id:'C1',statement:'Target',revision:1,status:'kernel-checked'}];assert.throws(()=>validateState(s),/verifier service/);
 p.claims[0].status='human-reviewed';assert.throws(()=>validateState(s),/reviewer/);
 p.claims[0].reviewer='Researcher';p.claims[0].reviewNote='Recorded assessment';assert.doesNotThrow(()=>validateState(s));
});
test('empty project cannot pass readiness by vacuous truth',()=>{const issues=reviewIssues(blankProject('test'));assert.ok(issues.some(x=>x.includes('No mathematical claims')));assert.ok(issues.some(x=>x.includes('human assessment')));});
test('prepared prompts preserve original target and never imply execution',()=>{const p=blankProject('test');p.question='For every n, does P(n) hold?';const prompt=compilePrompt('lean',p);assert.ok(prompt.includes(p.question));assert.ok(prompt.includes('not a running job'));assert.ok(prompt.includes('axiom audit'));});
test('atomic store roundtrip and simultaneous stale writes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-math-test-'));try{const store=new Store(dir);const initial=await store.read();const saved=await store.save(initial,0);saved.projects[0].notes='retained';
 const outcomes=await Promise.allSettled([store.save(saved,1),store.save(saved,1)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.status,409);assert.equal((await store.read()).projects[0].notes,'retained');assert.equal((await store.read()).revision,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('backend refuses to retain a review after the statement changes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-math-stale-'));try{const store=new Store(dir);const initial=await store.read();initial.projects[0].claims=[{id:'C1',revision:1,statement:'Original',status:'human-reviewed',reviewer:'A',reviewNote:'Reviewed original'}];const saved=await store.save(initial,0);saved.projects[0].claims[0].statement='Different target';await assert.rejects(store.save(saved,1),/changed claim/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
