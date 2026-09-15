// Normalize common LLM math delimiters without changing fenced/inline code.
export function normalizeMath(source = '', lineMap) {
  let fence = null;
  return String(source).split('\n').map((line,index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      if(lineMap)lineMap.push(index+1);return line;
    }
    if (fence) {if(lineMap)lineMap.push(index+1);return line;}
    const result=line.split(/(`+[^`]*`+)/g).map((part, i) => i % 2 ? part : part.replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/\\\[/g, () => '\n$$\n').replace(/\\\]/g, () => '\n$$\n')).join('');
    if(lineMap)lineMap.push(...result.split('\n').map(()=>index+1));return result;
  }).join('\n');
}
