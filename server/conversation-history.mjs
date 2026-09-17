// Organization metadata over Math's existing project and conversation identities.
// Transcripts and research artifacts are never rewritten by this module.
import fs from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {containedProjectPath} from './axiovela/project-paths.mjs';
const locks = new Map();
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const boilerplate = value => /^(?:previous conversation|you are (?:the|a)|workspace evidence|current workspace|system prompt|historical (?:data|handoff)|<|```|#.*(?:instructions|files mentioned))/i.test(value.trim());
export function requestTitle(message, role = 'research') {
  if (typeof message !== 'string' || !message.trim() || boilerplate(message)) return role === 'writing' ? 'Writing conversation' : 'Research conversation';
  return clean(message.trim().split(/\n\s*\n/)[0].split('\n')[0]).slice(0, 96);
}
export function validateConversations(list) {
  if (!Array.isArray(list) || list.some(c => !c || typeof c.id !== 'string' || !/^[\w-]{1,128}$/.test(c.id) || (c.title != null && typeof c.title !== 'string') || (c.createdAt != null && typeof c.createdAt !== 'string') || !Array.isArray(c.turns) || (c.queue != null && !Array.isArray(c.queue)) || !['research','writing','lean'].includes(c.role) || c.turns.some(t => !t || typeof t !== 'object' || (t.message != null && typeof t.message !== 'string') || (t.output != null && typeof t.output !== 'string')))) throw Error('Corrupt or unsupported conversation data; original file preserved.');
  if (new Set(list.map(c => c.id)).size !== list.length) throw Error('Duplicate conversation identities; original file preserved.');
  return list;
}
async function bytes(root, name, max, budget) {
  const file = containedProjectPath(root, name);
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > max) throw Error('Conversation file exceeds the search size limit or is not a regular file.');
    if (budget && stat.size > budget.remaining) throw Error('Search reached its 64 MB limit. Narrow the project filter.');
    if (budget) budget.remaining -= stat.size;
    const buffer = Buffer.alloc(stat.size + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) { const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead); if (!chunk.bytesRead) break; bytesRead += chunk.bytesRead; }
    if (bytesRead > stat.size) throw Error('Conversation file changed while being read; retry.');
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}
export async function readConversationFile(root, budget) {
  try { const raw = await bytes(root, 'assistant/conversations.json', 32 * 1024 * 1024, budget); return {raw, list: validateConversations(JSON.parse(raw))}; }
  catch (e) { if (e.code === 'ENOENT') return {raw: null, list: []}; throw e; }
}
function initial(c) {
  const first = c.turns[0], generated = c.titleSource !== 'manual' && (!c.title || ['New conversation','New chat'].includes(c.title) || boilerplate(c.title) || c.title === (first?.message || '').slice(0,60));
  const title = generated ? requestTitle(first?.message, c.role) : c.title;
  const sessions = [], seen = new Set();
  for (const t of [...c.turns, c]) {
    const adapterId=t.selection?.adapterId || 'unknown', key=adapterId+':'+t.sessionId;
    if (typeof t.sessionId === 'string' && t.sessionId && !seen.has(key)) {
      seen.add(key);sessions.push({id:t.sessionId,adapterId,startedAt:t.startedAt || '',turnId:t === c ? null : t.id || null});
    }
  }
  return {id:c.id, title, titleSource: c.titleSource === 'manual' ? 'manual' : !generated ? 'legacy' : first?.message && !boilerplate(first.message) ? 'request' : 'fallback', pinned:!!c.pinned, archived:!!c.archived, createdAt:c.createdAt || first?.startedAt || '', sessions};
}
async function readMetadata(root, budget) {
  try {
    const raw = await bytes(root, 'assistant/conversation-history.json', 8 * 1024 * 1024, budget), data = JSON.parse(raw);
    if (data.schemaVersion !== 1 || !Array.isArray(data.conversations) || data.conversations.some(c => !c || typeof c.id !== 'string' || !/^[\w-]{1,128}$/.test(c.id) || typeof c.title !== 'string' || !['manual','legacy','request','fallback'].includes(c.titleSource) || typeof c.pinned !== 'boolean' || typeof c.archived !== 'boolean' || typeof c.createdAt !== 'string' || !Array.isArray(c.sessions) || c.sessions.some(s=>!s || typeof s.id !== 'string' || typeof s.adapterId !== 'string')) || new Set(data.conversations.map(c => c.id)).size !== data.conversations.length) throw Error('Corrupt or unsupported history metadata; original file preserved.');
    return {raw, data};
  } catch (e) { if (e.code === 'ENOENT') return {raw:null, data:{schemaVersion:1, conversations:[]}}; throw e; }
}
async function backup(root, raw, prefix) {
  if (!raw) return;
  const hash = createHash('sha256').update(raw).digest('hex');
  const folder = containedProjectPath(root, 'assistant/history-backups'); await fs.mkdir(folder,{recursive:true});
  const target = containedProjectPath(root, `assistant/history-backups/${prefix}-${hash}.json`);
  try { await fs.writeFile(target, raw, {flag:'wx',mode:0o600}); } catch(e) { if(e.code !== 'EEXIST') throw e; if(!(await fs.readFile(target)).equals(raw))throw Error('Existing history backup is damaged; original metadata preserved.'); }
}
async function serial(root, fn) {
  const job=(locks.get(root)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(root,job);
  try { return await job; } finally {if(locks.get(root)===job)locks.delete(root);}
}
export class ConversationHistory {
  constructor(projects, store) {this.projects=projects;this.store=store;}
  async root(id) {
    const p=(await this.store.read()).projects.find(p=>p.id===id);if(!p)throw Error('Project not found.');
    const root=this.projects.location(p);
    if(!(await fs.stat(root)).isDirectory())throw Error('Saved project folder unavailable.');
    return root;
  }
  async read(id, supplied) {
    const root=await this.root(id), list=supplied || (await readConversationFile(root)).list;
    const {data}=await readMetadata(root);
    const byId = new Map(data.conversations.map(m=>[m.id,m]));
    return list.map(c=>byId.get(c.id) || initial(c));
  }
  async update(id, conversationId, patch={}, supplied) {
    const root=await this.root(id);
    return serial(root,async()=>{
      const transcript=await readConversationFile(root), list=supplied || transcript.list;
      validateConversations(list);
      if(conversationId && !list.some(c=>c.id===conversationId))throw Error('Conversation not found.');
      const {raw,data}=await readMetadata(root);
      const known = new Set(data.conversations.map(m=>m.id));
      for(const c of list)if(!known.has(c.id))data.conversations.push(initial(c));
      const m=data.conversations.find(c=>c.id===conversationId);
      if(m){
        if(patch.title !== undefined){const title=clean(patch.title);if(!title||title.length>160)throw Error('Use a title of 1–160 characters.');m.title=title;m.titleSource='manual';}
        for(const key of ['pinned','archived'])if(patch[key]!==undefined){if(typeof patch[key]!=='boolean')throw Error('Invalid history visibility setting.');m[key]=patch[key];}
        if(patch.request && m.titleSource==='fallback'){m.title=requestTitle(patch.request,list.find(c=>c.id===conversationId).role);if(!boilerplate(patch.request))m.titleSource='request';}
        if(patch.session && !m.sessions.some(s=>s.id===patch.session.id&&s.adapterId===patch.session.adapterId))m.sessions.push(patch.session);
      }
      const output=Buffer.from(JSON.stringify(data,null,2)+'\n');
      if(!raw || !raw.equals(output)){
        await backup(root,raw,'metadata-v1');
        if(!raw)await backup(root,transcript.raw,'original-conversations');
        const file=containedProjectPath(root,'assistant/conversation-history.json'),tmp=file+'.'+randomUUID()+'.tmp';
        await fs.mkdir(containedProjectPath(root,'assistant'),{recursive:true});
        try{await fs.writeFile(tmp,output,{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
      }
      return m || data.conversations;
    });
  }
  async decorate(id,list){const metadata=new Map((await this.update(id,null,{},list)).map(m=>[m.id,m]));return list.map(c=>({...c,...metadata.get(c.id)}));}
  async search({projectId='',query='',archived=false,offset=0}={}){
    const q=clean(query).toLowerCase().slice(0,200),results=[],warnings=[];
    const projects=(await this.store.read()).projects.filter(p=>!projectId||p.id===projectId);
    if(projectId&&!projects.length)throw Error('Project not found.');
    if(projects.length>100)warnings.push('Showing the first 100 saved projects. Narrow the project filter.');
    const budget={remaining:64*1024*1024};
    for(const p of projects.slice(0,100)){
      try{
        const root=await this.root(p.id), transcript=await readConversationFile(root,budget);
        const {data}=await readMetadata(root,budget);
        const metadata=new Map(data.conversations.map(m=>[m.id,m]));
        if(transcript.list.length>10000)warnings.push(`${p.name}: showing at most 10,000 conversations.`);
        for(const c of transcript.list.slice(0,10000)){
          const m=metadata.get(c.id) || initial(c);if(m.archived!==archived)continue;
          const turns=c.turns.slice(-5000);
          if(c.turns.length>5000)warnings.push(`${p.name}: searched the latest 5,000 turns per conversation.`);
          const match=turns.slice().reverse().flatMap(t=>[t.message,t.output]).find(t=>typeof t==='string'&&(!q||clean(t).toLowerCase().includes(q)));
          if(q&&!m.title.toLowerCase().includes(q)&&!match)continue;
          const value=clean(match||''),at=q?Math.max(0,value.toLowerCase().indexOf(q)):0,start=Math.max(0,at-65);
          results.push({id:c.id,role:c.role==='lean'?'research':c.role,title:m.title,pinned:m.pinned,archived:m.archived,projectId:p.id,projectName:p.name,createdAt:m.createdAt,lastActivity:String(c.turns.at(-1)?.completedAt||c.turns.at(-1)?.startedAt||c.updatedAt||m.createdAt),excerpt:(start?'…':'')+value.slice(start,start+220)+(value.length>start+220?'…':''),sessionCount:m.sessions.length});
        }
      }catch(e){warnings.push(`${p.name}: ${e.message}`);}
    }
    results.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.lastActivity.localeCompare(a.lastActivity)||a.projectId.localeCompare(b.projectId)||a.id.localeCompare(b.id));
    const start=Math.max(0,Math.min(results.length,Math.floor(Number(offset)||0)));
    return {conversations:results.slice(start,start+30),total:results.length,nextOffset:start+30<results.length?start+30:null,warnings:[...new Set(warnings)].slice(0,100)};
  }
}
