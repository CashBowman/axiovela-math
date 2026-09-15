export function readingDocument(project, target) {
  if(target?.kind==='proof')return {source:project.proof||'',title:'Proof write-ups',revision:''};
  if(target?.kind==='paper'){
    const paper=project.papers.find(p=>p.id===target.id);
    if(paper)return {source:paper.text||'',title:paper.title,revision:paper.contentHash||paper.capturedAt||paper.id};
  }
  throw Error('This annotation source is no longer available.');
}
export function readingIdentity(project,target) {
  const doc=readingDocument(project,target);
  return doc.source+'\0'+doc.revision;
}
// Markdown math engines use $ delimiters; websites often use MathJax delimiters.
// Leave code examples intact.
export function webMarkdown(source='') {
  return source.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part,i)=>i%2?part:part.replace(/\\\[([\s\S]*?)\\\]/g,(_,math)=>'\n\n$$\n'+math.trim()+'\n$$\n\n').replace(/\\\(([\s\S]*?)\\\)/g,(_,math)=>'$'+math+'$')).join('');
}
