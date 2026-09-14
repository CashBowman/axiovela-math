import {Cite} from '@citation-js/core';
import '@citation-js/plugin-bibtex';
// Render source keys without modifying the saved manuscript or code examples.
export function citationMarkdown(source,bibliography=''){
 let entries;try{entries=new Cite(bibliography).data;}catch{return source;}
 const byId=new Map(entries.map(e=>[String(e.id),e]));const used=new Map();let fence=null;
 const safe=value=>String(value||'').replace(/[\[\]*_<>\\]/g,'');
 const result=String(source).split('\n').map(line=>{const m=line.match(/^\s*(`{3,}|~{3,})/);if(m){if(!fence)fence=m[1][0];else if(fence===m[1][0])fence=null;return line;}if(fence)return line;return line.split(/(`+[^`]*`+)/g).map((part,i)=>i%2?part:part.replace(/\[@([^\]]+)\]/g,(_,keys)=>keys.split(';').map(k=>{const key=k.trim().replace(/^@/,'');if(!byId.has(key))return `[missing reference: ${safe(key)}]`;if(!used.has(key))used.set(key,used.size+1);return `[^bib-${used.get(key)}]`;}).join(', '))).join('');}).join('\n');
 return result+'\n\n'+[...used].map(([key,index])=>{const e=byId.get(key);const authors=(e.author||[]).map(a=>a.literal||[a.given,a.family].filter(Boolean).join(' ')).join(', ');const year=e.issued?.['date-parts']?.[0]?.[0]||'';return `[^bib-${index}]: ${safe(authors)}${year?' ('+year+')':''}. ${safe(e.title)}. ${safe(e['container-title'])}${e.DOI?' DOI: '+safe(e.DOI):''}`;}).join('\n');
}
