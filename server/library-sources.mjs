import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  extractArticle,
  readableTitle,
  CONTENT_VERSION,
} from "./article-content.mjs";
export { extractArticle } from "./article-content.mjs";
import { outputDirectives } from "../shared/assistant-output.mjs";
import { projectFile } from "./axiovela/assistant-api.mjs";
const execute = promisify(execFile);
const idFor = (value) => {
  const s = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
export function sourceUrl(input) {
  const url = new URL(input.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("Paste an HTTP or HTTPS link without embedded credentials.");
  url.hash = "";
  return url.href;
}
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address); // Global unicast only; excludes mapped IPv4 and local scopes.
}
export async function fetchSource(input, redirects = 0) {
  if (redirects > 4) throw Error("Too many redirects.");
  const url = new URL(sourceUrl(input));
  const addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error(
      "Local network addresses cannot be fetched as research sources.",
    );
  const address = addresses[0];
  // Pin this request to the checked DNS answer, including after redirects.
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        lookup: (_h, opts, cb) =>
          opts.all
            ? cb(null, [address])
            : cb(null, address.address, address.family),
        headers: {
          "User-Agent": "Axiovela-Math/0.1 (+research-library)",
          Accept: "text/html,application/pdf,text/plain",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          resolve(
            fetchSource(new URL(res.headers.location, url).href, redirects + 1),
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            Error(
              `The site returned HTTP ${res.statusCode}. The original link is still saved.`,
            ),
          );
          return;
        }
        let size = 0,
          limit = 24 * 1024 * 1024;
        if (/pdf/i.test(res.headers["content-type"] || ""))
          limit = 128 * 1024 * 1024;
        const chunks = [];
        res.on("data", (chunk) => {
          if (!size && chunk.subarray(0, 5).toString() === "%PDF-")
            limit = 128 * 1024 * 1024;
          size += chunk.length;
          if (size > limit)
            res.destroy(Error(`Source exceeds ${limit / 1024 / 1024} MB.`));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            type: res.headers["content-type"] || "",
            url: url.href,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error("The site took too long to respond.")),
      45000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}
export function bookmark(input) {
  const url = sourceUrl(input),
    u = new URL(url);
  return {
    id: idFor(url),
    title: "Source from " + u.hostname,
    sourceUrl: url,
    sourceType: "web",
    notes: "",
    citationKey: "web" + idFor(url).slice(0, 8),
    read: false,
    addedAt: new Date().toISOString(),
  };
}
export function pdfMetadataTitle(output) {
  return readableTitle(output.match(/^Title:[ \t]*([^\r\n]*)$/m)?.[1]?.trim());
}
export async function pdfTitle(file) {
  try {
    const { stdout } = await execute("pdfinfo", [file], {
      timeout: 5000,
      maxBuffer: 128000,
    });
    const title = pdfMetadataTitle(stdout);
    if (readableTitle(title)) return { title, titleOrigin: "PDF metadata" };
  } catch {}
  try {
    const { stdout } = await execute(
      "pdftotext",
      ["-f", "1", "-l", "1", "-raw", file, "-"],
      { timeout: 5000, maxBuffer: 256000 },
    );
    const lines = stdout.split("\n").map(s => s.trim());
    const index = lines.findIndex(s => readableTitle(s) && s.length > 12 && s.length < 200 &&
      !/^(arxiv:|https?:|\d|submitted|published|preprint|proceedings|journal|physical review|copyright)/i.test(s));
    let title = lines[index] || '';
    // Small-cap conference titles often span multiple consecutive uppercase lines.
    for (let i = index + 1; index >= 0 && i < Math.min(index + 4, lines.length); i++) {
      if (!/^[A-Z][A-Z\s\-–—,:()]+$/.test(title) || !/^[A-Z][A-Z\s\-–—,:()]+$/.test(lines[i]) || /^(ABSTRACT|INTRODUCTION)$/.test(lines[i])) break;
      title += ' ' + lines[i];
    }
    if (title && title !== title.toUpperCase()) {
      const {stdout: layout} = await execute('pdftotext', ['-f', '1', '-l', '1', '-layout', file, '-'], {timeout: 5000, maxBuffer: 256000});
      const rows = layout.split('\n').map(s => s.trim());
      const compact = s => s.replace(/\s/g, '');
      const start = rows.findIndex(s => compact(s) === compact(title));
      if (start >= 0) {
        const block = [rows[start]];
        for (let i = start + 1; i < Math.min(start + 4, rows.length) && rows[i]; i++) {
          if (/[@*†‡]|\d|^(abstract|introduction|department|university)\b/i.test(rows[i])) break;
          block.push(rows[i]);
        }
        title = block.join(' ');
      }
    }
    if (readableTitle(title)) return { title, titleOrigin: "first-page text" };
  } catch {}
  return {};
}

export async function importSource(
  input,
  data,
  fetcher = fetchSource,
  sourceId,
) {
  const paper = { ...bookmark(input), previewError: null };
  if (sourceId) paper.id = sourceId;
  try {
    let response = await fetcher(paper.sourceUrl);
    let extracted = {};
    if (/html/i.test(response.type)) {
      extracted = extractArticle(
        response.bytes.toString("utf8"),
        response.url || paper.sourceUrl,
      );
      if (extracted.pdfUrl) {
        try {
          const pdf = await fetcher(extracted.pdfUrl);
          if (pdf.bytes.subarray(0, 5).toString() === "%PDF-") response = pdf;
          else
            extracted.attachmentError =
              "The linked PDF did not return a PDF document.";
        } catch (e) {
          extracted.attachmentError = e.message;
        } // Keep the readable abstract if the attachment is unavailable.
      }
    }
    if (response.bytes.subarray(0, 5).toString() === "%PDF-") {
      const file = path.join(data, "papers", paper.id + ".pdf");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, response.bytes, { flag: "wx" }).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
      return {
        paper: {
          ...paper,
          sourceType: "pdf",
          contentHash: createHash("sha256")
            .update(response.bytes)
            .digest("hex"),
          ...(await pdfTitle(file)),
          ...(extracted.title
            ? { title: extracted.title, titleOrigin: "publication metadata" }
            : {}),
          ...(extracted.authors?.length ? { authors: extracted.authors } : {}),
          contentVersion: CONTENT_VERSION,
          capturedAt: new Date().toISOString(),
        },
        notice: "",
      };
    }
    extracted = /html/i.test(response.type)
      ? extracted
      : /text\/plain/i.test(response.type)
        ? {
            text: response.bytes.toString("utf8").slice(0, 100000),
            contentVersion: CONTENT_VERSION,
          }
        : {};
    return {
      paper: {
        ...paper,
        ...extracted,
        title: extracted.title || paper.title,
        capturedAt: new Date().toISOString(),
        contentVersion: CONTENT_VERSION,
        previewError: extracted.text
          ? null
          : "This site did not provide readable article text.",
      },
      notice: extracted.text
        ? ""
        : "Link saved. Open the original to read this source.",
    };
  } catch (e) {
    return {
      paper: {
        ...paper,
        contentVersion: CONTENT_VERSION,
        capturedAt: new Date().toISOString(),
        previewError: e.message,
      },
      notice: `Link saved. Preview unavailable: ${e.message}`,
    };
  }
}
// Index app-owned project PDFs and explicit citations, never walk outside this project.
export async function discoverSources(
  root,
  data,
  project,
  conversations,
  fetcher = fetchSource,
) {
  const found = new Map(project.papers.map((p) => [p.id, p]));
  const paperDirectory = await projectFile(root, "papers", true);
  const entries = await fs
    .readdir(paperDirectory, { withFileTypes: true })
    .catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    });
  for (const entry of entries
    .filter((e) => e.isFile() && /\.pdf$/i.test(e.name))
    .slice(0, 500)) {
    const file = await projectFile(root, "papers/" + entry.name);
    const existing = project.papers.find(
      (p) =>
        (p.aliases || []).some(
          (a) => a === file || a === entry.name || a + ".pdf" === entry.name,
        ) ||
        entry.name === p.id + ".pdf" ||
        p.localPath === file ||
        p.originalName === entry.name,
    );
    if (existing) continue;
    const stat = await fs.stat(file);
    if (stat.size > 128 * 1024 * 1024) continue;
    const bytes = await fs.readFile(file);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") continue;
    const stem = entry.name.replace(/\.pdf$/i, "");
    const id = /^[a-f0-9-]{36}$/.test(stem)
      ? stem
      : idFor(root + "/" + entry.name);
    await fs.mkdir(path.join(data, "papers"), { recursive: true });
    await fs
      .writeFile(path.join(data, "papers", id + ".pdf"), bytes, { flag: "wx" })
      .catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
    found.set(id, {
      id,
      title: /^[a-f0-9-]{36}$/.test(stem)
        ? "Imported PDF · " + stem.slice(0, 8)
        : stem,
      ...(await pdfTitle(file)),
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      sourceType: "pdf",
      contentVersion: CONTENT_VERSION,
      capturedAt: new Date().toISOString(),
      localPath: file,
      originalName: entry.name,
      notes: "",
      citationKey: "source" + id.slice(0, 8),
      read: false,
      discovered: true,
    });
  }
  for (const c of conversations)
    for (const t of c.turns) {
      const refs = outputDirectives(t.output || "").references.map(
        (r) => r.path,
      );
      // Ordinary explicitly cited Markdown links are sources too, excluding app artifacts.
      for (const match of (t.output || "").matchAll(
        /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g,
      ))
        refs.push(match[1]);
      for (const ref of refs) {
        if (!/^https?:\/\//i.test(ref)) continue;
        try {
          const p = bookmark(ref);
          if (
            ![...found.values()].some(
              (x) =>
                x.sourceUrl === p.sourceUrl || x.aliases?.includes(p.sourceUrl),
            )
          )
            found.set(p.id, { ...p, discovered: true });
        } catch {}
      }
    }
  // Start bounded enrichment jobs without holding document refresh or a chat open.
  for (const p of found.values())
    if (
      (p.sourceType === "web" ? p.sourceUrl : true) &&
      (p.contentVersion !== CONTENT_VERSION ||
        (p.previewError && Date.now() - Date.parse(p.capturedAt || 0) > 300000))
    )
      scheduleImport(p, data, fetcher);
  const result = [];
  for (const p of found.values()) {
    const ready = imports.get(data + "\0" + p.id)?.result;
    if (
      ready &&
      (ready.contentVersion > (p.contentVersion || 0) ||
        (ready.contentVersion === p.contentVersion && Date.parse(ready.capturedAt) > Date.parse(p.capturedAt || 0)))
    )
      result.push({ ...p, ...ready, id: p.id, discovered: p.discovered });
    else if (!project.papers.some((x) => x.id === p.id)) result.push(p);
  }
  return result;
}
const imports = new Map(),
  waiting = [];
let importing = 0;
function scheduleImport(p, data, fetcher) {
  const key = data + "\0" + p.id,
    previous = imports.get(key);
  if (previous && (Date.now() - previous.at < 300000 || (previous.result && !previous.result.previewError)))
    return;
  const job = { at: Date.now() };
  imports.set(key, job);
  waiting.push(async () => {
    if (p.sourceType === 'web') {
      const { paper } = await importSource(p.sourceUrl, data, fetcher, p.id);
      job.result = paper;
    } else {
      const file = path.join(data, 'papers', (p.pdfId || p.id) + '.pdf');
      const bytes = await fs.readFile(file);
      const metadata = await pdfTitle(file);
      job.result = {...p, ...(!p.titleEdited && !readableTitle(p.title) ? metadata : {}),
        title: p.titleEdited || readableTitle(p.title) ? p.title : metadata.title || 'PDF title unavailable',
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        contentVersion: CONTENT_VERSION, capturedAt: new Date().toISOString()};
    }
  });
  drainImports();
}
function drainImports() {
  while (importing < 3 && waiting.length) {
    importing++;
    waiting
      .shift()()
      .catch(() => {})
      .finally(() => {
        importing--;
        drainImports();
      });
  }
}

const imageJobs = new Map();
export async function sourceImage(paper, input, data, fetcher = fetchSource) {
  const url = sourceUrl(input || "");
  if (!paper?.text?.includes("](" + url + ")"))
    throw Error("Image is not part of this saved source.");
  const key = idFor(url),
    file = path.join(data, "source-images", key);
  function type(bytes) {
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return "image/png";
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      return "image/jpeg";
    if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return "image/gif";
    if (
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP"
    )
      return "image/webp";
    throw Error("This figure is not a supported raster image.");
  }
  try {
    const bytes = await fs.readFile(file);
    return { bytes, type: type(bytes) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!imageJobs.has(file))
    imageJobs.set(
      file,
      (async () => {
        const { bytes } = await fetcher(url);
        if (bytes.length > 16 * 1024 * 1024)
          throw Error("Figure exceeds 16 MB.");
        const mime = type(bytes);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes);
        return { bytes, type: mime };
      })().finally(() => imageJobs.delete(file)),
    );
  return imageJobs.get(file);
}
