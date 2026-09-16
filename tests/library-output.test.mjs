import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  outputDirectives,
  sourceForReference,
  proseDocument,
} from "../shared/assistant-output.mjs";
import { messageStream } from "../server/axiovela/message-stream.mjs";
import {
  bookmark,
  sourceUrl,
  publicAddress,
  importSource,
  discoverSources,
  extractArticle,
} from "../server/library-sources.mjs";
test("Codex message snapshots accumulate in order without repeating completed deltas", () => {
  const stream = messageStream();
  assert.equal(stream.delta("a", "First "), "First ");
  stream.delta("a", "message.");
  assert.equal(stream.complete("a", "First message."), "First message.");
  stream.delta("b", "Next");
  assert.equal(
    stream.complete("b", "Next response."),
    "First message.\n\nNext response.",
  );
  assert.equal(
    stream.complete("b", "Next response."),
    "First message.\n\nNext response.",
  );
});
test("citation and follow-up directives become data, including escaped path underscores", () => {
  const d = outputDirectives(
    'Read :codex-file-citation{path="/project\\_one/papers/a.pdf" purpose="source"}.\n- :codex-followup[Develop lemma]{prompt="Prove \\"the lemma\\" with care."}'.replaceAll(
      '\\\\"',
      '\\"',
    ),
  );
  assert.equal(d.references[0].path, "/project_one/papers/a.pdf");
  assert.equal(d.followups[0].prompt, 'Prove "the lemma" with care.');
  assert.ok(!d.text.includes(":codex-"));
  assert.equal(
    sourceForReference(d.references[0], [{ id: "a", title: "Known title" }])
      .title,
    "Known title",
  );
});
test("only full Markdown document wrappers are unwrapped", () => {
  assert.equal(
    proseDocument("```markdown\n# Title\n\n**Result**\n```"),
    "# Title\n\n**Result**",
  );
  assert.equal(
    proseDocument("Example:\n```md\n# Title\n```"),
    "Example:\n```md\n# Title\n```",
  );
  assert.equal(
    proseDocument("```lean\ntheorem x\n```"),
    "```lean\ntheorem x\n```",
  );
});
test("web bookmarks canonicalize fragments and reject credential/nonweb URLs", () => {
  assert.equal(
    bookmark("https://example.org/blog/my-note#part").id,
    bookmark("https://example.org/blog/my-note").id,
  );
  assert.throws(() => sourceUrl("file:///private"));
  assert.throws(() => sourceUrl("https://user:pass@example.org"));
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("93.184.216.34"), true);
});
test("web extraction strips executable content and retains paragraphs; failed fetch still saves the link", async () => {
  const html =
    "<html><head><title>A mathematical note</title></head><body><article><h1>A mathematical note</h1>" +
    Array.from(
      { length: 8 },
      (_, i) =>
        `<p>Paragraph ${i}. This is a substantive research explanation with assumptions and evidence, written for a mathematical reader.</p>`,
    ).join("") +
    '<script>alert("unsafe")</script></article></body></html>';
  const article = extractArticle(html);
  assert.equal(article.title, "A mathematical note");
  assert.match(article.text, /Paragraph 0/);
  assert.ok(!article.text.includes("alert("));
  const captured = await importSource(
    "https://example.org/note",
    "/unused",
    async () => ({ bytes: Buffer.from(html), type: "text/html" }),
  );
  assert.ok(captured.paper.text);
  assert.equal(captured.paper.sourceType, "web");
  const unavailable = await importSource(
    "https://example.org/private",
    "/unused",
    async () => {
      throw Error("HTTP 403");
    },
  );
  assert.equal(unavailable.paper.sourceUrl, "https://example.org/private");
  assert.match(unavailable.notice, /Link saved/);
});
test("automatic source discovery stays within the project and deduplicates known PDFs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-sources-")),
    data = path.join(root, "app");
  try {
    await fs.mkdir(path.join(root, "papers"));
    await fs.writeFile(path.join(root, "papers", "note.pdf"), "%PDF-fixture");
    await fs.writeFile(path.join(root, "secret.pdf"), "%PDF-private");
    await fs.symlink(
      path.join(root, "secret.pdf"),
      path.join(root, "papers", "symlink.pdf"),
    );
    const first = await discoverSources(root, data, { papers: [] }, [
      { turns: [{ output: "[A blog](https://example.org/note)" }] },
    ],async()=>{throw Error('fixture unavailable');});
    assert.equal(first.length, 2);
    assert.ok(!first.some((p) => p.originalName === "symlink.pdf"));
    const second = await discoverSources(root, data, { papers: first }, []);
    assert.ok(second.every(p=>first.some(x=>x.id===p.id)&&p.previewError));
    const enriched={papers:first.map(p=>second.find(x=>x.id===p.id)||p)};
    assert.deepEqual(await discoverSources(root,data,enriched,[]),[]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("generic source bibliography stays minimal and duplicate imports preserve notes", async () => {
  const { addLibrarySources } = await import("../shared/library.mjs");
  const original = { papers: [], bibliography: "" },
    web = bookmark("https://example.org/math");
  web.title = "A & B";
  const patch = addLibrarySources(original, [web]);
  assert.match(patch.bibliography, /A \\& B/);
  assert.ok(!patch.bibliography.includes("author ="));
  assert.ok(!patch.bibliography.includes("year ="));
  patch.papers[0].notes = "My interpretation";
  assert.deepEqual(addLibrarySources(patch, [web]), {});
});

test('PDF metadata labels are never publication titles and URL tracking does not create duplicates', async () => {
 const {readableTitle}=await import('../server/article-content.mjs');
 const {addLibrarySources}=await import('../shared/library.mjs');
 assert.equal(readableTitle('Subject:'),'');assert.equal(readableTitle('Title: Subject:'),'');
 const original={papers:[{id:'first',title:'A useful source',sourceUrl:'https://example.org/paper?utm_source=chat',notes:'keep notes',read:true}],bibliography:''};
 const patch=addLibrarySources(original,[{id:'second',title:'A useful source',sourceUrl:'https://example.org/paper',notes:'extra notes'}]);
 assert.equal(patch.papers.length,1);assert.match(patch.papers[0].notes,/keep notes/);assert.match(patch.papers[0].notes,/extra notes/);assert.equal(patch.papers[0].read,true);
});
test('enrichment bridges a saved URL and duplicate PDF without losing links or the PDF', async () => {
 const {addLibrarySources}=await import('../shared/library.mjs');
 const original={papers:[{id:'web',title:'Source from example.org',sourceType:'web',sourceUrl:'https://example.org/a',notes:'web notes'},{id:'pdf',title:'Subject:',sourceType:'pdf',contentHash:'same-bytes',notes:'PDF notes'}],links:[{from:'paper:pdf',to:'idea:x',type:'uses'}],bibliography:''};
 const patch=addLibrarySources(original,[{id:'web',title:'The actual title of a mathematical paper',sourceType:'pdf',contentHash:'same-bytes',contentVersion:4,capturedAt:'now'}]);
 assert.equal(patch.papers.length,1);assert.equal(patch.papers[0].title,'The actual title of a mathematical paper');assert.match(patch.papers[0].notes,/PDF notes/);assert.equal(patch.links[0].from,'paper:web');assert.ok(patch.sourceMergeHistory.length);
});

test('empty PDF Title field cannot consume the following Subject field', async () => {
 const {pdfMetadataTitle}=await import('../server/library-sources.mjs');
 assert.equal(pdfMetadataTitle('Title:          \nSubject:        \nAuthor: Name'), '');
 assert.equal(pdfMetadataTitle('Title: Real paper title\r\nSubject: topic'), 'Real paper title');
});

test('background source metadata cannot replace a newer manual refresh', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'library-refresh-order-')),data=path.join(root,'data');
 try {
  const p=bookmark('https://example.org/background-order');
  const fetcher=async()=>({type:'text/html',bytes:Buffer.from('<html><head><title>A real background article</title></head><body><article><p>Saved background text.</p></article></body></html>')});
  await discoverSources(root,data,{papers:[p]},[],fetcher);
  let enriched;
  for(let i=0;i<50&&!enriched;i++){await new Promise(r=>setTimeout(r,10));enriched=(await discoverSources(root,data,{papers:[p]},[],fetcher))[0];}
  assert.ok(enriched);
  const newer={...enriched,text:'Newer manually refreshed content',capturedAt:new Date(Date.now()+60000).toISOString()};
  assert.deepEqual(await discoverSources(root,data,{papers:[newer]},[],fetcher),[]);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
