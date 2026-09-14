import React,{useEffect,useState} from 'react';
import {CheckCircle2,AlertCircle,RefreshCw,Play} from 'lucide-react';
import {Panel,Preview,request} from './ui.jsx';
import Resizable from './Resizable.jsx';
import ChatPanel from './ChatPanel.jsx';
export default function LeanWorkspace({project,resetKey,beforeSend,onArtifact}){
 const [data,setData]=useState({records:[],files:[]}),[checking,setChecking]=useState(false),[error,setError]=useState(''),[setupMessage,setSetupMessage]=useState('');
 const api='/api/lean?project='+project.id;
 useEffect(()=>{let canceled=false,timer;async function poll(){try{const result=await request(api);if(!canceled)setData(result);}catch(e){if(!canceled)setError(e.message);}if(!canceled)timer=setTimeout(poll,1400);}poll();return()=>{canceled=true;clearTimeout(timer);};},[project.id]);
 async function refresh(){setData(await request(api));}
 async function run(build){setChecking(true);setError('');try{await request(api,{method:'POST',body:JSON.stringify({run:build})});await refresh();}catch(e){setError(e.message);}finally{setChecking(false);}}
 async function setup(){setError('');try{const result=await request('/api/lean/setup?project='+project.id,{method:'POST',body:'{}'});setSetupMessage(result.message);await refresh();}catch(e){setError(e.message);}}
 async function copySetup(){try{await navigator.clipboard.writeText(data.setup.command);setSetupMessage('Setup command copied. Paste it into a terminal; downloads and the test run automatically.');}catch(e){setError(e.message);}}
 const busy=checking||data.running||data.setup?.busy,current=data.records[0],plan=data.plan;

 const left=<Panel title="Formalization plan" label="TARGET & PROGRESS" className="fill"><div className="scrollBody panelBody">
 {plan?<><h3>{plan.title||'Current formalization'}</h3><Preview source={plan.statement} lean/>{plan.scopeNotes&&<><h3>Scope and correspondence</h3><Preview source={plan.scopeNotes} lean/></>}{plan.assumptions.length>0&&<><h3>Assumptions</h3>{plan.assumptions.map((x,i)=><Preview key={i} source={x} lean/>)}</>}{plan.obligations.length>0&&<><h3>Remaining obligations</h3>{plan.obligations.map((x,i)=><Preview key={i} source={x} lean/>)}</>}<p className="hint">Assistant’s mathematical notes. Verification status comes from the checks alongside.</p></>:!data.summary&&<p>Ask the shared assistant to formalize a result from your conversation. It can choose an elementary target when you ask it to. No separate claim entry is required.</p>}
 {data.summary&&<Preview source={data.summary} lean/>}{data.planError&&<p className="inlineError">{data.planError}</p>}
 {!!project.claims.length&&<><h3>Research claims</h3>{project.claims.map(c=><div className="obligation" key={c.id}><strong>{c.id}</strong><Preview source={c.statement} lean/><span className="badge">{c.status.replaceAll('-',' ')}</span></div>)}</>}
 <div className="notice"><AlertCircle size={17}/><div>A passing build checks an encoded statement. Scope, assumptions and correspondence still need review.</div></div>
 </div></Panel>;
 const middle=<Panel title="Certificate checks" label="SAVED FORMAL WORK" className="fill" action={<button onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw size={13}/>Refresh</button>}><div className="scrollBody panelBody">
 <div className="certificateSaved"><h3>{data.sourceHash?'Formal source saved':'No formal source saved yet'}</h3><p>{data.sourceHash?'The Lean project is saved on disk. Its readable notes and check results update here automatically.':'A chat explanation is not a saved Lean proof. Ask the assistant to save the formalization, or use Save Lean draft on an earlier reply.'}</p>{data.files.length>0&&<p className="hint">{data.files.filter(f=>f.path.endsWith('.lean')).length} Lean source files · {data.toolchain||'Toolchain not pinned'} · {data.hasManifest?'Dependency lockfile present':'Dependencies not locked'}</p>}{plan?.declarations?.length>0&&<><h3>Target declarations</h3>{plan.declarations.map(name=><p key={name} className="declarationName">{name}</p>)}</>}</div>
 {data.setup&&<div className="notice leanSetup">{data.setup.state==='ready'?<CheckCircle2 size={17}/>:<AlertCircle size={17}/>}<div><strong>{data.setup.state==='ready'?'Lean setup test passed':data.setup.busy?'Setting up Lean':data.lakeAvailable===false?'Lean checker is not installed':'Prepare Lean for this project'}</strong>
 <p>{data.setup.state==='ready'?`The compiler and project imports passed a small theorem test (${data.setup.toolchain}). Your research proof is checked separately below.`:data.setup.message||'One click installs Lean, Lake and this project’s mathematical libraries, then compiles a small test. Internet is required for downloads; allow several GB of disk space for mathlib.'}</p>
 {data.setup.state!=='ready'&&<button disabled={busy} onClick={setup}>{data.setup.busy?'Setup in progress…':['failed','interrupted','needs-setup'].includes(data.setup.state)?'Retry Lean setup':'Set up Lean'}</button>}
 {setupMessage&&<p role="status">{setupMessage}</p>}<details><summary>Setup details and terminal command</summary><p>Existing formal source and dependency versions are preserved. Setup may run the project’s Lake configuration to fetch and check its libraries. Close the setup terminal to stop; retry resumes installed downloads.</p><button onClick={copySetup}>Copy setup command</button><code>{data.setup.command}</code>{data.setup.log&&<pre className="setupLog">{data.setup.log}</pre>}</details>
 </div></div>}

 <div className="row"><button disabled={busy} onClick={()=>run(false)}>Inspect project</button><button className="primary" disabled={busy} onClick={()=>run(true)}><Play size={13}/>{busy?'Checking…':'Run Lean check'}</button></div>
 <p className="hint">Project editing saves source and notes. Full access permits automatic checks after assistant changes; Run Lean check explicitly checks the saved project.</p>
 {error&&<p className="inlineError" role="alert">{error}</p>}{data.stale&&<p role="status" className="inlineError">The formalization changed since this check. These results describe an earlier version.</p>}
 {current?<><h3 className="checkHeading">{current.status.replaceAll('-',' ')}</h3><p>{current.message}</p>{current.checks.map((c,i)=><div className="checkRow" key={i}>{['present','clear'].includes(c.status)?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}<div><strong>{c.label}</strong><p>{c.detail}</p></div><span className="badge">{c.status.replaceAll('-',' ')}</span></div>)}<p className="hint">Checked {new Date(current.checkedAt).toLocaleString()}. {current.sourceHash?'Source snapshot: '+current.sourceHash.slice(0,12):''}</p></>:<p className="empty">No recorded checks yet.</p>}
 <h3>Check history</h3>{data.records.map(r=><div className="historyRow" key={r.id}><span>{new Date(r.checkedAt).toLocaleString()}</span><span>{r.status.replaceAll('-',' ')}</span></div>)}<p className="hint">No record in this view automatically certifies the entire research claim.</p>
 </div></Panel>;
 return <Resizable key={resetKey} resetKey={resetKey} id="lean" defaults={[27,43,30]}>{[left,middle,<ChatPanel key={project.id+'research'} project={project} role="research" workspace="lean" contextLabel="Lean Certificates" beforeSend={beforeSend} onArtifact={onArtifact}/>]}</Resizable>;
}
