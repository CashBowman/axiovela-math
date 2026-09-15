import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {projectFile} from './axiovela/assistant-api.mjs';

const observed=new Map();
export async function readResearchArtifacts(root) {
  const result = {};
  for (const kind of ['summary', 'proof', 'markdown', 'latex', 'connections']) {
    try {
      const file = await projectFile(root, ({connections:'research/connections.json',markdown:'writeups/main.md',latex:'writeups/main.tex'}[kind]||`research/${kind}.md`), true);
      const handle = await fs.open(file, 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 1024 * 1024) throw Error('Research documents must be text files under 1 MB.');
        const bytes = Buffer.alloc(1024 * 1024 + 1);
        const {bytesRead} = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 1024 * 1024) throw Error('Research document exceeds 1 MB.');
        const text = bytes.subarray(0, bytesRead).toString('utf8');
        const hash=createHash('sha256').update(text).digest('hex'), prior=observed.get(file);
        observed.set(file,{hash,at:Date.now()});
        if(prior?.hash===hash) result[kind]={text,hash};
      } finally { await handle.close(); }
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return result;
}
