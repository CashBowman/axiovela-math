import {_electron as electron} from 'playwright';
import electronBinary from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'math-updates-'));
const env={...process.env,AXIOVELA_MATH_DESKTOP_PROFILE:profile,AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(profile,'none'),WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(profile,'providers.json'),WORKBENCH_CODEX_PATH:path.resolve('scripts/fixtures/assistant-rpc.mjs')};
for(const key of ['ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
const packaged=process.argv.includes('--packaged');let app,page;const checks=[];
try{
 app=await electron.launch({executablePath:packaged?path.resolve('out/Axiovela Math-linux-x64/axiovela-math'):electronBinary,args:packaged?[]:['.'],env});page=await app.firstWindow();page.on('dialog',()=>{});await page.getByRole('heading',{name:'Executive summary'}).waitFor();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Choose research model and provider'}).click();await page.getByRole('button',{name:'Use model',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByLabel('research message').fill('FIXTURE_HANG');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Stop conversation',exact:true}).waitFor();await page.getByLabel('research message').fill('Keep my unsent research question');
 await page.getByRole('button',{name:'Write-up',exact:true}).click();await page.getByLabel('Manuscript source').fill('# Keep my unsaved manuscript');
 // Test debugger injection, no production trust override or renderer key input.
 await app.evaluate(({app})=>{
  const require=process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(),'package.json'));
  const {Updates}=require('./desktop/updates.cjs'),{generateKeyPairSync,sign,createHash}=process.getBuiltinModule('node:crypto');const pair=generateKeyPairSync('ed25519');const bytes=Buffer.from('signed update fixture');const version='99.0.0';
  const manifest={schema:1,version,tag:'v'+version,publishedAt:new Date().toISOString(),expiresAt:null,dataCompatibility:'workspace-v1',notes:'Verified fixture release notes.',assets:[{platform:'linux',arch:'x64',format:'AppImage',name:'Axiovela-Math-99.0.0-linux-x64.AppImage',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};const payload=JSON.stringify(manifest),envelope={payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64')};
  const check=Updates.prototype.check;globalThis.updateFixture={slow:true};
  Updates.prototype.check=function(){this.keys=[pair.publicKey.export({type:'spki',format:'pem'})];this.fetcher=async(url,{signal})=>url.includes('api.github.com')?Response.json([{tag_name:'v'+version}]):url.endsWith('axiovela-math-update.json')?Response.json(envelope):!globalThis.updateFixture.slow?new Response(bytes):new Response(new ReadableStream({start(controller){controller.enqueue(bytes.subarray(0,4));signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});}}));return check.call(this);};
 });
 await page.getByRole('button',{name:'Updates',exact:true}).click();await page.getByRole('button',{name:'Download update',exact:true}).waitFor();assert.equal(await page.getByLabel('Release channel').inputValue(),'stable');
 await page.getByRole('button',{name:'Download update',exact:true}).click();await page.getByRole('progressbar',{name:'Update download'}).waitFor();await page.getByRole('button',{name:'Cancel download',exact:true}).click();await page.getByRole('button',{name:'Retry download',exact:true}).waitFor();checks.push('real native IPC opens updates; signed fixture download supports progress, cancellation and retry');
 assert.equal(await page.getByLabel('Manuscript source').inputValue(),'# Keep my unsaved manuscript');await app.evaluate(()=>{globalThis.updateFixture.slow=false;});await page.getByRole('button',{name:'Retry download',exact:true}).click();await page.getByRole('button',{name:'Show downloaded update'}).waitFor();
 const origin=new URL(page.url()).origin;assert.equal((await(await page.request.get(origin+'/api/activity')).json()).running,1);await assert.rejects(page.evaluate(()=>window.methodflowDesktop.update('install')),/Unknown update action/);checks.push('verified download cannot install or interrupt a running assistant and unsaved publication');
 await fs.mkdir('.local/qa',{recursive:true});await page.screenshot({path:'.local/qa/updates-ready.png'});await page.getByRole('button',{name:'Later',exact:true}).click();await page.getByRole('button',{name:'Research',exact:true}).click();assert.equal(await page.getByLabel('research message').inputValue(),'Keep my unsent research question');await page.getByRole('button',{name:'Stop conversation',exact:true}).click();await page.getByRole('button',{name:'Stop conversation',exact:true}).waitFor({state:'hidden'});
 await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(i=>i.label==='Help').submenu.items.find(i=>i.label==='Check for updates…').click());await page.getByRole('button',{name:'Show downloaded update'}).waitFor();checks.push('Later preserves drafts; Help menu reopens the update panel');
 assert.deepEqual(errors,[]);await fs.writeFile('docs/updates-validation.json',JSON.stringify({passed:true,packaged,checks,liveCredentialsUsed:false,checkedAt:new Date().toISOString()},null,2)+'\n');console.log(JSON.stringify(checks));
}catch(e){if(page&&!page.isClosed())await page.screenshot({path:'.local/qa/updates-failure.png'});throw e;}finally{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();}await fs.rm(profile,{recursive:true,force:true});}
