import test from 'node:test';
import assert from 'node:assert/strict';
import {citationMarkdown} from '../src/citations.mjs';
test('publication citations resolve keys while preserving code examples',()=>{
 const bib='@article{known,title={A known result},author={Example, Ada},year={2026}}';
 const result=citationMarkdown('A theorem [@known]. Missing [@absent].\n\n```md\n[@known]\n```\n\n`[@known]`',bib);
 assert.match(result,/\[\^bib-1\]/);assert.match(result,/A known result/);assert.match(result,/missing reference: absent/);assert.ok(result.includes('```md\n[@known]\n```'));assert.ok(result.includes('`[@known]`'));
});
