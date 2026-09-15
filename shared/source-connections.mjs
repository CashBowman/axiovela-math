// Model-authored relationships are interpretations, never verification records.
export function mergeSourceConnections(project, records) {
  if(!Array.isArray(records))return {};
  const nodes=new Set([...project.papers.map(p=>'paper:'+p.id),...project.claims.map(c=>'claim:'+c.id)]);
  const links=[...(project.links||[])];
  const seen=new Set(links.map(l=>JSON.stringify([l.from,l.to,l.type])));
  const endpoint=value=>nodes.has(value)?value:(project.papers.find(p=>p.sourceUrl===value||p.localPath===value||value===`papers/${p.id}.pdf`)?.id ? 'paper:'+project.papers.find(p=>p.sourceUrl===value||p.localPath===value||value===`papers/${p.id}.pdf`).id : value);
  for(const record of records.slice(0,500)) {
    const row=record&&{...record,from:endpoint(record.from),to:endpoint(record.to)};
    if(!row||!nodes.has(row.from)||!nodes.has(row.to)||row.from===row.to||!['uses','extends','related to','contradicts','supports'].includes(row.type)||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>2000)continue;
    const key=JSON.stringify([row.from,row.to,row.type]);
    if(seen.has(key))continue;
    if(project.dismissedConnections?.includes('assistant-'+encodeURIComponent(key)))continue;
    seen.add(key);links.push({id:'assistant-'+encodeURIComponent(key),from:row.from,to:row.to,type:row.type,reason:row.reason,origin:'assistant',reviewed:false});
  }
  return links.length!==(project.links||[]).length?{links}:{};
}
