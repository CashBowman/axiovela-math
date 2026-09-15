import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
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
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 24 * 1024 * 1024)
            res.destroy(Error("Source exceeds 24 MB."));
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
      15000,
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
    title: decodeURI(
      u.pathname.split("/").filter(Boolean).at(-1) || u.hostname,
    ).replace(/[-_]/g, " "),
    sourceUrl: url,
    sourceType: "web",
    notes: "",
    citationKey: "web" + idFor(url).slice(0, 8),
    read: false,
    addedAt: new Date().toISOString(),
  };
}
export function extractArticle(html) {
  const { document } = parseHTML(html);
  const article = new Readability(document).parse();
  if (!article) return { title: document.title || "", text: "" };
  const parsed = parseHTML(article.content).document;
  const blocks = [...parsed.querySelectorAll("h1,h2,h3,h4,p,li,pre")].filter(
    (n) => !n.parentElement?.closest("li,pre"),
  );
  const text = blocks
    .map((n) => n.textContent.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 100000);
  return {
    title: article.title || "",
    text,
    authors: article.byline ? [article.byline] : [],
  };
}
async function pdfTitle(file) {
  try {
    const {stdout}=await execute('pdfinfo',[file],{timeout:5000,maxBuffer:128000});
    const title=stdout.match(/^Title:\s+(.+)$/m)?.[1]?.trim();
    if(title)return {title,titleOrigin:'PDF metadata'};
  } catch {}
  try {
    const {stdout}=await execute('pdftotext',['-f','1','-l','1','-layout',file,'-'],{timeout:5000,maxBuffer:256000});
    const title=stdout.split('\n').map(s=>s.trim()).find(s=>s.length>12&&s.length<200&&!/^(arxiv:|https?:|\d|submitted|published|preprint)/i.test(s));
    if(title)return {title,titleOrigin:'first-page text'};
  } catch {}
  return {};
}

export async function importSource(input, data, fetcher = fetchSource) {
  const paper = bookmark(input);
  try {
    const response = await fetcher(paper.sourceUrl);
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
          ...await pdfTitle(file),
        },
        notice: "",
      };
    }
    const extracted = /html/i.test(response.type)
      ? extractArticle(response.bytes.toString("utf8"))
      : /text\/plain/i.test(response.type)
        ? { text: response.bytes.toString("utf8").slice(0, 100000) }
        : {};
    return {
      paper: {
        ...paper,
        ...extracted,
        title: extracted.title || paper.title,
        capturedAt: new Date().toISOString(),
      },
      notice: extracted.text
        ? ""
        : "Link saved. Open the original to read this source.",
    };
  } catch (e) {
    return { paper, notice: `Link saved. Preview unavailable: ${e.message}` };
  }
}
// Index app-owned project PDFs and explicit citations, never walk outside this project.
export async function discoverSources(root, data, project, conversations) {
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
        entry.name === p.id + ".pdf" ||
        p.localPath === file ||
        p.originalName === entry.name,
    );
    if (existing) continue;
    const stat = await fs.stat(file);
    if (stat.size > 24 * 1024 * 1024) continue;
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
      title: /^[a-f0-9-]{36}$/.test(stem)?'Imported PDF · '+stem.slice(0,8):stem,
      ...await pdfTitle(file),
      sourceType: "pdf",
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
          if (![...found.values()].some((x) => x.sourceUrl === p.sourceUrl))
            found.set(p.id, { ...p, discovered: true });
        } catch {}
      }
    }
  return [...found.values()].filter(
    (p) => !project.papers.some((x) => x.id === p.id),
  );
}
