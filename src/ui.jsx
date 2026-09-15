import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Maximize2,Minimize2} from 'lucide-react';
import {citationMarkdown} from './citations.mjs';
import {normalizeMath} from './markdown-format.mjs';
import Markdown,{defaultUrlTransform} from 'react-markdown';
import {outputDirectives,sourceForReference,proseDocument} from '../shared/assistant-output.mjs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export function Panel({title,label,action,children,className='',expandable=false,expandLabel='reader',restoreKey}){
 const [expanded,setExpanded]=useState(false),button=useRef(),root=useRef();
 useEffect(()=>setExpanded(false),[restoreKey]);
 useEffect(()=>{if(!expanded)return;const previous=document.activeElement;button.current?.focus();const escape=e=>{if(e.key==='Escape'){setExpanded(false);previous?.focus();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[expanded]);
 return <section ref={root} className={`panel ${className} ${expanded?'expandedPanel':''}`} onKeyDown={e=>{if(!expanded||e.key!=='Tab')return;const nodes=[...root.current.querySelectorAll('button,a,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!nodes.length)return;if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}}><header className="panelHead"><div>{label&&<span className="eyebrow">{label}</span>}<h2>{title}</h2></div><div className="panelActions">{action}{expandable&&<button ref={button} className="icon" aria-label={`${expanded?'Restore':'Expand'} ${expandLabel}`} title={expanded?'Restore panel (Esc)':'Expand panel'} onClick={()=>{setExpanded(x=>!x);root.current.dispatchEvent(new CustomEvent('math-panel-expand',{detail:!expanded}));}}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>}</div></header>{children}</section>;
}
export function Preview({source='',lean=false,hideLean=false,bibliography,imageUrl,sourceLocations=false,onSourceLine,sources=[],onFollowup,prose=false}){
 source=prose?proseDocument(source):source;
 const directives=outputDirectives(source);
 source=directives.text;
 const input=lean?source.replace(/```[\s\S]*?```/g,'*Lean source is hidden here. The certificate panels show saved work and check results.*'):hideLean?source.replace(/```(?:lean|lean4)\s*\n[\s\S]*?```/gi,'*Lean source draft. Save it to see it in the certificate panels.*'):bibliography!==undefined?citationMarkdown(source,bibliography):source;
 const lineMap=[],rendered=normalizeMath(input,lineMap),maxLine=source.split('\n').length;
 const blocks=useMemo(()=>sourceLocations?Object.fromEntries(['p','h1','h2','h3','h4','li','blockquote','pre','table','div'].map(tag=>[tag,({node,...props})=>{const line=lineMap[(node?.position?.start.line||0)-1];return React.createElement(tag,{...props,...(line&&line<=maxLine?{'data-source-line':line,onDoubleClick:e=>{e.preventDefault();e.stopPropagation();onSourceLine?.(line);}}:{})});}])):{},[source,bibliography,sourceLocations,onSourceLine]);
 return <div className="markdown"><Markdown urlTransform={url=>/^axiovela-(source|followup):\d+$/.test(url)?url:defaultUrlTransform(url)} remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false,throwOnError:false}]]} components={{...blocks,a:({node,...props})=>{
 if(props.href?.startsWith('axiovela-followup:')){const f=directives.followups[Number(props.href.split(':')[1])];return f&&onFollowup?<button className="followupChip" title="Add to your message, without sending" onClick={()=>onFollowup(f.prompt)}>{f.label}</button>:<span>{f?.label}</span>;}
 if(props.href?.startsWith('axiovela-source:')){const r=directives.references[Number(props.href.split(':')[1])],p=r&&sourceForReference(r,sources);return p?<button className="sourceCitation" title={p.title} onClick={()=>window.dispatchEvent(new CustomEvent('math-open-source',{detail:p.id}))}>{p.title}</button>:<span className="unresolvedSource" title={r?.path}>{r?.path.split('/').at(-1)||'Source'} (not yet indexed)</span>;}
 let href=props.href||'';try{href=decodeURI(href);}catch{}
 const linkedSource=sourceForReference({path:href},sources);
 if(linkedSource)return <button className="sourceCitation" title={linkedSource.title} onClick={()=>window.dispatchEvent(new CustomEvent('math-open-source',{detail:linkedSource.id}))}>{linkedSource.title}</button>;
 return <a {...props} target="_blank" rel="noreferrer"/>;
 },img:({alt,src})=>imageUrl?.(src)?<img src={imageUrl(src)} alt={alt||''} loading="lazy"/>:<span>[Figure: {alt||'image'}]</span>}}>{rendered}</Markdown></div>;
}
export const download=(name,text,type='text/plain')=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
export async function request(url,options={}){const response=await fetch(url,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed.');return value;}
