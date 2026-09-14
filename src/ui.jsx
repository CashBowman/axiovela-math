import React from 'react';
import {citationMarkdown} from './citations.mjs';
import {normalizeMath} from './markdown-format.mjs';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export function Panel({title,label,action,children,className=''}){return <section className={`panel ${className}`}><header className="panelHead"><div>{label&&<span className="eyebrow">{label}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;}
export function Preview({source='',lean=false,hideLean=false,bibliography}){return <div className="markdown"><Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false,throwOnError:false}]]} components={{a:({node,...props})=><a {...props} target="_blank" rel="noreferrer"/>,img:({alt})=><span>[Figure: {alt||'image'}]</span>}}>{normalizeMath(lean?source.replace(/```[\s\S]*?```/g,'*Lean source is hidden here. The certificate panels show saved work and check results.*'):hideLean?source.replace(/```(?:lean|lean4)\s*\n[\s\S]*?```/gi,'*Lean source draft. Save it to see it in the certificate panels.*'):bibliography!==undefined?citationMarkdown(source,bibliography):source)}</Markdown></div>;}
export const download=(name,text,type='text/plain')=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
export async function request(url,options={}){const response=await fetch(url,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed.');return value;}
