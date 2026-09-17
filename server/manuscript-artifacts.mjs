import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {projectFile} from './axiovela/assistant-api.mjs';
import {reviewDraft} from '../shared/annotations.mjs';
const active = new Set();
export const artifactPath = kind => ({markdown:'writeups/main.md',latex:'writeups/main.tex',bibliography:'references.bib'}[kind]);
export async function manuscriptSnapshot(root,kind) {
  if(!artifactPath(kind))throw Error('Unknown manuscript format.');
  const file=await projectFile(root,artifactPath(kind),true);
  try { const text=await fs.readFile(file,'utf8');return {text,hash:createHash('sha256').update(text).digest('hex')}; }
  catch(e){if(e.code!=='ENOENT')throw e;return {text:'',hash:null};}
}
export async function saveManuscript(root,kind,text,expectedHash) {
  if(!artifactPath(kind))throw Error('Invalid manuscript artifact.');
  if(typeof text!=='string'||text.length>1024*1024)throw Error('Manuscript must be text under 1 MB.');
  const file=await projectFile(root,artifactPath(kind),true);
  if(active.has(file))throw Object.assign(Error('This file is being saved. Retry after the current save completes.'),{status:409});
  active.add(file);
  try {
    const previous=await manuscriptSnapshot(root,kind);
    if((expectedHash??null)!==previous.hash)throw Object.assign(Error('The project file differs from this editor. Load the assistant’s saved draft before overwriting it.'),{status:409});
    if(previous.hash!==null&&previous.text===text)return {hash:previous.hash};
    if(previous.hash!==null){const backup=await projectFile(root,`writeups/backups/${randomUUID()}-${path.basename(file)}`,true);await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,previous.text);}
    await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
    await fs.writeFile(temp,text);await fs.rename(temp,file);
    return {hash:createHash('sha256').update(text).digest('hex')};
  } finally {active.delete(file);}
}
export function requestedManuscript(message) {
  if (/\b(?:in|into) (?:the )?chat\b|\bchat[- ]only\b|\bno (?:new )?files\b/i.test(message)) return false;
  // A named side document is not authorization to import chat into main.*.
  const paths = [...message.matchAll(/(?:[\w.-]+\/)*[\w.-]+\.(?:md|tex)\b/gi)].map(m => m[0]);
  if (paths.some(p => !['writeups/main.md', 'writeups/main.tex', 'main.md', 'main.tex'].includes(p.toLowerCase()))) return false;
  if (/\b(?:report|assessment|review packet|search log)\b/i.test(message) && !/\b(?:revise|rewrite|edit|update)\b.{0,40}\b(?:manuscript|paper|draft)\b/i.test(message)) return false;
  return !/\b(?:do not|don't|without)\s+(?:write|save|edit|change|revise)/i.test(message) && /\b(?:write|draft|rewrite|revise|reoutput|create|prepare|update|generate|save|produce|make)\b/i.test(message) && /\b(?:manuscript|paper|write[ -]?up|draft|latex|markdown)\b/i.test(message);
}
// A full, unambiguous draft may be recovered from chat only for an authorized
// writing request and only if the saved source is still the admission snapshot.
export async function finishManuscript(root,format,before,output) {
  const current=await manuscriptSnapshot(root,format);
  if(current.hash!==before.hash)return {saved:true,path:artifactPath(format)};
  let source;
  try {source=reviewDraft(output,format);}catch{return {saved:false,notice:'No manuscript file was saved. Ask the assistant to save the complete draft to '+artifactPath(format)+'.'};}
  await saveManuscript(root,format,source,before.hash);
  return {saved:true,recovered:true,path:artifactPath(format)};
}
