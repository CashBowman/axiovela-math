import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import electron from 'electron';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-math-desktop-'));
const env={...process.env,AXIOVELA_MATH_DESKTOP_PROFILE:profile,AXIOVELA_MATH_DESKTOP_SMOKE:'1',AXIOVELA_BRIDGE_DISCOVERY_PATHS:path.join(profile,'no-discovery'),WORKBENCH_PROVIDER_SETTINGS_PATH:path.join(profile,'no-providers.json')};
for(const key of ['ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete env[key];
const packaged=process.argv.includes('--packaged'),image=process.argv.includes('--appimage');
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const installed=process.argv.includes('--installed');
const receipt=installed?JSON.parse(await fs.readFile('docs/linux-installation.json','utf8')):null;
const executable=installed?path.join(receipt.installed,'axiovela-math'):image?path.resolve(`out/installers/Axiovela-Math-${pkg.version}-linux-${process.arch}.AppImage`):packaged?path.resolve('out/Axiovela Math-linux-'+process.arch+'/axiovela-math'):electron;
const suffix=installed?'installed':image?(process.argv.includes('--mounted')?'appimage-mounted':'appimage'):packaged?'packaged':'source';
async function launch(reopen){
 let output='';const child=spawn(executable,image?(process.argv.includes('--mounted')?[]:['--appimage-extract-and-run']):(packaged||installed)?[]:['.'],{env:{...env,...(reopen?{AXIOVELA_MATH_SMOKE_REOPEN:'1'}:{})},stdio:'pipe'});
 for(const stream of [child.stdout,child.stderr])stream.on('data',x=>output+=x);
 const timeout=setTimeout(()=>child.kill('SIGKILL'),35000);
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0||!output.includes('AXIOVELA_MATH_DESKTOP_READY'))throw Error(output||'Desktop failed to reach ready state.');}finally{clearTimeout(timeout);}
 const result=JSON.parse(await fs.readFile(path.join(profile,'desktop-smoke.json'),'utf8'));
 assert.equal(result.userData,profile);assert.equal(result.reopened,reopen);
 assert.throws(()=>process.kill(result.backendPid,0),{code:'ESRCH'},'Backend must stop before desktop exit.');
 return result;
}
try{
 const first=await launch(false),second=await launch(true);assert.equal(second.origin,first.origin);
 await fs.mkdir('.local/qa',{recursive:true});await fs.copyFile(path.join(profile,'desktop-smoke.png'),`.local/qa/desktop-linux-${suffix}.png`);
 await fs.writeFile(`docs/desktop-${suffix}-validation.json`,JSON.stringify({platform:process.platform,arch:process.arch,appLaunched:true,kind:suffix,stableOrigin:true,storageSurvivesRelaunch:true,isolatedChromiumProfile:true,backendShutdown:true,screenshot:`.local/qa/desktop-linux-${suffix}.png`,liveCredentialsUsed:false,checkedAt:new Date().toISOString()},null,2)+'\n');
 console.log(`Linux ${suffix} passed: two launches, retained storage, isolated profile and clean backend shutdown.`);
}finally{await fs.rm(profile,{recursive:true,force:true});}
