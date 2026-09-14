import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {compileLatex} from '../server/checks.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-math-tex-'));process.env.TECTONIC_CACHE_DIR=path.join(dir,'cache');
try{const r=await compileLatex(dir,'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nPublication fixture: $x^2 \\geq 0$.\n\\end{document}\n');const pdf=await fs.readFile(path.join(dir,'exports',r.id,'main.pdf'));if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Compiler did not produce a PDF.');await fs.mkdir('.local/qa',{recursive:true});await fs.copyFile(path.join(dir,'exports',r.id,'main.pdf'),'.local/qa/latex-fixture.pdf');await fs.writeFile('docs/latex-validation.json',JSON.stringify({engine:'bundled Tectonic 0.17.0 linux-x64',compiled:true,bytes:pdf.length,checkedAt:new Date().toISOString()},null,2)+'\n');console.log('Actual LaTeX to PDF compilation passed.');}finally{await fs.rm(dir,{recursive:true,force:true});}
