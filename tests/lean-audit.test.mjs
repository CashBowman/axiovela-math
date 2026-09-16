import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {auditLean, declarationVerdict} from '../server/lean-audit.mjs';
import {runCommand} from '../server/checks.mjs';
import {resultCheckState} from '../shared/certificate-results.mjs';
test('declaration audit distinguishes standard axioms, unfinished dependencies and arbitrary axioms', () => {
 assert.equal(declarationVerdict({kind:'theorem',axioms:['propext','Classical.choice','Quot.sound']}),'checked');
 assert.equal(declarationVerdict({kind:'theorem',axioms:['sorryAx']}),'incomplete');
 assert.equal(declarationVerdict({kind:'theorem',axioms:['myAssumption']}),'extra-axioms');
 assert.equal(declarationVerdict({kind:'other',axioms:[]}),'not-a-theorem');
 const result={formal:{declarations:['good']}},data={sourceHash:'x',records:[{status:'build-passed',declarationChecks:[{name:'good',status:'checked'}]}]};
 assert.equal(resultCheckState(result,data).label,'Proofs verified');
 assert.equal(resultCheckState(result,{...data,stale:true}).label,'Recheck needed');
 assert.equal(resultCheckState(result,{...data,running:true}).label,'Checking proofs');
 assert.equal(resultCheckState(result,{...data,records:[{status:'build-passed'}]}).tone,'muted');
 assert.notEqual(resultCheckState({formal:{declarations:['other']}},data).label,'Proofs verified');
});
test('real pinned Lean audits named theorems, including transitive sorry and fake mappings', {skip: !process.env.AXIOVELA_AUDIT_TEST_LEAN}, async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lean-audit-test-'));
 try {
  await fs.mkdir(path.join(root,'certificates'));
  await fs.writeFile(path.join(root,'certificates/Main.lean'),`theorem good : True := by trivial\ntheorem unfinished : False := by sorry\ntheorem indirect : False := unfinished\naxiom extra : False\ntheorem assumed : False := extra\ndef justDefinition : Nat := 1\n`);
  const declarations=['good','indirect','assumed','absent','justDefinition','bad\n#eval 1'];
  const run=(_cmd,args,cwd,timeout,signal)=>runCommand(process.env.AXIOVELA_AUDIT_TEST_LEAN,args.slice(2),cwd,timeout,signal);
  const rows=await auditLean(root,{declarations},{},run),statuses=Object.fromEntries(rows.map(r=>[r.name,r.status]));
  assert.equal(statuses.good,'checked');assert.equal(statuses.indirect,'incomplete');assert.equal(statuses.assumed,'extra-axioms');assert.equal(statuses.absent,'missing');assert.equal(statuses.justDefinition,'not-a-theorem');assert.equal(statuses['bad\n#eval 1'],'invalid-name');
  assert.equal(rows.find(r=>r.name==='good').type,'True');
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
