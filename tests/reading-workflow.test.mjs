import {ProjectCatalog} from "../server/project-catalog.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {blankProject} from '../shared/research.mjs';
import {extractArticle,readableTitle} from '../server/article-content.mjs';
import {importSource,bookmark} from '../server/library-sources.mjs';
import {addLibrarySources} from '../shared/library.mjs';
import {webMarkdown,readingIdentity} from '../shared/reading-annotations.mjs';
import {prepareReadingFeedback} from '../server/reading-feedback.mjs';
import {mergeSourceConnections} from '../shared/source-connections.mjs';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {Chats} from '../server/chat.mjs';
import {readResearchArtifacts} from '../server/research-artifacts.mjs';
import {finishManuscript,manuscriptSnapshot,saveManuscript} from '../server/manuscript-artifacts.mjs';

test('website snapshots retain headings, code, MathJax and publication titles over filename titles',()=>{
 assert.equal(extractArticle('<html><head><title>A blog note</title></head><body><article><p>A plain article without a PDF attachment.</p></article></body></html>','https://example.org/note').pdfUrl,'');
 const html='<html><head><title>feng25s.html</title><meta name="citation_title" content="Geometry of Sampling"><meta name="citation_pdf_url" content="/paper.pdf"></head><body><article><h1>Geometry</h1><p>A mathematical result with \\(x^2\\).</p><h2>Argument</h2><p><script type="math/tex; mode=display">x+y=z</script></p><pre>print(x)</pre><p><a href="/details">Details</a></p><script>evil()</script></article></body></html>';
 const doc=extractArticle(html,'https://example.org/article');
 assert.equal(doc.title,'Geometry of Sampling');assert.equal(doc.pdfUrl,'https://example.org/paper.pdf');
 assert.match(doc.text,/## Argument/);assert.match(doc.text,/```\nprint\(x\)/);assert.match(doc.text,/\$\$\nx\+y=z/);assert.match(doc.text,/https:\/\/example.org\/details/);assert.ok(!doc.text.includes('evil'));
 assert.match(webMarkdown(doc.text),/\$x\^2\$/);
 assert.equal(webMarkdown('`\\(code\\)`'),'`\\(code\\)`');
 for(const bad of ['feng25s.html','39c5871aa13be86ab978cba7069cbcec Abstract Conference.html'])assert.equal(readableTitle(bad),'');
 assert.equal(bookmark('https://example.org/feng25s.html').title,'Source from example.org');
});
test('publisher metadata resolves a readable PDF and enriches existing records without changing reader notes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reading-import-'));
 try{
  const fetched=[];const {paper}=await importSource('https://example.org/feng25s.html',root,async url=>{fetched.push(url);return url.endsWith('.pdf')?{bytes:Buffer.from('%PDF-fixture'),type:'application/pdf'}:{bytes:Buffer.from('<html><head><meta name="citation_title" content="Verified publication title"><meta name="citation_pdf_url" content="/paper.pdf"></head><body><article><p>A readable abstract of the mathematical argument.</p></article></body></html>'),type:'text/html',url};},'existing');
  assert.equal(paper.id,'existing');assert.equal(paper.sourceType,'pdf');assert.equal(paper.title,'Verified publication title');assert.equal(fetched.length,2);
  const project={...blankProject('x'),papers:[{...paper,title:'My custom title',titleEdited:true,notes:'My exact hypotheses',read:true,capturedAt:'old'}]};
  const patch=addLibrarySources(project,[paper]);assert.equal(patch.papers[0].title,'My custom title');assert.equal(patch.papers[0].notes,'My exact hypotheses');assert.equal(patch.papers[0].read,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('reading feedback permits mixed sources but rejects stale passages and manuscript annotations',()=>{
 const p={...blankProject('p'),proof:'A proof.',papers:[{id:'s',title:'Source',text:'An article.',capturedAt:'now'}]};
 p.manuscriptComments=[{id:'a',target:{kind:'proof'},anchor:{quote:'A proof.'},comment:'Explain.'},{id:'b',target:{kind:'paper',id:'s'},anchor:{quote:'An article.'},comment:'Compare.'}].map(c=>({...c,sourceHash:createHash('sha256').update(readingIdentity(p,c.target)).digest('hex')}));
 assert.equal(prepareReadingFeedback(p,['a','b'],'research').length,2);
 assert.throws(()=>prepareReadingFeedback(p,['a'],'writing'));
 p.proof='Changed';assert.throws(()=>prepareReadingFeedback(p,['a'],'research'),/changed/);
});
test('model connections require known endpoints and justification, retain manual edges, and respect dismissal',()=>{
 const p={...blankProject('p'),papers:[{id:'a'},{id:'b'}]};
 const valid={from:'paper:a',to:'paper:b',type:'uses',reason:'Uses the stated curvature assumption.'};
 const patch=mergeSourceConnections(p,[valid,{...valid,to:'paper:unknown'},{...valid,type:'proved'}]);
 assert.equal(patch.links.length,1);assert.equal(patch.links[0].reviewed,false);
 assert.deepEqual(mergeSourceConnections({...p,...patch},[valid]),{});
 assert.deepEqual(mergeSourceConnections({...p,dismissedConnections:[patch.links[0].id]},[valid]),{});
});
test('independent research, publication and project chats run concurrently; publication saves a complete chat draft',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-chats-'));
 let chats;
 for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','WORKBENCH_COMPATIBLE_API_KEY'])delete process.env[key];
 process.env.WORKBENCH_CODEX_PATH=path.resolve('scripts/fixtures/assistant-rpc.mjs');process.env.WORKBENCH_PROVIDER_SETTINGS_PATH=path.join(dir,'providers.json');
 try{
  const store=new Store(dir);let state=await store.read();state.projects.push(blankProject('second'));state=await store.save(state,0);
  const projects=new Projects(dir,store);await projects.init();chats=new Chats(projects,store);
  const id=state.activeProjectId,first=await chats.newConversation(id,'research'),writing=await chats.newConversation(id,'writing'),other=await chats.newConversation('second','research'),sibling=await chats.newConversation(id,'research');
  assert.equal(writing.mode,'auto');await chats.send(id,first.id,'FIXTURE_HANG');
  await chats.send(id,writing.id,'Write a complete paper FIXTURE_WRITING_CHAT');
  await chats.send('second',other.id,'FIXTURE_HANG');await chats.send(id,sibling.id,'FIXTURE_PROMPT');
  for(let n=0;n<100&&writing.turns.at(-1).status==='running';n++)await new Promise(r=>setTimeout(r,30));
  assert.equal(writing.turns.at(-1).status,'complete');assert.equal(first.turns.at(-1).status,'running');assert.equal(other.turns.at(-1).status,'running');
  const catalog=new ProjectCatalog(store,projects),beforeThreads=JSON.stringify((await chats.load(id)).map(c=>({id:c.id,sessionId:c.sessionId,queue:c.queue})));
  await catalog.snapshot({details:true});
  await catalog.edit({action:'pin',id:'second',pinned:true,revision:(await store.read()).revision});
  await catalog.edit({action:'link',from:'project:'+id,to:'project:second',type:'related-to',description:'An explicitly entered test relationship.',revision:(await store.read()).revision});
  assert.equal(first.turns.at(-1).status,'running');assert.equal(other.turns.at(-1).status,'running');
  assert.equal(JSON.stringify((await chats.load(id)).map(c=>({id:c.id,sessionId:c.sessionId,queue:c.queue}))),beforeThreads);

  const root=await projects.root(id);assert.match((await manuscriptSnapshot(root,'markdown')).text,/# Recovered complete paper/);
  await readResearchArtifacts(root);assert.match((await readResearchArtifacts(root)).markdown.text,/Recovered complete paper/);
  for(let n=0;n<100&&sibling.turns.at(-1).status==='running';n++)await new Promise(r=>setTimeout(r,30));
  assert.equal(sibling.turns.at(-1).status,'complete');assert.match(sibling.turns.at(-1).output,/research\/connections.json/);
  assert.equal((await manuscriptSnapshot(root,'latex')).text,'');
  const before=await manuscriptSnapshot(root,'markdown');await saveManuscript(root,'markdown','A newer independent draft',before.hash);
  await finishManuscript(root,'markdown',before,'```markdown\nAn older answer\n```');assert.equal((await manuscriptSnapshot(root,'markdown')).text,'A newer independent draft');
 }finally{if(chats){await chats.stopAll();for(let n=0;n<100&&chats.controllers.size;n++)await new Promise(r=>setTimeout(r,30));}await fs.rm(dir,{recursive:true,force:true});}
});

test('article figures are cached from validated source links; executable and unrelated assets are rejected',async()=>{
 const {sourceImage}=await import('../server/library-sources.mjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-figure-'));
 try{
  const image='https://example.org/figure.png',paper={text:'![Figure]('+image+')'};let calls=0;
  const png=Buffer.from([137,80,78,71,13,10,26,10]);const fetcher=async()=>{calls++;return {bytes:png};};
  assert.equal((await sourceImage(paper,image,dir,fetcher)).type,'image/png');await sourceImage(paper,image,dir,fetcher);assert.equal(calls,1);
  await assert.rejects(sourceImage(paper,'https://example.org/unrelated',dir,fetcher),/not part/);
  await assert.rejects(sourceImage({text:'![Figure](https://example.org/a.svg)'},'https://example.org/a.svg',dir,async()=>({bytes:Buffer.from('<svg onload="evil()"/>')})),/supported raster/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('title enrichment repairs untouched generated bibliography entries while preserving authored metadata',()=>{
 const old={...bookmark('https://example.org/hash.html'),title:'hash.html'};
 const initial={...blankProject('p'),...addLibrarySources(blankProject('p'),[old])};
 const next={...old,title:'The actual paper title',sourceType:'pdf',contentVersion:2,capturedAt:'today'};
 assert.match(addLibrarySources(initial,[next]).bibliography,/The actual paper title/);
 const custom={...initial,bibliography:initial.bibliography.replace('Web source','My bibliographic note')};
 assert.equal(addLibrarySources(custom,[next]).bibliography,undefined);
 assert.match(custom.bibliography,/My bibliographic note/);
});
