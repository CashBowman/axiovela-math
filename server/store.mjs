import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {blankProject} from '../shared/research.mjs';
export function validateState(s) {
  if(!s || !Array.isArray(s.projects) || s.projects.length<1 || s.projects.length>100) throw new Error('Expected 1–100 projects.');
  const ids=new Set();
  for(const p of s.projects) {
    if(!/^[a-zA-Z0-9-]{1,64}$/.test(p.id)||ids.has(p.id)) throw new Error('Invalid or duplicate project ID.');ids.add(p.id);
    for(const field of ['name','question','notes','bibliography','markdown','latex','lean']) if(typeof p[field]!=='string') throw new Error(`Missing text field: ${field}`);
    if(!Number.isFinite(p.budget)||p.budget<0||p.budget>10000) throw new Error('Invalid budget.');
    for(const field of ['claims','papers','tasks','reviews']) if(!Array.isArray(p[field])) throw new Error(`Missing collection: ${field}`);
    const claimIds=new Set();
    for(const c of p.claims) {
      if(typeof c.id!=='string'||claimIds.has(c.id)||typeof c.statement!=='string'||!Number.isInteger(c.revision)||c.revision<1) throw new Error('Invalid claim.');claimIds.add(c.id);
      if(!['conjecture','informal-proof','needs-repair','human-reviewed','refuted'].includes(c.status)) throw new Error('Only the verifier service may issue formal verification status.');
      if(c.status==='human-reviewed' && (!c.reviewer?.trim()||!c.reviewNote?.trim())) throw new Error('Human review needs a reviewer and an evidence note.');
    }
    for(const paper of p.papers) if(!/^[a-zA-Z0-9-]{1,64}$/.test(paper.id)||typeof paper.title!=='string'||typeof paper.notes!=='string') throw new Error('Invalid paper metadata.');
    for(const task of p.tasks) if(task.status!=='prepared'||typeof task.prompt!=='string') throw new Error('This preview only stores prepared tasks.');
  }
  if(!ids.has(s.activeProjectId)) throw new Error('Active project is missing.');
}
export class Store {
  constructor(dir){this.dir=dir;this.file=path.join(dir,'state.json');this.tail=Promise.resolve();}
  async read(){try{const state=JSON.parse(await fs.readFile(this.file,'utf8'));for(const p of state.projects){p.summary??='';p.proof??='';p.links??=[];p.evidenceNotes??={};}return state;}catch(e){if(e.code!=='ENOENT')throw e;const id=randomUUID();return {revision:0,activeProjectId:id,projects:[blankProject(id)]};}}
  save(value,expected){const job=this.tail.then(async()=>{const current=await this.read();if(expected!==current.revision){const e=new Error('The workspace changed in another window. Reload before saving.');e.status=409;throw e;}validateState(value);
for(const nextProject of value.projects){const previousProject=current.projects.find(p=>p.id===nextProject.id);for(const nextClaim of nextProject.claims){const previousClaim=previousProject?.claims.find(c=>c.id===nextClaim.id);if(previousClaim&&nextClaim.statement!==previousClaim.statement&&(nextClaim.revision<=previousClaim.revision||nextClaim.status!=='conjecture'||nextClaim.reviewer||nextClaim.reviewNote))throw new Error('A changed claim needs a new revision and cleared review.');}}
await fs.mkdir(this.dir,{recursive:true});const next={...value,revision:current.revision+1};const tmp=this.file+'.tmp';await fs.writeFile(tmp,JSON.stringify(next,null,2));await fs.rename(tmp,this.file);return next;});this.tail=job.catch(()=>{});return job;}
}
