import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {projectFile} from './axiovela/assistant-api.mjs';
const {leanSetupCommand,launchTerminal}=createRequire(import.meta.url)('../desktop/provider-setup.cjs');
const stages={launching:'Opening setup terminal…',prerequisites:'Checking prerequisites…',installing:'Downloading Lean and Lake…',dependencies:'Preparing mathematical libraries…',checking:'Compiling the setup test…'};
export class LeanSetup {
 constructor(data,projects){this.data=data;this.projects=projects;this.launches=new Set();}
 directory(id){return path.join(this.data,'lean-setup',id);}
 async info(id){
  const root=await this.projects.root(id),directory=await projectFile(root,'certificates',true),statusDir=this.directory(id);
  return {root,directory,statusDir,command:process.platform==='linux'?leanSetupCommand(directory,statusDir):null};
 }
 async status(id){
  const {root,directory,statusDir,command}=await this.info(id);
  const read=async name=>{try{return (await fs.readFile(path.join(statusDir,name),'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;return '';}};
  let state=await read('state')||'not-checked',detail='',busy=Object.hasOwn(stages,state);
  if(busy){
   const pid=Number(await read('lock/pid'));let alive=false;
   if(Number.isSafeInteger(pid)&&pid>1)try{process.kill(pid,0);alive=true;}catch(e){alive=e.code==='EPERM';}
   const age=Date.now()-(await fs.stat(path.join(statusDir,'state'))).mtimeMs;
   if(!alive&&age>15000){state='interrupted';busy=false;detail='Setup stopped before its test passed. Retry setup.';}
  }
  if(state==='ready'){
   try{
    for(const name of ['lean-path','lake-path'])await fs.access(await read(name),fs.constants.X_OK);
    const fingerprints=await read('environment.sha256');
    if(!fingerprints)throw Error('Environment record is missing.');
    const recordedNames=[];
    for(const line of fingerprints.split('\n')){
     const match=/^([a-f0-9]{64})  (lean-toolchain|lake-manifest\.json|lakefile\.lean|lakefile\.toml)$/.exec(line);
     if(!match)throw Error('Invalid environment record.');
     recordedNames.push(match[2]);
     const bytes=await fs.readFile(await projectFile(root,'certificates/'+match[2]));
     if(createHash('sha256').update(bytes).digest('hex')!==match[1])throw Error('Environment changed.');
    }
    const currentNames=(await fs.readdir(directory)).filter(name=>['lean-toolchain','lake-manifest.json','lakefile.lean','lakefile.toml'].includes(name)).sort();
    if(JSON.stringify(recordedNames.sort())!==JSON.stringify(currentNames))throw Error('Environment file set changed.');
    if(await read('mathlib')==='yes')await fs.access(path.join(directory,'.lake/packages/mathlib/.lake/build/lib/lean/Mathlib.olean'));
   }catch{state='needs-setup';detail='The toolchain or dependencies changed or are missing. Run setup again to check this environment.';}
  }
  if(state==='failed')detail='Setup failed. Read the terminal output or setup details, fix the reported issue, then retry.';
  return {state,busy,automaticSetup:process.platform==='linux',message:process.platform!=='linux'?'Automatic Lean setup is currently available on Linux. Install Elan using the Lean installation guide, prepare this project’s pinned dependencies, then run a Lean check.':stages[state]||detail,command,toolchain:await read('toolchain'),log:(['failed','interrupted'].includes(state)?await read('output.log'):'').slice(-6000)};
 }
 async start(id){
  if(process.platform!=='linux')throw Error('One-click project setup is currently available on Linux.');
  if(this.launches.has(id))throw Error('Lean setup is already running for this project.');
  this.launches.add(id);
  try{
   if((await this.status(id)).busy)throw Error('Lean setup is already running for this project.');
   const {command,statusDir}=await this.info(id);
   await fs.mkdir(statusDir,{recursive:true});await fs.writeFile(path.join(statusDir,'state'),'launching');
   try{await launchTerminal(command,'Lean project setup');}catch(e){await fs.writeFile(path.join(statusDir,'state'),'failed');await fs.writeFile(path.join(statusDir,'output.log'),e.message);throw e;}
   return {message:'Setup opened in your terminal. Downloads and the test are automatic; this panel shows the result. Close the terminal to stop setup.'};
  }finally{this.launches.delete(id);}
 }
}
