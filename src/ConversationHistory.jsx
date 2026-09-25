import React, {useEffect, useRef, useState} from 'react';
import {request} from './ui.jsx';
import './conversation-history.css';
export default function ConversationHistory({project, onClose, onChanged}) {
  const dialog=useRef(), [query,setQuery]=useState(''),[archived,setArchived]=useState(false),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[result,setResult]=useState({conversations:[],warnings:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState(''),[title,setTitle]=useState('');
  useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>previous?.focus();},[]);
  useEffect(()=>{
    let canceled=false;setLoading(true);setError('');
    const timer=setTimeout(async()=>{
      try {const value=await request('/api/conversation-history?'+new URLSearchParams({project:project.id,q:query,archived:archived?'1':'0',offset:String(offset)}));if(!canceled)setResult(value);}
      catch(e){if(!canceled)setError(e.message);}
      finally{if(!canceled)setLoading(false);}
    },200);
    return()=>{canceled=true;clearTimeout(timer);};
  },[project.id,query,archived,offset,revision]);
  async function change(c,patch){try{await request('/api/conversation-history?project='+encodeURIComponent(c.projectId),{method:'PUT',body:JSON.stringify({id:c.id,...patch})});setEditing('');setRevision(x=>x+1);await onChanged();}catch(e){setError(e.message);}}
  async function open(c){try{
    await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('axiovela-open-conversation',{detail:{projectId:c.projectId,id:c.id,role:c.role,resolve,reject}})));
    onClose();
  }catch(e){setError(e.message);}}
  return <dialog ref={dialog} className="conversationHistory" aria-label="Conversation history" onCancel={onClose}>
    <div className="row"><h2>History</h2><button onClick={onClose} aria-label="Close conversation history">Close</button></div>
    <div className="historyFilters">
      <span className="hint">Current project: {project.name}</span>
      <label>Search<input autoFocus aria-label="Search conversations" placeholder="Titles and messages" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
      <label>Show<select aria-label="History visibility" value={archived?'archived':'active'} onChange={e=>{setArchived(e.target.value==='archived');setOffset(0);}}><option value="active">Active</option><option value="archived">Archived</option></select></label>
    </div>
    {error&&<p role="alert">{error}</p>}
    {result.warnings.map((w,i)=><p className="hint" key={i}>{w}</p>)}
    <div className="historyResults" aria-busy={loading}>
      {loading?<p role="status">Searching…</p>:result.conversations.length?result.conversations.map(c=><article className="historyCard" key={c.projectId+':'+c.id}>
        <button className="historyOpen" onClick={()=>open(c)}><strong>{c.pinned?'★ ':''}{c.title}</strong><small>{c.projectName} · {c.role==='writing'?'Write-up':'Research'} · {c.id.slice(-8)} · {c.lastActivity?new Date(c.lastActivity).toLocaleString():'Date unknown'}</small>{c.excerpt&&<span>{c.excerpt}</span>}</button>
        {editing===c.projectId+':'+c.id?<form onSubmit={e=>{e.preventDefault();change(c,{title});}}><input aria-label="Conversation title" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} autoFocus/><button type="submit">Save title</button><button type="button" onClick={()=>setEditing('')}>Cancel</button></form>:<div className="row"><button onClick={()=>{setEditing(c.projectId+':'+c.id);setTitle(c.title);}}>Rename</button><button onClick={()=>change(c,{pinned:!c.pinned})}>{c.pinned?'Unpin':'Pin'}</button><button onClick={()=>change(c,{archived:!c.archived})}>{c.archived?'Unarchive':'Archive'}</button></div>}
      </article>):<p>No matching conversations.</p>}
    </div>
    <div className="row historyPages"><span>{loading?'':`${result.total || 0} conversation${result.total===1?'':'s'}`}</span><button disabled={loading||!offset} onClick={()=>setOffset(Math.max(0,offset-30))}>Previous</button><button disabled={loading||result.nextOffset==null} onClick={()=>setOffset(result.nextOffset)}>Next</button></div>
  </dialog>;
}
