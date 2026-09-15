import {blankProject} from './research.mjs';
// A saved remote revision is the merge base, not permission to replace local edits.
export function reconcileResearch(project, artifacts) {
  const patch = {}, conflicts = {};
  const sync = {...project.researchSync};
  for (const kind of ['summary', 'proof', 'markdown', 'latex']) {
    const remote = artifacts[kind];
    if (!remote) continue; // Missing files never erase a working argument.
    const base = sync[kind], local = project[kind] || '';
    if (remote.hash === base?.hash) continue;
    if (local === remote.text || (base ? local === base.text : !local || ['markdown','latex'].includes(kind)&&local===blankProject(project.id)[kind])) {
      patch[kind] = remote.text;
      sync[kind] = remote;
    } else conflicts[kind] = remote;
  }
  if (Object.keys(patch).length) patch.researchSync = sync;
  return {patch, conflicts};
}

export function resolveResearch(project, kind, remote, useRemote) {
  return {
    ...(useRemote ? {[kind]: remote.text, researchHistory: [...(project.researchHistory || []), {
      kind, text: project[kind], savedAt: new Date().toISOString(), reason: 'Before accepting assistant changes',
    }]} : {}),
    researchSync: {...project.researchSync, [kind]: remote},
  };
}
