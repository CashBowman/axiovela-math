import test from "node:test";
import assert from "node:assert/strict";
import { arxivId } from "../shared/arxiv.mjs";
import { fetchPaper, metadata, metadataHtml } from "../server/arxiv.mjs";
const xml =
  "<feed><entry><id>http://arxiv.org/abs/2302.03660v2</id><title>Flow Matching &amp; Geometry</title><author><name>A. Author</name></author><summary>An abstract.</summary><published>2023-02-07T00:00:00Z</published></entry></feed>";
test("arXiv input normalization preserves explicit versions and legacy IDs", () => {
  for (const x of [
    "2302.03660",
    "arXiv:2302.03660",
    "https://arxiv.org/abs/2302.03660",
    "https://arxiv.org/pdf/2302.03660.pdf?download=1",
  ])
    assert.equal(arxivId(x), "2302.03660");
  assert.equal(
    arxivId("https://arxiv.org/pdf/math.GT/0309136v2"),
    "math.GT/0309136v2",
  );
  for (const x of [
    "https://example.com/abs/2302.03660",
    "https://arxiv.org.evil.test/pdf/2302.03660",
    "https://user@arxiv.org/pdf/2302.03660",
    "file:///etc/passwd",
    "2302.03660v0",
    "hello",
  ])
    assert.throws(() => arxivId(x));
});
test("metadata records provenance and rejects mismatched versions", () => {
  const p = metadata(xml, "2302.03660");
  assert.equal(p.arxivId, "2302.03660v2");
  assert.equal(p.title, "Flow Matching & Geometry");
  assert.deepEqual(p.authors, ["A. Author"]);
  assert.throws(() => metadata(xml, "2302.03660v1"));
  assert.throws(() => metadata("<feed/>", "2302.03660"));
});
test("import downloads the resolved version and checks PDF bytes", async () => {
  const urls = [];
  const result = await fetchPaper("2302.03660", {
    fetcher: async (url) => {
      urls.push(url);
      return new Response(url.includes("/api/") ? xml : "%PDF-fixture");
    },
  });
  assert.equal(result.pdf.toString(), "%PDF-fixture");
  assert.equal(urls[1], "https://arxiv.org/pdf/2302.03660v2");
  await assert.rejects(
    fetchPaper("2302.03660", {
      fetcher: async (url) =>
        new Response(url.includes("/api/") ? xml : "<html>blocked</html>"),
    }),
    /did not return a PDF/,
  );
});
test("remote errors and unsafe redirects fail before storing a paper", async () => {
  await assert.rejects(
    fetchPaper("2302.03660", {
      fetcher: async () => new Response("", { status: 429 }),
    }),
    /429/,
  );
  let calls = 0;
  await assert.rejects(
    fetchPaper("2302.03660", {
      fetcher: async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/private" },
        });
      },
    }),
    /unsupported destination/,
  );
  assert.equal(calls, 1);
});

test("API rate limits fall back to the canonical abstract-page metadata", async () => {
  const html =
    '<meta property="og:url" content="https://arxiv.org/abs/2302.03660v3"/><meta name="citation_title" content="Flow Matching"/><meta name="citation_author" content="Chen, Ricky"/><meta name="citation_date" content="2023/02/07"/>';
  const result = await fetchPaper("2302.03660", {
    fetcher: async (url) =>
      url.includes("/api/")
        ? new Response("", { status: 429 })
        : new Response(url.includes("/abs/") ? html : "%PDF-fixture"),
  });
  assert.equal(result.paper.arxivId, "2302.03660v3");
  assert.equal(result.paper.published, "2023-02-07");
  assert.throws(() => metadataHtml(html, "2302.03660v2"));
});
