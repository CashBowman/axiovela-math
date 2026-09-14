import UpdateNotice from './UpdateNotice.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Plus,Save,Download,RefreshCw,FolderOpen,BookOpen,Edit3,X,FileText} from 'lucide-react';
import {Cite} from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/dm-mono/400.css';
import 'katex/dist/katex.min.css';
import {stages,reviewIssues} from '../shared/research.mjs';
import {Panel,Preview,download,request} from './ui.jsx';
import Resizable from './Resizable.jsx';
import ChatPanel from './ChatPanel.jsx';
import Library from './Library.jsx';
import LeanWorkspace from './LeanWorkspace.jsx';
import {reconcileResearch,resolveResearch} from '../shared/research-sync.mjs';
import './style.css';
import './workspace.css';
function App(){
 const [state,setState]=useState(null),[tab,setTab]=useState('Research'),[dirty,setDirty]=useState(false),[status,setStatus]=useState('Loading workspace…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[format,setFormat]=useState('markdown'),[resetKeys,setResetKeys]=useState({}),[modal,setModal]=useState(''),[name,setName]=useState(''),[parent,setParent]=useState(''),[bibStatus,setBibStatus]=useState(''),[pdf,setPdf]=useState({}),[rendering,setRendering]=useState({}),[editProof,setEditProof]=useState(false),[folder,setFolder]=useState('');
 const artifactHashes=useRef({});
 const [researchChanges,setResearchChanges]=useState({}),[syncError,setSyncError]=useState('');
 const recoveryKey='axiovela-math-pending-workspace';
 const modalRef=useRef();
 const latest=useRef();latest.current=state;const saveInFlight=useRef();const dirtyRef=useRef();dirtyRef.current=dirty;
 useEffect(()=>{request('/api/state').then(s=>{let pending=null;try{pending=JSON.parse(localStorage.getItem(recoveryKey));}catch{}if(pending?.revision===s.revision&&Array.isArray(pending.projects)){setState(pending);setDirty(true);setStatus('Recovered unsaved edits');}else{setState(s);setStatus('Saved locally');if(pending)setError('A recovery draft belongs to an older workspace revision. Export it from Project before reconciling your edits.');}}).catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(dirty&&state)try{localStorage.setItem(recoveryKey,JSON.stringify(state));}catch{setError('Local draft recovery is unavailable. Save the workspace or export your edits.');}},[state,dirty]);
 useEffect(()=>{if(modal&&!modalRef.current.open)modalRef.current.showModal();},[modal]);
 useEffect(()=>{const prevent=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
 const project=state?.projects.find(p=>p.id===state.activeProjectId);
 useEffect(()=>{if(project){setEditProof(false);for(const kind of ['markdown','latex','bibliography'])request(`/api/artifact?project=${project.id}&kind=${kind}`).then(r=>{if(r.text===project[kind])artifactHashes.current[project.id+':'+kind]=r.hash;}).catch(()=>{});request('/api/project-root?project='+project.id).then(x=>setFolder(x.folder)).catch(e=>setError(e.message));try{setFormat(localStorage.getItem('axiovela-math-format:'+project.id)||'markdown');}catch{}}},[project?.id]);
 // Poll independently of the visible chat, including updates made from Library.
 useEffect(()=>{
  if(!project)return;
  const id=project.id;let canceled=false,timer;
  setResearchChanges({});setSyncError('');
  async function poll(){
   try{
    const result=await request('/api/research-artifacts?project='+id);
    if(canceled)return;
    setSyncError('');
    if(!result.working){
     const current=latest.current.projects.find(p=>p.id===id);
     const {patch,conflicts}=reconcileResearch(current,result.artifacts);
     setResearchChanges({projectId:id,...conflicts});
     if(Object.keys(patch).length){
      const next={...latest.current,projects:latest.current.projects.map(p=>p.id===id?{...p,...patch}:p)};
      latest.current=next;dirtyRef.current=true;setState(next);setDirty(true);setStatus('Research updated · unsaved');
     }
    }
   }catch(e){if(!canceled)setSyncError('Research updates paused: '+e.message+' Retrying automatically.');}
   if(!canceled)timer=setTimeout(poll,1800);
  }
  poll();return()=>{canceled=true;clearTimeout(timer);};
 },[project?.id]);
 function resolveChange(kind,useRemote){
  const remote=researchChanges[kind];if(!remote||researchChanges.projectId!==project.id)return;
  update(p=>resolveResearch(p,kind,remote,useRemote));
  setResearchChanges(c=>({...c,[kind]:null}));setModal('');
 }
 function changeNotice(kind){return researchChanges.projectId===project.id&&researchChanges[kind]?<div className="panelFoot researchChange"><span>Your edits are preserved. An assistant update is ready.</span><button onClick={()=>setModal('research-'+kind)}>Review changes</button></div>:null;}
 function update(patch){setState(s=>({...s,projects:s.projects.map(p=>p.id===project.id?{...p,...(typeof patch==='function'?patch(p):patch)}:p)}));setDirty(true);setStatus('Unsaved changes');}
 async function save(){if(saveInFlight.current){await saveInFlight.current;if(dirtyRef.current)return save();return;}if(!dirtyRef.current)return;const snapshot=latest.current;setBusy(true);const work=(async()=>{const result=await request('/api/state',{method:'PUT',headers:{'If-Match':String(snapshot.revision)},body:JSON.stringify(snapshot)});if(latest.current===snapshot){latest.current=result;setState(result);setDirty(false);dirtyRef.current=false;setStatus('Saved locally');try{localStorage.removeItem(recoveryKey);}catch{}}else{const newer={...latest.current,revision:result.revision};latest.current=newer;setState(newer);setStatus('Newer edits remain unsaved');}})();saveInFlight.current=work;try{await work;}finally{saveInFlight.current=null;setBusy(false);}}
 const safe=fn=>async(...args)=>{setError('');try{return await fn(...args);}catch(e){setError(e.message);}};
 async function addPaper(e){const file=e.target.files?.[0];if(!file)return;setBusy(true);try{const r=await fetch('/api/papers',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});const data=await r.json();if(!r.ok)throw Error(data.error);update(p=>({papers:[...p.papers,{id:data.id,title:file.name.replace(/\.pdf$/i,''),notes:'',citationKey:'',read:false}]}));}finally{setBusy(false);e.target.value='';}}
 async function create(e){e.preventDefault();await save();const result=await request('/api/projects',{method:'POST',body:JSON.stringify({name,parentDirectory:parent,revision:latest.current.revision})});setState(result);setDirty(false);setModal('');setName('');setParent('');}
 function useReply(text,role){const fence=text.match(/```(markdown|md|latex|tex)\s*\n([\s\S]*?)```/);if(role==='writing'){const f=fence&&['latex','tex'].includes(fence[1])?'latex':'markdown';update({[f]:fence?fence[2]:text});setFormat(f);localStorage.setItem('axiovela-math-format:'+project.id,f);setTab('Write-up');}else update({proof:fence?fence[2]:text});}
 async function refreshArtifact(kind){if(dirtyRef.current)throw Error('Save your edits before loading a project file.');const r=await request(`/api/artifact?project=${project.id}&kind=${kind}`);artifactHashes.current[project.id+':'+kind]=r.hash;update({[kind]:r.text});}
 async function saveSource(kind=format){await save();const id=project.id;const p=latest.current.projects.find(p=>p.id===id);const result=await request('/api/artifact?project='+id,{method:'PUT',body:JSON.stringify({kind,text:p[kind],expectedHash:artifactHashes.current[id+':'+kind]??null})});artifactHashes.current[id+':'+kind]=result.hash;setStatus(kind==='bibliography'?'Bibliography saved to project':'Source saved to project');}
 function changeFormat(f){setFormat(f);localStorage.setItem('axiovela-math-format:'+project.id,f);}
 async function render(){const id=project.id,source=project.latex,bibliography=project.bibliography;setRendering(r=>({...r,[id]:true}));setError('');try{const result=await request('/api/render?project='+id,{method:'POST',body:JSON.stringify({source,bibliography})});setPdf(p=>({...p,[id]:{...result,source,bibliography}}));}catch(e){setError(`Rendering ${project.name}: ${e.message}`);}finally{setRendering(r=>({...r,[id]:false}));}}
 if(!state)return <div className="loading"><img src="/workbench-mark.png" alt=""/><h1>Axiovela Math</h1><p role="status">{error||status}</p></div>;
 const reset=resetKeys[tab]||0;
 const currentPdf=pdf[project.id];const renderBusy=!!rendering[project.id];
 const researchLeft=<Panel title="Executive summary" label="RESEARCH BRIEF" className="fill" action={<button onClick={()=>setModal('brief')}><Edit3 size={13}/>Edit</button>}><div className="scrollBody"><div className="panelBody"><h3>{project.question||'Start with a mathematical question'}</h3><p className="hint">{project.claims.length} claims · {project.papers.length} sources</p></div><Preview source={project.summary||'The executive summary will capture the question, current approach, established progress, and unresolved obstacles. Ask the research assistant to maintain it as the work develops.'}/>{project.notes&&<div className="panelBody"><h3>Working notes</h3><Preview source={project.notes}/></div>}</div>{changeNotice('summary')}</Panel>;
 const researchMiddle=<Panel title="Proof write-ups" label="DEVELOPING THE ARGUMENT" className="fill" action={<button onClick={()=>setEditProof(!editProof)}><Edit3 size={13}/>{editProof?'Read proof':'Edit'}</button>}>{editProof?<textarea className="code fillEditor" aria-label="Proof write-up source" value={project.proof} onChange={e=>update({proof:e.target.value})}/>:<div className="scrollBody">{project.proof?<Preview source={project.proof}/>:<div className="empty largeEmpty"><FileText size={30}/><h3>Give the argument room to develop</h3><p>Arguments saved by the assistant appear here automatically. You can also use a reply as your working proof. Mathematical notation is rendered in full.</p><p>The final paper has its own Write-up tab.</p></div>}</div>}{changeNotice('proof')}</Panel>;
 const writingLeft=<Panel title="Write-up" label={format==='markdown'?'MARKDOWN SOURCE':'LATEX SOURCE'} className="fill" action={<button onClick={safe(()=>saveSource())} disabled={busy}><Save size={13}/>Save source</button>}><div className="formatBar"><div className="formatSwitch">{['markdown','latex'].map(f=><button key={f} className={format===f?'selected':''} onClick={()=>changeFormat(f)}>{f==='markdown'?'Markdown':'LaTeX'} <span className="badge">{project[f].trim()?'Draft':'Empty'}</span></button>)}</div>{format==='latex'&&<button className="renderButton" disabled={renderBusy} onClick={render}>{renderBusy?'Rendering…':'Render PDF'}</button>}</div><p className="sourceStatus">{dirty?'Unsaved workspace edits':'Workspace saved. Save source writes the project file.'}</p><textarea className="code fillEditor" aria-label="Manuscript source" value={project[format]} onChange={e=>{update({[format]:e.target.value});}}/><div className="panelFoot"><button onClick={safe(()=>refreshArtifact(format))}><RefreshCw size={13}/>Load assistant’s saved draft</button><button onClick={()=>setModal('bibliography')}><BookOpen size={13}/>Bibliography</button></div></Panel>;
 const writingMiddle=<Panel title="Rendered write-up preview" className="fill"><div className="previewToolbar"><span>Final publication manuscript</span><div className="row"><button onClick={()=>download(format==='markdown'?'main.md':'main.tex',project[format])}><Download size={13}/>Export source</button>{format==='markdown'&&<button onClick={()=>window.print()}>Print / PDF</button>}</div></div>{format==='markdown'?<div className="scrollBody paperPreview"><Preview source={project.markdown} bibliography={project.bibliography}/></div>:currentPdf?<><div className="panelFoot">{currentPdf.source!==project.latex||currentPdf.bibliography!==project.bibliography?'Source or bibliography changed. Render again to update the PDF.':'Rendered from the current source.'}<a href={`/api/rendered?project=${project.id}&id=${currentPdf.id}`} target="_blank" rel="noreferrer">Open / download PDF</a></div><iframe className="fullPdf" title="Publication PDF" src={`/api/rendered?project=${project.id}&id=${currentPdf.id}`}/></>:<div className="empty largeEmpty">Choose Render PDF to compile the publication draft with Tectonic. Markdown and LaTeX are independent documents.</div>}<div className="panelFoot"><button onClick={()=>setModal('review')}>Submission checks</button><span>Correctness · attribution · exposition</span></div></Panel>;
 return <div className="app"><div className="projectStrip"><div className="projectBrand"><img src="/workbench-mark.png" alt=""/><strong>Axiovela <span>Math</span></strong></div><div className="projectTabs" aria-label="Projects">{state.projects.map(p=><button key={p.id} className={project.id===p.id?'active':''} onClick={()=>{setState(s=>({...s,activeProjectId:p.id}));setDirty(true);}}>{p.name}</button>)}<button className="icon" aria-label="New project" onClick={()=>setModal('project')}><Plus size={16}/></button></div><span className="previewLabel">LINUX DEVELOPMENT</span></div>
 <header className="topbar"><nav aria-label="Workspace sections">{stages.map(s=><button key={s} className={tab===s?'selected':''} onClick={()=>setTab(s)}>{s}</button>)}</nav><div className="topActions"><UpdateNotice/><span className="saveState" role="status">{dirty?'○':'●'} {status}</span><button onClick={safe(save)} disabled={busy}><Save size={13}/>Save workspace</button><button onClick={()=>{localStorage.removeItem('axiovela-math-layout:'+({'Research':'research','Library':'library','Lean Certificates':'lean','Write-up':'writing'}[tab]));if(tab==='Library')localStorage.removeItem('axiovela-math-layout:library-detail');setResetKeys(x=>({...x,[tab]:(x[tab]||0)+1}));}}><RefreshCw size={13}/>Reset layout</button><button onClick={()=>setModal('project')}><FolderOpen size={14}/>Project</button></div></header>
 {syncError&&<div className="error" role="status">{syncError}</div>}
 {error&&<div className="error" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
 <div className="workspaceShell">
 {tab==='Research'&&<Resizable key={'research'+reset} resetKey={reset} id="research" defaults={[27,43,30]}>{[researchLeft,researchMiddle,<ChatPanel key={project.id+'research'} project={project} role="research" beforeSend={save} onArtifact={useReply}/>]}</Resizable>}
 {tab==='Library'&&<Library key={project.id} project={project} update={update} onImport={safe(addPaper)} onBibliography={()=>setModal('bibliography')} resetKey={reset} busy={busy} beforeSend={save} onArtifact={useReply}/>}
 {tab==='Lean Certificates'&&<LeanWorkspace key={project.id} project={project} resetKey={reset} beforeSend={save} onArtifact={useReply}/>}
 {tab==='Write-up'&&<Resizable key={'writing'+reset} resetKey={reset} id="writing" defaults={[34,37,29]}>{[writingLeft,writingMiddle,<ChatPanel key={project.id+'writing'} project={project} role="writing" workspace="writing" writingFormat={format} beforeSend={save} onArtifact={useReply}/>]}</Resizable>}
 </div>
 {modal&&<dialog ref={modalRef} onCancel={()=>setModal('')} aria-label={modal==='research-history'?'Research version history':modal.startsWith('research-')?'Review research changes':modal==='project'?'Project settings':modal==='brief'?'Research brief':modal==='bibliography'?'Bibliography':'Submission checks'} className={`modal appDialog ${modal==='bibliography'?'wideModal':''}`}><div className="modalHeader"><h2>{modal==='research-history'?'Research version history':modal.startsWith('research-')?'Review research changes':modal==='project'?'Projects':modal==='brief'?'Research brief':modal==='bibliography'?'Bibliography':'Submission checks'}</h2><button className="icon" aria-label="Close dialog" onClick={()=>setModal('')}><X size={18}/></button></div>
 {error&&<p className="inlineError" role="alert">{error}</p>}
 {modal==='project'&&<><p className="hint">Current project folder: {folder}</p><form onSubmit={safe(create)}><label>New project name<input autoFocus value={name} onChange={e=>setName(e.target.value)} required/></label><label>Parent folder (optional)<input value={parent} onChange={e=>setParent(e.target.value)} placeholder="Use the app’s projects folder"/></label>{window.methodflowDesktop?.chooseProjectFolder&&<button type="button" onClick={safe(async()=>{const p=await window.methodflowDesktop.chooseProjectFolder();if(p)setParent(p);})}>Choose folder…</button>}<button className="primary" type="submit">Create project folder</button></form><hr/>{!!project.researchHistory?.length&&<button onClick={()=>setModal('research-history')}>Research version history</button>}<button onClick={()=>{const pending=localStorage.getItem(recoveryKey);if(pending)download('axiovela-math-recovery.json',pending,'application/json');else setError('No unsaved recovery draft is stored.');}}>Export recovery draft</button><button onClick={()=>download('axiovela-math-workspace.json',JSON.stringify(state,null,2),'application/json')}><Download size={13}/>Export workspace JSON</button><p className="hint">PDF files, saved experiment evidence and provider conversations remain in their local folders.</p></>}
 {modal.startsWith('research-')&&modal!=='research-history'&&(()=>{const kind=modal.slice(9),remote=researchChanges.projectId===project.id&&researchChanges[kind];return remote?<><p>Your version stays in place until you choose. Replaced text is retained in the workspace recovery history.</p><div className="researchComparison"><section><h3>Your version</h3><Preview source={project[kind]||'(Empty)'}/></section><section><h3>Assistant update</h3><Preview source={remote.text||'(Empty)'}/></section></div><div className="row"><button onClick={()=>resolveChange(kind,false)}>Keep my version</button><button className="primary" onClick={()=>resolveChange(kind,true)}>Use assistant version</button></div></>:<p>No pending change.</p>;})()}
 {modal==='research-history'&&<div className="scrollBody">{[...(project.researchHistory||[])].reverse().map((version,i)=><details key={i}><summary>{version.kind==='proof'?'Working proof':'Executive summary'} · {new Date(version.savedAt).toLocaleString()}</summary><Preview source={version.text||'(Empty)'}/><button onClick={()=>{update(p=>({[version.kind]:version.text,researchHistory:[...(p.researchHistory||[]),{kind:version.kind,text:p[version.kind],savedAt:new Date().toISOString(),reason:'Before restoring an earlier version'}]}));setModal('');}}>Restore this version</button></details>)}</div>}
 {modal==='brief'&&<><label>Question or direction<textarea value={project.question} onChange={e=>update({question:e.target.value})}/></label><label>Executive summary<textarea value={project.summary} onChange={e=>update({summary:e.target.value})}/></label><label>Working notes<textarea value={project.notes} onChange={e=>update({notes:e.target.value})}/></label><button onClick={()=>setModal('')}>Done</button></>}
 {modal==='bibliography'&&<><textarea className="code" aria-label="BibTeX bibliography" value={project.bibliography} onChange={e=>{update({bibliography:e.target.value});setBibStatus('');}}/><div className="row"><button onClick={safe(()=>saveSource('bibliography'))}>Save bibliography</button><button onClick={safe(()=>refreshArtifact('bibliography'))}>Load saved bibliography</button><button onClick={()=>{try{setBibStatus(`${new Cite(project.bibliography).data.length} entries parsed. Source accuracy still requires review.`);}catch(e){setBibStatus(e.message);}}}>Check syntax</button><button onClick={()=>download('references.bib',project.bibliography)}>Export BibTeX</button></div><p role="status">{bibStatus}</p></>}
 {modal==='review'&&<><p>These checks flag recorded gaps. They do not establish novelty or guarantee publication.</p><ul className="issues">{reviewIssues(project).map((x,i)=><li key={i}>{x}</li>)}</ul></>}
 </dialog>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
