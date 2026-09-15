import {packager} from '@electron/packager';
import {build,Platform,Arch} from 'electron-builder';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
if(process.platform!=='linux'||process.arch!=='x64')throw Error('This release currently supports Linux x64, matching the bundled Tectonic binary.');
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const tool=JSON.parse(await fs.readFile('desktop/tools/build.json','utf8'));
if(createHash('sha256').update(await fs.readFile('desktop/tools/tectonic')).digest('hex')!==tool.binarySha256)throw Error('Bundled Tectonic does not match its reviewed hash.');
// A clean staging tree keeps personal files and development tools out of releases.
const stage=path.resolve('.local/linux-stage');await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(stage,{recursive:true});
for(const folder of ['dist','server','shared','desktop'])await fs.cp(folder,path.join(stage,folder),{recursive:true});
await fs.mkdir(path.join(stage,'public'));await fs.copyFile('public/workbench-mark.png',path.join(stage,'public/workbench-mark.png'));
await fs.copyFile('LICENSE',path.join(stage,'LICENSE'));
const runtimePkg={name:pkg.name,version:pkg.version,description:pkg.description,productName:pkg.productName,desktopName:pkg.desktopName,author:pkg.author,license:pkg.license,type:'module',main:pkg.main,dependencies:pkg.dependencies};
await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(runtimePkg,null,2));
await fs.copyFile('package-lock.json',path.join(stage,'package-lock.json'));
function run(command,args,options={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',...options});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${command} exited ${code}`)));});}
await run('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage});
await fs.rm(path.join(stage,'package-lock.json'));
const outputs=await packager({dir:stage,name:pkg.productName,executableName:'axiovela-math',platform:'linux',arch:'x64',electronVersion:pkg.devDependencies.electron,out:'out',overwrite:true,prune:false,asar:false});
const appDir=outputs[0],shipped=path.join(appDir,'resources/app');
const roots=await fs.readdir(shipped);for(const name of roots)if(!['dist','server','shared','desktop','public','node_modules','package.json','LICENSE'].includes(name))throw Error('Unexpected packaged content: '+name);
const installers=path.resolve('out/installers');await fs.mkdir(installers,{recursive:true});
await build({prepackaged:appDir,targets:Platform.LINUX.createTarget(['AppImage'],Arch.x64),publish:'never',config:{appId:'org.axiovela.math',productName:pkg.productName,asar:false,directories:{output:installers},linux:{syncDesktopName:true,icon:'public/workbench-mark.png',executableName:'axiovela-math',category:'Education',artifactName:'Axiovela-Math-${version}-linux-x64.${ext}',desktop:{entry:{Name:'Axiovela Math',Comment:pkg.description,Categories:'Education;Science;Math;'}}}}});
const tarName=`Axiovela-Math-${pkg.version}-linux-x64.tar.gz`;
await fs.writeFile(path.join(appDir,'START-HERE.txt'),`Axiovela Math ${pkg.version}\n\nOpen axiovela-math to launch the application. Node.js is bundled.\nProjects, conversations and settings stay in your OS application-data folder, outside this application.\n\nConnect a provider using the button below chat. CLI accounts and API keys use their own access.\nTectonic is included; first LaTeX rendering may download TeX resources. Open Lean Certificates and click Set up Lean to download Lean/Lake and project libraries and run an installation test. The first setup needs internet and several GB of free space.\n\nTo update, close the app and replace its application folder or AppImage. Keep your data folder and research projects. Use Help → Check for updates for signed downloads and guided installation. The app never replaces itself or restarts automatically.\n`);
await run('tar',['-czf',path.join(installers,tarName),'-C',path.dirname(appDir),path.basename(appDir)]);
const artifacts=[`Axiovela-Math-${pkg.version}-linux-x64.AppImage`,tarName];let hashes='';
for(const name of artifacts){const bytes=await fs.readFile(path.join(installers,name));hashes+=`${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`;}
await fs.writeFile(path.join(installers,'SHA256SUMS'),hashes);
await fs.writeFile('docs/linux-package-validation.json',JSON.stringify({version:pkg.version,platform:'linux',arch:'x64',appDir,artifacts,packageRoots:roots,cleanStaging:true,automaticPublishing:false,builtAt:new Date().toISOString()},null,2)+'\n');
console.log(`Linux app: ${appDir}\nDistributables: ${installers}`);
