import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {projectFile} from './axiovela/assistant-api.mjs';

export async function readResearchArtifacts(root) {
  const result = {};
  for (const kind of ['summary', 'proof']) {
    try {
      const file = await projectFile(root, `research/${kind}.md`, true);
      const handle = await fs.open(file, 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 1024 * 1024) throw Error('Research documents must be text files under 1 MB.');
        const bytes = Buffer.alloc(1024 * 1024 + 1);
        const {bytesRead} = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 1024 * 1024) throw Error('Research document exceeds 1 MB.');
        const text = bytes.subarray(0, bytesRead).toString('utf8');
        result[kind] = {text, hash: createHash('sha256').update(text).digest('hex')};
      } finally { await handle.close(); }
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return result;
}
