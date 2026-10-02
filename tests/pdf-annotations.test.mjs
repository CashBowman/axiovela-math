import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizedPdfRects, validPdfGeometry, pdfHighlightRects} from '../shared/pdf-annotations.mjs';
test('PDF rectangles survive zoom and are tied to their PDF revision',()=>{
 const a={page:2,pdfFingerprint:'revision-one',pdfRects:normalizedPdfRects([{left:20,top:40,width:60,height:20}],200,400)};
 assert.ok(validPdfGeometry(a));
 assert.deepEqual(pdfHighlightRects(a,400,800,'revision-one'),[{left:40,top:80,width:120,height:40}]);
 assert.deepEqual(pdfHighlightRects(a,400,800,'revision-two'),[]);
});
test('reject corrupt, oversized and out-of-page PDF geometry',()=>{
 const a={page:1,pdfFingerprint:'one',pdfRects:[[0,0,.1,.1]]};
 for(const pdfRects of [[[NaN,0,.1,.1]], [[0,0,-1,.1]], [[.9,0,.2,.1]], Array(257).fill([0,0,.1,.1]), []]) assert.equal(validPdfGeometry({...a,pdfRects}),false);
 assert.equal(validPdfGeometry({...a,page:0}),false);
 assert.equal(validPdfGeometry({...a,pdfFingerprint:''}),false);
 assert.deepEqual(normalizedPdfRects([{left:-10,top:0,width:30,height:20}],100,100),[[0,0,.2,.2]]);
 assert.deepEqual(pdfHighlightRects({page:1,start:0,end:3,quote:'old'},100,100,'one'),[]);
});
