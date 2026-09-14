import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const base=process.env.AXIOVELA_MATH_INSTALL_HOME||os.homedir();
const source=path.resolve('out/Axiovela Math-linux-x64');
await fs.access(path.join(source,'axiovela-math'));
// Install only application files. Profile and project data are never copied or removed.
const hash=createHash('sha256').update(await fs.readFile(path.resolve(`out/installers/Axiovela-Math-${pkg.version}-linux-x64.tar.gz`))).digest('hex').slice(0,12);
const parent=path.join(base,'.local/share/axiovela-math/applications');
await fs.mkdir(parent,{recursive:true});
const folder=path.join(parent,`${pkg.version}-${hash}`);
try{await fs.access(folder);}catch(e){if(e.code!=='ENOENT')throw e;const temp=await fs.mkdtemp(path.join(parent,'.install-'));try{await fs.cp(source,temp,{recursive:true});await fs.rename(temp,folder);}catch(e){await fs.rm(temp,{recursive:true,force:true});throw e;}}
const launcherDir=path.join(base,'.local/share/applications');await fs.mkdir(launcherDir,{recursive:true});
const launcher=path.join(launcherDir,'org.axiovela.math.desktop');
const quote=value=>'"'+value.replace(/([\\"`$])/g,'\\$1').replace(/%/g,'%%')+'"';
const contents=`[Desktop Entry]\nType=Application\nName=Axiovela Math\nComment=Mathematics research and publication workspace\nExec=${quote(path.join(folder,'axiovela-math'))}\nIcon=${path.join(folder,'resources/app/public/workbench-mark.png')}\nTerminal=false\nCategories=Education;Math;\nStartupNotify=true\nStartupWMClass=org.axiovela.math\n`;
let backup=null;try{const old=await fs.readFile(launcher,'utf8');if(old!==contents){backup=launcher+'.before-'+Date.now();await fs.copyFile(launcher,backup);}}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(launcher+'.tmp',contents,{mode:0o755});await fs.rename(launcher+'.tmp',launcher);
console.log(JSON.stringify({installed:folder,launcher,previousLauncherBackup:backup,dataUnchanged:true},null,2));
