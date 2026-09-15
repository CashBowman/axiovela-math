import './desktop-storage.mjs';
import {saveImage,readImage} from './writeup-assets.mjs';
import {fetchPaper} from './arxiv.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from './store.mjs';
import os from 'node:os';
import {Projects} from './projects.mjs';
import {ExperimentBridge} from './experiment-bridge.mjs';
import {Chats} from './chat.mjs';
import {LeanWorkspace} from './lean-workspace.mjs';
import {readResearchArtifacts} from './research-artifacts.mjs';
import {compileLatex} from './checks.mjs';
import {projectFile} from './axiovela/assistant-api.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8791), host='127.0.0.1';
const data=path.resolve(process.env.AXIOVELA_MATH_DATA||path.join(root,'.workspace'));
process.env.WORKBENCH_PROVIDER_SETTINGS_PATH ||= path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'axiovela-math','providers.json');
const store=new Store(data);
const projects=new Projects(data,store);await projects.init();
const bridge=new ExperimentBridge(data,projects,store);await bridge.init();
const leanWorkspace=new LeanWorkspace(data,projects);
const chats=new Chats(projects,store,bridge,leanWorkspace);

const activeArtifactEdits=new Set();
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function readBody(req,max=24*1024*1024){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max){const e=new Error('Upload exceeds the preview limit of 24 MB.');e.status=413;throw e;}chunks.push(c);}return Buffer.concat(chunks);}
const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==`${host}:${port}`&&req.headers.host!==`localhost:${port}`)return json(res,403,{error:'Loopback host required.'});
  const origin=req.headers.origin;
  if(origin&&!new Set([`http://${host}:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5174','http://localhost:5174']).has(origin))return json(res,403,{error:'Origin denied.'});
  const url=new URL(req.url,`http://${host}:${port}`);
  const bodyJson=async()=>JSON.parse((await readBody(req,8*1024*1024)).toString());
  if(url.pathname==='/api/activity'&&req.method==='GET')return json(res,200,{running:chats.controllers.size+leanWorkspace.active.size});
  if(url.pathname==='/api/projects/open'&&req.method==='POST')return json(res,200,await projects.openOrCreate(await bodyJson()));
  if(url.pathname==='/api/projects'&&req.method==='POST')return json(res,201,await projects.create(await bodyJson()));
  const projectId=url.searchParams.get('project');
  if(url.pathname==='/api/bridge/sources'&&req.method==='GET')return json(res,200,{sources:await bridge.discover()});
  if(url.pathname==='/api/bridge/sources'&&req.method==='POST'){const body=await bodyJson();return json(res,200,{source:body.folder?await bridge.remember(body.folder):await bridge.chooseFolder()});}
  if(url.pathname==='/api/bridge/runs'&&req.method==='GET')return json(res,200,await bridge.browse(url.searchParams.get('source')));
  if(url.pathname==='/api/bridge/evidence'&&req.method==='GET')return json(res,200,{items:await bridge.list(projectId)});
  if(url.pathname==='/api/bridge/evidence'&&req.method==='POST')return json(res,201,{items:await bridge.capture(projectId,await bodyJson())});
  if(url.pathname==='/api/bridge/evidence'&&req.method==='PUT'){const body=await bodyJson();return json(res,200,{items:await bridge.remove(projectId,body.id,body.removed)});}
  if(url.pathname==='/api/bridge/check'&&req.method==='POST'){const body=await bodyJson();return json(res,200,await bridge.check(projectId,body.id));}
  if(url.pathname==='/api/bridge/asset'&&req.method==='GET'){const asset=await bridge.asset(projectId,url.searchParams.get('id'),url.searchParams.get('key'));res.writeHead(200,{'Content-Type':asset.type,'Content-Security-Policy':"sandbox; default-src 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(asset.bytes);}
  if(url.pathname==='/api/capabilities'&&req.method==='GET')return json(res,200,await chats.capabilities(projectId,url.searchParams.get('connection'),url.searchParams.get('refresh')==='1'));
  if(url.pathname==='/api/providers'&&req.method==='PUT'){const body=await bodyJson();return json(res,200,await chats.configure(body.id,body));}
  if(url.pathname==='/api/conversations'&&req.method==='GET')return json(res,200,{conversations:await chats.load(projectId)});
  if(url.pathname==='/api/conversations'&&req.method==='POST'){const body=await bodyJson();return json(res,201,await chats.newConversation(projectId,body.role));}
  if(url.pathname==='/api/conversation'&&req.method==='PUT'){const body=await bodyJson();return json(res,200,await chats.patch(projectId,body.id,body));}
  if(url.pathname==='/api/messages'&&req.method==='POST'){const body=await bodyJson();return json(res,202,await chats.send(projectId,body.id,body.message,{context:body.context,format:body.format,workspace:body.workspace,review:body.review}));}
  if(url.pathname==='/api/cancel'&&req.method==='POST'){const body=await bodyJson();return json(res,200,await chats.cancel(projectId,body.id));}
  if(url.pathname==='/api/queue'&&req.method==='PUT'){const body=await bodyJson();return json(res,200,await chats.queueAction(projectId,body.id,body));}
  if(url.pathname==='/api/project-root'&&req.method==='GET')return json(res,200,{folder:await projects.root(projectId)});
  if(url.pathname==='/api/research-artifacts'&&req.method==='GET'){
    const conversations=await chats.load(projectId);
    const working=()=>conversations.some(c=>chats.controllers.has(c.id)||chats.admissions.has(c.id));
    if(working())return json(res,200,{working:true});
    const artifacts=await readResearchArtifacts(await projects.root(projectId));
    return json(res,200,working()?{working:true}:{working:false,artifacts});
  }
  if(url.pathname==='/api/artifact'&&req.method==='GET'){
    const names={summary:'research/summary.md',proof:'research/proof.md',markdown:'writeups/main.md',latex:'writeups/main.tex',bibliography:'references.bib'};const key=url.searchParams.get('kind');if(!Object.hasOwn(names,key))throw Error('Unknown artifact.');
    const file=await projectFile(await projects.root(projectId),names[key],true);let text='';try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;return json(res,404,{error:'No saved project artifact yet.'});}return json(res,200,{text,hash:createHash('sha256').update(text).digest('hex')});
  }
  if(url.pathname==='/api/artifact'&&req.method==='PUT'){
    const body=await bodyJson();const names={markdown:'writeups/main.md',latex:'writeups/main.tex',bibliography:'references.bib'};if(!Object.hasOwn(names,body.kind)||typeof body.text!=='string')throw Error('Invalid manuscript artifact.');const file=await projectFile(await projects.root(projectId),names[body.kind],true);if(activeArtifactEdits.has(file))return json(res,409,{error:'This file is being saved. Retry after the current save completes.'});activeArtifactEdits.add(file);try{let previous=null;try{previous=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}const hash=previous===null?null:createHash('sha256').update(previous).digest('hex');if((body.expectedHash??null)!==hash)return json(res,409,{error:'The project file differs from this editor. Load the assistant’s saved draft before overwriting it.'});if(previous===body.text)return json(res,200,{hash});if(previous!==null){const backup=await projectFile(await projects.root(projectId),`writeups/backups/${randomUUID()}-${path.basename(file)}`,true);await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,previous);}await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',body.text);await fs.rename(file+'.tmp',file);return json(res,200,{hash:createHash('sha256').update(body.text).digest('hex')});}finally{activeArtifactEdits.delete(file);}
  }
  if(url.pathname==='/api/lean/setup'&&req.method==='POST'){
    if(chats.controllers.size||chats.admissions.size||leanWorkspace.active.has(projectId))throw Error('Finish the current assistant turn or check before setting up Lean.');
    return json(res,200,await leanWorkspace.setup.start(projectId));
  }
  if(url.pathname==='/api/lean'&&req.method==='GET')return json(res,200,await leanWorkspace.read(projectId));
  if(url.pathname==='/api/lean'&&req.method==='POST'){const body=await bodyJson();return json(res,200,await leanWorkspace.check(projectId,body.run===true));}
  if(url.pathname==='/api/lean/draft'&&req.method==='POST'){
    const body=await bodyJson(),conversation=await chats.get(projectId,body.id);
    if(chats.controllers.has(body.id)||chats.admissions.has(body.id))throw Error('Wait for this conversation to finish before saving its draft.');
    return json(res,200,await leanWorkspace.saveDraft(projectId,conversation,body.turnId));
  }
  if(url.pathname==='/api/render'&&req.method==='POST'){const body=await bodyJson();return json(res,200,await compileLatex(await projects.root(projectId),body.source,body.bibliography));}
  if(url.pathname==='/api/rendered'&&req.method==='GET'){const id=url.searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid document.');const file=await projectFile(await projects.root(projectId),`exports/${id}/main.pdf`);res.writeHead(200,{'Content-Type':'application/pdf'});return res.end(await fs.readFile(file));}
  if(url.pathname==='/api/state'&&req.method==='GET'){let state=await store.read();if(state.revision===0){try{state=await store.save(state,0);}catch(e){if(e.status!==409)throw e;state=await store.read();}}return json(res,200,state);}
  if(url.pathname==='/api/state'&&req.method==='PUT'){const value=JSON.parse((await readBody(req,8*1024*1024)).toString());return json(res,200,await store.save(value,Number(req.headers['if-match'])));}
  if(url.pathname==='/api/writeup-image'&&req.method==='POST')return json(res,201,{path:await saveImage(await projects.root(projectId),await readBody(req))});
  if(url.pathname==='/api/writeup-image'&&req.method==='GET'){const image=await readImage(await projects.root(projectId),url.searchParams.get('path'));res.writeHead(200,{'Content-Type':'image/'+image.type,'X-Content-Type-Options':'nosniff'});return res.end(image.bytes);}
  if(url.pathname==='/api/papers/arxiv'&&req.method==='POST'){
    const {input}=await bodyJson();const {paper,pdf}=await fetchPaper(input);
    const id=createHash('sha256').update(paper.arxivId).digest('hex').slice(0,32);
    const paperId=`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
    await fs.mkdir(path.join(data,'papers'),{recursive:true});
    await fs.writeFile(path.join(data,'papers',paperId+'.pdf'),pdf,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    return json(res,201,{paper:{...paper,id:paperId,notes:'',citationKey:'arxiv'+paper.arxivId.replace(/[^a-zA-Z0-9]/g,''),read:false}});
  }
  if(url.pathname==='/api/papers'&&req.method==='POST'){
    const body=await readBody(req);if(!body.subarray(0,5).equals(Buffer.from('%PDF-')))return json(res,400,{error:'A PDF file is required.'});
    const id=randomUUID();await fs.mkdir(path.join(data,'papers'),{recursive:true});await fs.writeFile(path.join(data,'papers',id+'.pdf'),body,{flag:'wx'});return json(res,201,{id});
  }
  if(/^\/api\/papers\/[a-f0-9-]{36}\.pdf$/.test(url.pathname)&&req.method==='GET'){
    const body=await fs.readFile(path.join(data,'papers',path.basename(url.pathname)));res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});return res.end(body);
  }
  if(url.pathname.startsWith('/api/'))return json(res,404,{error:'API endpoint not available.'});
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';const target=path.resolve(root,'dist',relative);
  if(!target.startsWith(path.join(root,'dist')+path.sep))return json(res,403,{error:'Invalid asset path.'});
  let body;try{body=await fs.readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;body=await fs.readFile(path.join(root,'dist/index.html'));}
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'};
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(body);
}catch(e){json(res,e.status|| (e.code==='ENOENT'?404:400),{error:e.message});}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{leanWorkspace.stopAll();await chats.stopAll();server.close();setTimeout(()=>process.exit(0),1500).unref();});
server.listen(port,host,()=>console.log(`Axiovela Math groundwork: http://${host}:${port}\nLocal workspace: ${data}`));
