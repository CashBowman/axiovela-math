// Real Lean/mathlib acceptance. Provision a disposable toolchain/library fixture first;
// the UI button invokes the real packaged installer through a terminal test driver.
import {_electron as electron} from 'playwright';
import electronBinary from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const fixture=path.resolve(process.env.AXIOVELA_LEAN_ACCEPTANCE_FIXTURE||'.local/lean-acceptance');
await fs.access(path.join(fixture,'project/certificates/.lake/packages/mathlib/.lake/build/lib/lean/Mathlib.olean'));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'math-real-lean-')),bin=path.join(profile,'bin');await fs.mkdir(bin);
await fs.writeFile(path.join(bin,'x-terminal-emulator'),'#!/bin/bash\n[ "$1" = -e ] && shift\nexec "$@" </dev/null\n',{mode:0o755});
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,ELAN_HOME:path.join(fixture,'elan'),AXIOVELA_LAKE_PATH:path.join(fixture,'elan/bin/lake'),AXIOVELA_MATH_DESKTOP_PROFILE:profile,AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(profile,'none'),WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(profile,'providers.json')};
for(const key of ['ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
const source=process.argv.includes('--source');let app,page;const checks=[];
try{
 app=await electron.launch({executablePath:source?electronBinary:path.resolve('out/Axiovela Math-linux-x64/axiovela-math'),args:source?['.']:[],env});page=await app.firstWindow();await page.getByRole('heading',{name:'Executive summary'}).waitFor();
 const origin=new URL(page.url()).origin,initial=await(await page.request.get(origin+'/api/state')).json(),id=initial.activeProjectId;
 // Register only our disposable fixture, before the backend reads its registry on relaunch.
 await fs.writeFile(path.join(profile,'workspace/project-folders.json'),JSON.stringify({[id]:path.join(fixture,'project')}));
 await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});await app.close();app=null;
 app=await electron.launch({executablePath:source?electronBinary:path.resolve('out/Axiovela Math-linux-x64/axiovela-math'),args:source?['.']:[],env});page=await app.firstWindow();await page.getByRole('heading',{name:'Executive summary'}).waitFor();
 const cert=path.join(fixture,'project/certificates'),formal='import Mathlib\n\ntheorem axiovela_installation_test (n : Nat) : n + 0 = n := by simp\n';await fs.writeFile(path.join(cert,'Main.lean'),formal);
 const hash=async file=>createHash('sha256').update(await fs.readFile(path.join(cert,file))).digest('hex');
 const before=await Promise.all(['Main.lean','lean-toolchain','lake-manifest.json','lakefile.toml'].map(hash));
 await page.getByRole('button',{name:'Lean Certificates',exact:true}).click();await page.getByRole('button',{name:'Set up Lean',exact:true}).click();
 await page.getByText('Lean setup test passed',{exact:true}).waitFor({timeout:180000});
 assert.deepEqual(await Promise.all(['Main.lean','lean-toolchain','lake-manifest.json','lakefile.toml'].map(hash)),before);checks.push('packaged setup button runs real Lean/mathlib test through terminal driver and preserves source/pins');
 await page.getByRole('button',{name:'Run Lean check',exact:true}).click();await page.getByRole('heading',{name:'build passed',exact:true}).waitFor({timeout:120000});
 const state=await(await page.request.get(origin+'/api/lean?project='+id)).json();assert.equal(state.setup.state,'ready');assert.equal(state.records[0].status,'build-passed');assert.equal(state.records[0].formalCertificate,false);checks.push('app checker compiles real Mathlib theorem; successful setup never issues a whole-claim certificate');
 await page.screenshot({path:'.local/qa/lean-setup-ready.png'});
 await fs.appendFile(path.join(cert,'lakefile.toml'),'\n# setup acceptance change\n');await page.getByRole('button',{name:'Retry Lean setup'}).waitFor();checks.push('environment change revokes setup readiness');
 await fs.writeFile(path.join(cert,'lakefile.toml'),(await fs.readFile(path.join(cert,'lakefile.toml'),'utf8')).replace('\n# setup acceptance change\n',''));
 await fs.writeFile('docs/lean-setup-acceptance.json',JSON.stringify({passed:true,realLean:true,realMathlib:true,toolchain:'leanprover/lean4:v4.19.0',kind:source?'source':'packaged',terminalWindow:'test driver executes real setup script',checks,liveCredentialsUsed:false,checkedAt:new Date().toISOString()},null,2)+'\n');console.log(JSON.stringify(checks));
}catch(e){if(page&&!page.isClosed())await page.screenshot({path:'.local/qa/lean-setup-acceptance-failure.png'});throw e;}finally{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close();}await fs.rm(profile,{recursive:true,force:true});}
