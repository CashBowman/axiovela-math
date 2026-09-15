// Bibliography metadata is deliberately minimal; unknown authors/dates are not invented.
const bibText = value => String(value).replace(/[\\{}%&#_$]/g, c => '\\'+c).replace(/[\r\n]+/g,' ');
function generatedEntry(p) {
  return '@misc{'+p.citationKey+',\n  title = {'+bibText(p.title)+'},'+
    (p.sourceUrl?'\n  url = {'+bibText(p.sourceUrl)+'},':'')+
    '\n  note = {'+(p.sourceType==='web'?'Web source':'Imported PDF; bibliographic metadata needs review')+'}\n}\n';
}
export function addLibrarySources(project,incoming) {
  const additions=incoming.filter(p=>!project.papers.some(x=>x.id===p.id||(p.sourceUrl&&x.sourceUrl===p.sourceUrl)));
  let bibliography=project.bibliography,upgraded=false;
  const papers=project.papers.map(old=>{
    const next=incoming.find(p=>p.id===old.id||(p.sourceUrl&&p.sourceUrl===old.sourceUrl));
    if(!next||!next.contentVersion||next.capturedAt===old.capturedAt)return old;
    upgraded=true;
    const merged={...old,...next,id:old.id,notes:old.notes,read:old.read,citationKey:old.citationKey,title:old.titleEdited?old.title:next.title,titleEdited:old.titleEdited};
    // Update only our exact untouched generated entry, never author-edited BibTeX.
    if(old.citationKey&&bibliography.includes(generatedEntry(old)))bibliography=bibliography.replace(generatedEntry(old),generatedEntry(merged));
    return merged;
  });
  if(!additions.length&&!upgraded)return {};
  for(const p of additions)if(p.citationKey&&!bibliography.includes('{'+p.citationKey+','))bibliography+='\n\n'+generatedEntry(p);
  return {papers:[...papers,...additions],...(bibliography!==project.bibliography||additions.length?{bibliography}:{})};
}
