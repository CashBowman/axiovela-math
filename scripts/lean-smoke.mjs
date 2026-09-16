import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-math-lean-ui-')),url='http://127.0.0.1:8795';
const env={...process.env,PORT:'8795',AXIOVELA_MATH_DATA:data,WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(data,'private/providers.json'),AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(data,'no-discovery'),WORKBENCH_CODEX_PATH:path.resolve('scripts/fixtures/assistant-rpc.mjs'),AXIOVELA_LAKE_PATH:path.join(data,'no-lake')};
for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
const service=spawn(process.execPath,['server/index.mjs'],{env,stdio:'pipe'});let browser,page;const checks=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const initial=await(await fetch(url+'/api/state')).json(),id=initial.activeProjectId;
 const post=async(endpoint,body,method='POST')=>{const r=await fetch(url+endpoint+'?project='+id,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();};
 const c=await post('/api/conversations',{role:'research'});await post('/api/conversation',{id:c.id,mode:'ask'},'PUT');
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1560,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.getByRole('button',{name:'Enable project editing'}).waitFor();await page.getByLabel('research message').fill('Shared draft before formalization');
 await page.getByRole('button',{name:'Lean Certificates',exact:true}).click();assert.equal(await page.getByLabel('research message').inputValue(),'Shared draft before formalization');await page.waitForFunction(id=>document.querySelector('[aria-label="research conversation"]')?.value===id,c.id);
 await page.getByText('Lean checker is not installed',{exact:true}).waitFor();await page.getByRole('button',{name:'Enable project editing'}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="research access"]').value==='auto');checks.push('Research and Lean share drafts, conversation and access');
 await page.getByLabel('research message').fill('FIXTURE_LEAN_ARTIFACT');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('heading',{name:'Formal source saved',exact:true}).waitFor();await page.getByRole('heading',{name:'Addition of zero',exact:true}).waitFor();await page.getByRole('heading',{name:'Proof checks pending',exact:true}).waitFor();assert.equal(await page.locator('textarea.code').count(),0);assert.equal(await page.getByText('theorem fixture_add_zero',{exact:false}).count(),0);checks.push('real saved Lean files and readable target appear automatically without a code panel');
 const root=(await(await fetch(url+'/api/project-root?project='+id)).json()).folder;assert.match(await fs.readFile(path.join(root,'certificates/Main.lean'),'utf8'),/fixture_add_zero/);
 await page.getByRole('button',{name:'Research',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="research conversation"]')?.value===id,c.id);await page.getByRole('button',{name:'Library',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[aria-label="research conversation"]')?.value===id,c.id);await page.getByRole('button',{name:'Lean Certificates',exact:true}).click();
 await fs.writeFile(path.join(root,'certificates/Helper.lean'),'theorem helper : True := by trivial');await page.getByText('The formalization changed since this check.',{exact:false}).waitFor();checks.push('supporting-source changes invalidate prior check display');
 await page.getByRole('button',{name:'Run Lean check'}).click();await page.getByRole('heading',{name:'Checker unavailable',exact:true}).waitFor();checks.push('missing checker remains an explicit blocker, never a success');
 await fs.writeFile(env.AXIOVELA_LAKE_PATH, `#!${process.execPath}\nconst fs=require('fs');const file=process.argv[4];if(file!=='Main.lean'){const marker=fs.readFileSync(file,'utf8').match(/AXIOVELA_AUDIT_[a-f0-9]+:/)[0];console.log(marker+JSON.stringify({name:'fixture_add_zero',kind:'theorem',type:'∀ n : Nat, n + 0 = n',axioms:[]}));}\n`, {mode:0o755});
 await page.getByRole('button',{name:'Run Lean check'}).click();await page.getByRole('region',{name:'Selected result'}).getByText('Proofs verified',{exact:true}).waitFor();
 await page.getByText('Proof verified; only standard Lean axioms used.',{exact:true}).waitFor();checks.push('named-theorem audit produces a per-result proof status separate from assistant statement assessment');
 await page.screenshot({path:'.local/qa/shared-lean-panels.png'});
 await page.getByRole('button',{name:'Research',exact:true}).click();await page.getByLabel('research message').fill('FIXTURE_LEAN_DRAFT');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Save Lean draft'}).waitFor();await page.getByRole('button',{name:'Save Lean draft'}).click();await page.getByText('A different formalization is already saved.',{exact:false}).waitFor();assert.match(await fs.readFile(path.join(root,'certificates/Main.lean'),'utf8'),/fixture_add_zero/);checks.push('saving an earlier chat draft cannot overwrite existing formal work');
 assert.deepEqual(errors,[]);await fs.writeFile('docs/lean-validation.json',JSON.stringify({passed:true,checks,liveCredentialsUsed:false,checkedAt:new Date().toISOString()},null,2)+'\n');console.log(JSON.stringify(checks));
}catch(e){if(page)await page.screenshot({path:'.local/qa/shared-lean-failure.png'});throw e;}finally{await browser?.close();service.kill('SIGTERM');await new Promise(r=>service.once('exit',r));await fs.rm(data,{recursive:true,force:true});}
