import { arxivId } from "../shared/arxiv.mjs";
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, x) =>
      x[0] === "#"
        ? String.fromCodePoint(
            x[1].toLowerCase() === "x"
              ? parseInt(x.slice(2), 16)
              : Number(x.slice(1)),
          )
        : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[x],
    )
    .replace(/\s+/g, " ")
    .trim();
const tag = (s, name) =>
  decode(
    s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ||
      "",
  );
export function metadata(xml, requested) {
  const entry = xml.match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) throw Error("No paper found for this arXiv ID.");
  const id = arxivId(tag(entry, "id"));
  if (
    id.replace(/v\d+$/, "") !== requested.replace(/v\d+$/, "") ||
    (/v\d+$/.test(requested) && id !== requested)
  )
    throw Error("arXiv returned a different paper version.");
  const title = tag(entry, "title");
  if (!title) throw Error("arXiv returned incomplete metadata.");
  return {
    arxivId: id,
    title,
    authors: [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) =>
      tag(m[1], "name"),
    ),
    abstract: tag(entry, "summary"),
    published: tag(entry, "published"),
    sourceUrl: `https://arxiv.org/abs/${id}`,
    pdfUrl: `https://arxiv.org/pdf/${id}`,
  };
}
export function metadataHtml(html, requested) {
  const fields = {};
  for (const match of html.matchAll(/<meta\s[^>]*>/gi)) {
    const attrs = Object.fromEntries(
      [...match[0].matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map((m) => [
        m[1],
        decode(m[2]),
      ]),
    );
    const key = attrs.name || attrs.property;
    if (key && attrs.content) (fields[key] ??= []).push(attrs.content);
  }
  const id = arxivId(fields["og:url"]?.[0] || "");
  if (
    id.replace(/v\d+$/, "") !== requested.replace(/v\d+$/, "") ||
    (/v\d+$/.test(requested) && id !== requested)
  )
    throw Error("arXiv returned a different paper version.");
  const title = fields.citation_title?.[0];
  if (!title || !fields.citation_author?.length)
    throw Error("arXiv returned incomplete metadata.");
  return {
    arxivId: id,
    title,
    authors: fields.citation_author,
    abstract: fields.citation_abstract?.[0] || "",
    published: (fields.citation_date?.[0] || "").replaceAll("/", "-"),
    sourceUrl: `https://arxiv.org/abs/${id}`,
    pdfUrl: `https://arxiv.org/pdf/${id}`,
  };
}
async function boundedFetch(url, max, fetcher) {
  for (let n = 0; n < 4; n++) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !["arxiv.org", "export.arxiv.org"].includes(parsed.hostname) ||
      parsed.port ||
      parsed.username ||
      parsed.password
    )
      throw Error("arXiv redirected to an unsupported destination.");
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(45000),
      redirect: "manual",
      headers: { "User-Agent": "AxiovelaMath/0.1 (paper import)" },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body?.cancel();
      url = new URL(r.headers.get("location"), url).href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      const error = Error(
        `arXiv is unavailable (${r.status}). Try again later or import a downloaded PDF.`,
      );
      error.fallback = r.status === 429 || r.status >= 500;
      throw error;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of r.body) {
      size += chunk.length;
      if (size > max) throw Error("This paper exceeds the 24 MB import limit.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw Error("Too many arXiv redirects.");
}
let lastRequest = 0;
export async function fetchPaper(input, { fetcher = fetch } = {}) {
  const id = arxivId(input);
  // arXiv asks clients to leave at least three seconds between API calls.
  if (fetcher === fetch) {
    if (Date.now() - lastRequest < 3000)
      throw Error("Please wait three seconds before another arXiv import.");
    lastRequest = Date.now();
  }
  let paper;
  try {
    const xml = await boundedFetch(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
      2 * 1024 * 1024,
      fetcher,
    );
    paper = metadata(xml.toString(), id);
  } catch (e) {
    if (!e.fallback && e.name !== "TimeoutError" && e.name !== "TypeError")
      throw e;
    const html = await boundedFetch(
      `https://arxiv.org/abs/${id}`,
      2 * 1024 * 1024,
      fetcher,
    );
    paper = metadataHtml(html.toString(), id);
  }
  const pdf = await boundedFetch(paper.pdfUrl, 24 * 1024 * 1024, fetcher);
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw Error(
      "arXiv did not return a PDF. Try again later or import a downloaded PDF.",
    );
  return { paper, pdf };
}
