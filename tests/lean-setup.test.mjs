import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {LeanSetup} from '../server/lean-setup.mjs';
const script=path.resolve('desktop/lean-setup.sh');
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),"math-setup ' literal$()-"));try{const root=path.join(dir,'project'),status=path.join(dir,'lean-setup','p');await fs.mkdir(path.join(root,'certificates'),{recursive:true});await fs.mkdir(status,{recursive:true});const setup=new LeanSetup(dir,{root:async id=>{assert.equal(id,'p');return root;}});await fn({dir,root,status,setup});}finally{await fs.rm(dir,{recursive:true,force:true});}}
const run=(args,env)=>new Promise((resolve,reject)=>{const child=spawn('bash',[script,...args],{env,stdio:'pipe'});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.once('error',reject);child.once('exit',code=>resolve({code,output}));});
test('setup receipt requires real files and matching environment, and interrupted setup is retryable',()=>fixture(async({root,status,setup})=>{
 assert.equal((await setup.status('p')).state,'not-checked');
 await fs.writeFile(path.join(status,'state'),'ready');assert.equal((await setup.status('p')).state,'needs-setup');
 for(const file of ['lean-toolchain','lake-manifest.json','lakefile.toml'])await fs.writeFile(path.join(root,'certificates',file),file);
 for(const name of ['lean-path','lake-path'])await fs.writeFile(path.join(status,name),process.execPath);
 let record='';for(const file of ['lean-toolchain','lake-manifest.json','lakefile.toml'])record+=createHash('sha256').update(file).digest('hex')+'  '+file+'\n';
 await fs.writeFile(path.join(status,'environment.sha256'),record);assert.equal((await setup.status('p')).state,'ready');
 await fs.writeFile(path.join(root,'certificates/lakefile.lean'),'new config');assert.equal((await setup.status('p')).state,'needs-setup');await fs.unlink(path.join(root,'certificates/lakefile.lean'));
 await fs.writeFile(path.join(root,'certificates/lean-toolchain'),'changed');assert.equal((await setup.status('p')).state,'needs-setup');
 await fs.writeFile(path.join(status,'state'),'installing');await fs.utimes(path.join(status,'state'),new Date(0),new Date(0));assert.equal((await setup.status('p')).state,'interrupted');
}));
test('failed installer is never ready and preserves existing proof and pins',{skip:process.platform==='win32'?'Automatic Lean setup is not offered on Windows.':false},()=>fixture(async({dir,root,status})=>{
 const elan=path.join(dir,'elan');await fs.mkdir(path.join(elan,'bin'),{recursive:true});await fs.writeFile(path.join(elan,'bin/elan'),'#!/bin/sh\necho "download failed" >&2\nexit 42\n',{mode:0o755});
 await fs.writeFile(path.join(root,'certificates/Main.lean'),'theorem retained : True := by trivial');await fs.writeFile(path.join(root,'certificates/lean-toolchain'),'leanprover/lean4:v4.19.0\n');
 const r=await run([path.join(root,'certificates'),status],{...process.env,ELAN_HOME:elan});assert.equal(r.code,42);assert.match(r.output,/download failed/);assert.equal((await fs.readFile(path.join(status,'state'),'utf8')).trim(),'failed');assert.equal(await fs.readFile(path.join(root,'certificates/Main.lean'),'utf8'),'theorem retained : True := by trivial');await assert.rejects(fs.access(path.join(status,'lock')));
}));
test('existing partial environment is not silently repinned, and setup paths remain shell literals',{skip:process.platform==='win32'?'Automatic Lean setup is not offered on Windows.':false},()=>fixture(async({dir,root,status,setup})=>{
 const elan=path.join(dir,'elan');await fs.mkdir(path.join(elan,'bin'),{recursive:true});await fs.writeFile(path.join(elan,'bin/elan'),'#!/bin/sh\nexit 99\n',{mode:0o755});await fs.writeFile(path.join(root,'certificates/lakefile.toml'),'retained');
 const r=await run([path.join(root,'certificates'),status],{...process.env,ELAN_HOME:elan});assert.equal(r.code,1);assert.match(r.output,/no pinned Lean version/);await assert.rejects(fs.access(path.join(root,'certificates/lean-toolchain')));
 const {command}=await setup.info('p');const parsed=await new Promise((resolve,reject)=>{const child=spawn('bash',['-c',command.replace(/^bash /,'printf "%s\\n" ')],{stdio:'pipe'});let out='';child.stdout.on('data',x=>out+=x);child.once('error',reject);child.once('exit',code=>code?reject(Error(String(code))):resolve(out.trim().split('\n')));});assert.equal(parsed[1],path.join(root,'certificates'));assert.equal(parsed[2],status);
}));
