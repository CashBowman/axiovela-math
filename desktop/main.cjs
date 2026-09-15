const {app,BrowserWindow,ipcMain,dialog,shell,safeStorage,Menu}=require('electron');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn,execFile}=require('node:child_process');
const {launchSetup}=require('./provider-setup.cjs');
const {Updates,releaseRoot}=require('./updates.cjs');
let updates;
let win,backend,origin,userDir,approvedClose=false,allowExit=false,shutdownPromise;
app.setName('Axiovela Math');
// Keep Chromium drafts and native workspace data in the same isolated profile.
if(process.env.AXIOVELA_MATH_DESKTOP_PROFILE){
 const profile=path.resolve(process.env.AXIOVELA_MATH_DESKTOP_PROFILE);
 fsSync.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
}
const singleInstance=app.requestSingleInstanceLock();
const tools=new Set(['CODEX','CLAUDE','GEMINI','OPENCODE','PI','LATEX']);
const trusted=event=>{if(event.senderFrame!==win?.webContents.mainFrame||event.senderFrame?.url!==origin+'/')throw Error('Untrusted window.');};
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
async function writeJson(file,value){await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await fs.rename(file+'.tmp',file);}
async function localPort(){
 const file=path.join(userDir,'local-service.json'),saved=await readJson(file);
 if(saved.port!==undefined&&(!Number.isInteger(saved.port)||saved.port<1024||saved.port>65535))throw Error('The saved local service address is invalid. Your workspace is unchanged.');
 const port=await new Promise((resolve,reject)=>{
  const server=net.createServer();server.once('error',()=>reject(Error('The app’s local address is already in use. Close the other instance or restart your computer, then try again. Your work is preserved.')));
  server.listen(saved.port||0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});
 });
 if(!saved.port)await writeJson(file,{port});return port;
}
async function shutdown(){
 updates?.cancel();
 if(shutdownPromise)return shutdownPromise;
 shutdownPromise=(async()=>{
  if(backend&&backend.exitCode===null&&backend.signalCode===null){
   await new Promise(resolve=>{const timer=setTimeout(()=>{backend.kill('SIGKILL');resolve();},5000);backend.once('exit',()=>{clearTimeout(timer);resolve();});backend.kill('SIGTERM');});
  }
  allowExit=true;app.quit();
 })();return shutdownPromise;
}
async function openFolder(folder){const error=await shell.openPath(folder);if(error)dialog.showErrorBox('Could not open folder',error);}
function nativeMenu(){
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
  {label:'File',submenu:[{label:'New project…',accelerator:'CmdOrCtrl+N',click:()=>win?.webContents.send('math:command','new-project')},{label:'Open project…',accelerator:'CmdOrCtrl+O',click:()=>win?.webContents.send('math:command','open-project')},{type:'separator'},{label:'Export workspace JSON',click:()=>win?.webContents.send('math:command','export-workspace')},{label:'Export recovery draft',click:()=>win?.webContents.send('math:command','export-recovery')},{label:'Research version history',click:()=>win?.webContents.send('math:command','history')},{type:'separator'},{label:'Open app data folder',click:()=>openFolder(userDir)},{type:'separator'},{label:'Quit',accelerator:'CmdOrCtrl+Q',click:()=>win?.close()}]},
  {role:'editMenu'},
  {label:'View',submenu:[{label:'Actual size / fit PDF',accelerator:'CmdOrCtrl+0',click:()=>win?.webContents.send('math:zoom','reset')},{label:'Zoom in',accelerator:'CmdOrCtrl+=',click:()=>win?.webContents.send('math:zoom','in')},{label:'Zoom out',accelerator:'CmdOrCtrl+-',click:()=>win?.webContents.send('math:zoom','out')},{type:'separator'},{role:'togglefullscreen'}]},
  {label:'Help',submenu:[{label:'Check for updates…',click:()=>{win?.webContents.send('math:update-open');void updates?.check();}},{label:'GitHub repository',click:()=>shell.openExternal('https://github.com/CashBowman/axiovela-math')},{label:'Downloads and release notes',click:()=>shell.openExternal(releaseRoot)},{label:'About Axiovela Math',click:()=>dialog.showMessageBox(win,{type:'info',title:'Axiovela Math',message:'Axiovela Math '+app.getVersion(),detail:'Private development build\n\nResearch, evidence, Lean checks and publication writing.\n\nInstallers are distributed privately during development. Your projects and app data stay in their own folders.'})}]},
 ]));
}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
if(!singleInstance)app.quit();
else app.whenReady().then(async()=>{
 userDir=app.getPath('userData');await fs.mkdir(userDir,{recursive:true});
 const toolFile=path.join(userDir,'tool-paths.json'),configured=await readJson(toolFile);
 const port=await localPort();origin=`http://127.0.0.1:${port}`;
 const toolEnv=Object.fromEntries(Object.entries(configured).filter(([id,value])=>tools.has(id)&&typeof value==='string').map(([id,value])=>[`WORKBENCH_${id}_PATH`,value]));
 // GUI launchers may omit the standard per-user executable locations.
 const userPath=[path.join(app.getPath('home'),'.local/bin'),path.join(app.getPath('home'),'.cargo/bin'),path.join(app.getPath('home'),'.elan/bin'),...(process.platform==='darwin'?['/opt/homebrew/bin','/usr/local/bin']:process.platform==='win32'&&process.env.APPDATA?[path.join(process.env.APPDATA,'npm')]:[]),process.env.PATH||''].join(path.delimiter);
 backend=spawn(process.execPath,[path.join(__dirname,'../server/index.mjs')],{env:{...process.env,...toolEnv,PATH:userPath,ELECTRON_RUN_AS_NODE:'1',PORT:String(port),AXIOVELA_MATH_DATA:path.join(userDir,'workspace'),AXIOVELA_MATH_SECURE_STORAGE:'1'},stdio:['ignore','pipe','pipe','ipc']});
 let startupError='',backendLog='';backend.on('error',e=>{startupError=e.message;});
 for(const stream of [backend.stdout,backend.stderr])stream.on('data',chunk=>{backendLog=(backendLog+chunk).slice(-8000);});
 backend.on('exit',()=>{if(win&&!approvedClose&&!shutdownPromise){dialog.showErrorBox('Research service stopped','Close and reopen Axiovela Math to restart the local service. Saved work and recovered drafts remain in your app data folder.');}});
 backend.on('message',async m=>{
  if(m?.type!=='provider-storage')return;
  try{
   if(!safeStorage.isEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend?.()==='basic_text'))throw Error('OS credential encryption is unavailable. Use CLI sign-in or configure your operating system credential store.');
   const file=path.join(userDir,'providers.enc');let value;
   if(m.action==='read'){try{value=JSON.parse(safeStorage.decryptString(await fs.readFile(file)));}catch(e){if(e.code==='ENOENT')value={};else throw e;}}
   else if(m.action==='write'){await fs.writeFile(file+'.tmp',safeStorage.encryptString(JSON.stringify(m.value)),{mode:0o600});await fs.rename(file+'.tmp',file);value={};}
   else throw Error('Unknown storage action.');
   if(backend.connected)backend.send({type:'provider-storage-result',id:m.id,value});
  }catch(e){if(backend.connected)backend.send({type:'provider-storage-result',id:m.id,error:e.message});}
 });
 let ready=false;
 for(let i=0;i<120;i++){
  if(startupError||backend.exitCode!==null)break;
  try{const r=await fetch(origin+'/api/state',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 if(!ready)throw Error('The local research service did not start. '+(startupError||backendLog.slice(-1500)));
 updates=new Updates({profile:userDir,currentVersion:app.getVersion(),privateDistribution:true});
 await updates.initialize().catch(()=>updates.set({status:'error',error:'Update storage is unavailable. Your workspace can still be used.'}));
 updates.on('change',state=>{if(win&&!win.isDestroyed())win.webContents.send('math:update-state',state);});
 ipcMain.handle('math:zoom-app',(e,direction)=>{trusted(e);if(!['in','out','reset'].includes(direction))throw Error('Unknown zoom action.');const wc=win.webContents;wc.setZoomFactor(direction==='reset'?1:Math.max(.5,Math.min(3,wc.getZoomFactor()*(direction==='in'?1.15:1/1.15))));});
 ipcMain.handle('math:update',async(e,action,value)=>{
  trusted(e);
  switch(action){
   case 'state':return updates.snapshot();
   case 'check':return updates.check();
   case 'channel':await updates.channel(value);return updates.check();
   case 'download':return updates.download(value);
   case 'cancel':updates.cancel();return updates.snapshot();
   case 'releases':await shell.openExternal(releaseRoot);return updates.snapshot();
   case 'repository':await shell.openExternal('https://github.com/CashBowman/axiovela-math');return updates.snapshot();
   case 'reveal':if(updates.downloaded)shell.showItemInFolder(updates.downloaded);return updates.snapshot();
   default:throw Error('Unknown update action.');
  }
 });
 ipcMain.handle('math:choose-experiment-project',async e=>{trusted(e);const r=await dialog.showOpenDialog(win,{title:'Choose your Axiovela project',properties:['openDirectory']});return r.canceled?null:r.filePaths[0];});
 ipcMain.handle('math:choose-folder',async e=>{trusted(e);const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];});
 ipcMain.handle('math:choose-tool',async(e,id)=>{trusted(e);if(!tools.has(id))throw Error('Unknown tool.');const r=await dialog.showOpenDialog(win,{title:`Locate ${id}`,properties:['openFile']});if(r.canceled)return null;const data=await readJson(toolFile);data[id]=r.filePaths[0];await writeJson(toolFile,data);return r.filePaths[0];});
 ipcMain.handle('math:setup',async(e,id,action)=>{trusted(e);return launchSetup(id,action);});
 ipcMain.handle('math:detect',async e=>{trusted(e);return (await Promise.all(['codex','claude','gemini','opencode','pi','lake'].map(id=>new Promise(resolve=>{execFile(process.platform==='win32'?'where.exe':'which',[id],{env:{...process.env,PATH:userPath},timeout:3000},(err,stdout)=>resolve(`${id}: ${err?'not found':stdout.trim()}`));})))).join('\n');});
 const savedWindow=await readJson(path.join(userDir,'window.json'));
 win=new BrowserWindow({width:Math.max(880,Math.min(2400,Number(savedWindow.width)||1560)),height:Math.max(620,Math.min(1600,Number(savedWindow.height)||1000)),minWidth:880,minHeight:620,title:'Axiovela Math',icon:path.join(__dirname,'../public/workbench-mark.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='clipboard-sanitized-write'&&contents===win.webContents&&details.requestingUrl===origin+'/'));
 // Native edit roles preserve standard selection and input clipboard behavior.
 win.webContents.on('context-menu',(_event,params)=>{
  const items=[];
  if(params.isEditable)items.push({role:'cut',enabled:params.editFlags.canCut});
  if(params.selectionText)items.push({role:'copy',enabled:params.editFlags.canCopy});
  if(params.isEditable)items.push({role:'paste',enabled:params.editFlags.canPaste},{role:'selectAll'});
  if(items.length)Menu.buildFromTemplate(items).popup({window:win});
 });
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/')event.preventDefault();});
 win.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(win,{type:'question',message:'Discard unsaved edits and close?',detail:'A recovery copy remains available when you reopen the app.',buttons:['Keep working','Close'],defaultId:0,cancelId:0});if(choice===1)event.preventDefault();else approvedClose=false;});
 let checkingClose=false;
 win.on('close',event=>{
  if(approvedClose)return;
  event.preventDefault();if(checkingClose)return;checkingClose=true;
  void(async()=>{
   try{
    let active=0;try{active=(await(await fetch(origin+'/api/activity',{signal:AbortSignal.timeout(1000)})).json()).running;}catch{}
    if(active){const r=await dialog.showMessageBox(win,{type:'question',message:'Stop running assistants and close?',detail:'Queued messages remain saved and paused.',buttons:['Keep working','Stop and close'],defaultId:0,cancelId:0});if(r.response!==1)return;}
    await writeJson(path.join(userDir,'window.json'),{...win.getNormalBounds(),maximized:win.isMaximized()});
    await win.webContents.session.flushStorageData();approvedClose=true;win.close();
   }catch(e){dialog.showErrorBox('Could not close safely',e.message);}finally{checkingClose=false;}
  })();
 });
 win.on('closed',()=>{win=null;void shutdown();});
 if(!process.env.AXIOVELA_MATH_DESKTOP_SMOKE){
  const startup=setTimeout(()=>void updates.check(),30000),periodic=setInterval(()=>void updates.check(),6*60*60*1000);
  app.once('will-quit',()=>{clearTimeout(startup);clearInterval(periodic);updates.cancel();});
 }
 win.webContents.on('before-input-event',(event,input)=>{if(input.type!=='keyDown'||!(input.control||input.meta)||input.alt)return;const direction=['+','=','Add'].includes(input.key)?'in':['-','Subtract'].includes(input.key)?'out':input.key==='0'?'reset':null;if(direction){event.preventDefault();win.webContents.send('math:zoom',direction);}});
 nativeMenu();if(savedWindow.maximized)win.maximize();await win.loadURL(origin+'/');
 if(process.env.AXIOVELA_MATH_DESKTOP_SMOKE==='1'){
  // Wait for the React workspace, then verify storage across two real launches.
  for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript("!!document.querySelector('.projectStrip')"))break;await new Promise(r=>setTimeout(r,100));}
  if(!await win.webContents.executeJavaScript("!!document.querySelector('.projectStrip')"))throw Error('Desktop workspace did not render.');
  if(process.env.AXIOVELA_MATH_SMOKE_REOPEN==='1'){
   if(await win.webContents.executeJavaScript("localStorage.getItem('desktop-reopen-fixture')")!=='retained')throw Error('Desktop storage did not survive relaunch.');
  }else await win.webContents.executeJavaScript("localStorage.setItem('desktop-reopen-fixture','retained')");
  await fs.writeFile(path.join(userDir,'desktop-smoke.json'),JSON.stringify({origin,userData:app.getPath('userData'),backendPid:backend.pid,reopened:process.env.AXIOVELA_MATH_SMOKE_REOPEN==='1'}));
  await win.webContents.capturePage().then(img=>fs.writeFile(path.join(userDir,'desktop-smoke.png'),img.toPNG()));
  console.log('AXIOVELA_MATH_DESKTOP_READY');win.close();
 }
}).catch(async e=>{console.error(e.message);if(!process.env.AXIOVELA_MATH_DESKTOP_SMOKE)dialog.showErrorBox('Axiovela Math could not start',e.message);await shutdown();});
app.on('window-all-closed',()=>{void shutdown();});
app.on('before-quit',event=>{if(allowExit||!singleInstance)return;event.preventDefault();if(win&&!win.isDestroyed())win.close();else void shutdown();});
