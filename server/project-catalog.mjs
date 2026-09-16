// Axiovela project navigator adapted to Math's revisioned workspace (MIT).
// No folder discovery, project initialization, provider calls or scientific writes.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { containedProjectPath } from "./axiovela/project-paths.mjs";
const relations = new Set([
  "related-to",
  "extends",
  "supports",
  "contradicts",
  "uses",
  "tests",
  "motivates",
]);
const fail = (message) => {
  throw Error(message);
};
const text = (s, n = 1000) => String(s || "").slice(0, n);
const endpoint = (id) => `project:${id}`;
async function read(root, name, fallback) {
  const file = containedProjectPath(root, name);
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
      fail("Project metadata exceeds the supported size.");
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
export function exactSourceKeys(p) {
  const keys = new Set();
  const doi = (x) => {
    const s = String(x || "")
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .trim()
      .toLowerCase();
    if (/^10\.\d{4,9}\/\S+$/.test(s)) keys.add("doi:" + s);
  };
  const arxiv = (x) => {
    const s = String(x || "")
      .replace(/^arxiv:/i, "")
      .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i, "")
      .replace(/\.pdf$/i, "")
      .replace(/v\d+$/, "");
    if (/^(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})$/i.test(s))
      keys.add("arxiv:" + s.toLowerCase());
  };
  doi(p.doi);
  arxiv(p.arxivId);
  for (const value of [p.sourceUrl, p.url, ...(p.aliases || [])]) {
    try {
      const u = new URL(value);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        continue;
      if (/^(dx\.)?doi\.org$/.test(u.hostname)) {
        doi(decodeURIComponent(u.pathname.slice(1)));
        continue;
      }
      if (
        /^(www\.)?arxiv\.org$/.test(u.hostname) &&
        /^\/(abs|pdf)\//.test(u.pathname)
      ) {
        arxiv(u.origin + u.pathname);
        continue;
      }
      u.hash = "";
      for (const k of [...u.searchParams.keys()])
        if (/^utm_|^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
      u.searchParams.sort();
      keys.add("url:" + u.href);
    } catch {}
  }
  if (/^[a-f0-9]{64}$/i.test(p.contentHash || ""))
    keys.add("sha256:" + p.contentHash.toLowerCase());
  return [...keys];
}
export class ProjectCatalog {
  constructor(store, projects) {
    this.store = store;
    this.projects = projects;
    this.pdfHashes = new Map();
  }
  async snapshot({ details = false } = {}) {
    const state = await this.store.read(),
      result = {
        revision: state.revision,
        projects: [],
        items: [],
        links: [],
        warnings: [],
      };
    const sources = new Map();
    let experiments = 0,
      hashBytes = 0;
    for (const p of state.projects) {
      if (p.navigation?.hidden) continue;
      const folder = this.projects.location(p),
        entry = {
          id: p.id,
          name: p.name,
          root: folder,
          question: text(p.question),
          pinned: !!p.navigation?.pinned,
          lastOpened: p.navigation?.lastOpened || "",
          available: true,
        };
      try {
        entry.root = await fs.realpath(folder);
        if (!(await fs.stat(entry.root)).isDirectory())
          throw Error("Not a directory.");
      } catch {
        entry.available = false;
        entry.issue = "Folder unavailable";
      }
      result.projects.push(entry);
      if (!details || !entry.available) continue;
      result.items.push({
        key: endpoint(p.id),
        projectId: p.id,
        root: entry.root,
        kind: "project",
        label: p.name,
        detail: text(p.question),
        location: "Saved workspace project",
      });
      for (const paper of p.papers.slice(0, 1000)) {
        let metadata = paper;
        if (
          !paper.contentHash &&
          paper.sourceType !== "web" &&
          /^[a-zA-Z0-9-]{1,64}$/.test(paper.pdfId || paper.id)
        ) {
          try {
            const file = containedProjectPath(
                this.projects.data,
                `papers/${paper.pdfId || paper.id}.pdf`,
              ),
              stat = await fs.stat(file),
              cacheKey = file + ":" + stat.size + ":" + stat.mtimeMs;
            let contentHash = this.pdfHashes.get(cacheKey);
            if (
              !contentHash &&
              stat.isFile() &&
              stat.size <= 24 * 1024 * 1024 &&
              hashBytes + stat.size <= 128 * 1024 * 1024
            ) {
              hashBytes += stat.size;
              contentHash = createHash("sha256")
                .update(await fs.readFile(file))
                .digest("hex");
              if (this.pdfHashes.size >= 1000) this.pdfHashes.clear();
              this.pdfHashes.set(cacheKey, contentHash);
            }
            if (contentHash) metadata = { ...paper, contentHash };
            else
              result.warnings.push(
                `${p.name}: a PDF exceeds this view's bounded identity scan; its library record remains unchanged.`,
              );
          } catch (e) {
            if (e.code !== "ENOENT")
              result.warnings.push(
                `${p.name}: PDF identity unavailable (${e.message}).`,
              );
          }
        }
        for (const key of exactSourceKeys(metadata)) {
          if (!sources.has(key)) sources.set(key, new Map());
          sources.get(key).set(p.id, {
            title: text(paper.title, 240),
            location: `${p.name} / Library / ${paper.id}`,
          });
        }
      }
      if (p.papers.length > 1000)
        result.warnings.push(
          `${p.name}: only the first 1000 sources were indexed.`,
        );
      // Math experiments are immutable imported captures, never discovered runs.
      try {
        const rel = `bridge/${p.id}`,
          dir = containedProjectPath(this.projects.data, rel);
        const removed = await read(
          this.projects.data,
          `${rel}/removed.json`,
          {},
        );
        const batches = await fs
          .readdir(dir, { withFileTypes: true })
          .catch((e) => (e.code === "ENOENT" ? [] : Promise.reject(e)));
        let count = 0;
        for (const batch of batches
          .filter((b) => b.isDirectory() && /^[a-f0-9-]{36}$/.test(b.name))
          .slice(0, 200)) {
          const manifest = await read(
            this.projects.data,
            `${rel}/${batch.name}/manifest.json`,
            null,
          );
          if (!Array.isArray(manifest?.items))
            throw Error("Unreadable experiment capture.");
          for (const capture of manifest.items.slice(0, 200)) {
            if (removed[capture.id] || count >= 200 || experiments >= 300)
              continue;
            if (!/^[a-f0-9-]{36}$/.test(capture.id) || !capture.record)
              throw Error("Invalid experiment capture.");
            const runDirectory = `${batch.name}/${capture.id}`,
              key = `experiment:${p.id}:${encodeURIComponent(runDirectory)}`;
            result.items.push({
              key,
              projectId: p.id,
              root: entry.root,
              kind: "experiment",
              label: text(capture.record.name, 240),
              runId: capture.id,
              detail: text(capture.record.summary),
              location: `${rel}/${runDirectory}/record.json`,
            });
            result.links.push({
              id: `contains:${p.id}:${capture.id}`,
              from: endpoint(p.id),
              to: key,
              type: "contains",
              origin: "Recorded experiment membership",
              description:
                "This project contains a saved experiment capture. Its measurements are observations, not a mathematical certificate.",
              location: `${rel}/${batch.name}/manifest.json`,
            });
            count++;
            experiments++;
          }
        }
        if (count >= 200 || experiments >= 300 || batches.length > 200)
          result.warnings.push(
            `${p.name}: experiment view is bounded; other captures remain in the Library.`,
          );
      } catch (e) {
        result.warnings.push(`${p.name}: ${e.message}`);
      }
    }
    if (details) {
      const pairs = new Map();
      for (const [identity, projects] of sources) {
        const ids = [...projects.keys()].sort();
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++) {
            const key = ids[i] + ":" + ids[j];
            if (pairs.size >= 1000 && !pairs.has(key)) continue;
            if (!pairs.has(key))
              pairs.set(key, {
                id: "shared:" + key,
                from: endpoint(ids[i]),
                to: endpoint(ids[j]),
                type: "shares sources with",
                origin: "Exact source match",
                description:
                  "Both project libraries contain the same recorded source identity. This symmetric relationship does not assert agreement or proof.",
                evidence: [],
              });
            const link = pairs.get(key);
            if (link.evidence.length < 20)
              link.evidence.push(
                `${identity}: ${projects.get(ids[i]).location}; ${projects.get(ids[j]).location}`,
              );
          }
      }
      result.links.push(...pairs.values());
      if (pairs.size >= 1000)
        result.warnings.push(
          "Showing at most 1000 shared-source project connections.",
        );
      const keys = new Set(result.items.map((i) => i.key));
      let omitted = 0;
      for (const link of state.projectConnections || []) {
        if (keys.has(link.from) && keys.has(link.to))
          result.links.push({
            ...link,
            manual: true,
            origin: "User connection",
          });
        else omitted++;
      }
      if (omitted)
        result.warnings.push(
          `${omitted} saved connections have hidden or unavailable endpoints. They are retained.`,
        );
    }
    result.projects.sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.lastOpened.localeCompare(a.lastOpened) ||
        a.name.localeCompare(b.name),
    );
    return result;
  }
  async edit(body) {
    const state = await this.store.read();
    if (body.revision !== state.revision)
      throw Object.assign(
        Error("The workspace changed. Refresh before updating projects."),
        { status: 409 },
      );
    const next = structuredClone(state),
      p = next.projects.find((p) => p.id === body.id);
    if (["pin", "forget", "open", "locate"].includes(body.action)) {
      if (!p) fail("Unknown project.");
      p.navigation ||= {};
      if (body.action === "pin") p.navigation.pinned = body.pinned === true;
      if (body.action === "forget") p.navigation.hidden = true;
      if (body.action === "open") {
        const root = this.projects.location(p);
        if (!(await fs.stat(root)).isDirectory())
          fail("Folder unavailable. Locate it first.");
        p.navigation.hidden = false;
        p.navigation.lastOpened = new Date().toISOString();
      }
      if (body.action === "locate") {
        if (
          typeof body.path !== "string" ||
          !path.isAbsolute(body.path) ||
          body.path.includes("\0")
        )
          fail("Choose an existing absolute folder path.");
        const folder = await fs.realpath(body.path),
          manifest = await read(folder, "axiovela-math.project.json", null);
        if (manifest?.id !== p.id)
          fail(
            "This folder does not contain the selected Math project identity.",
          );
        for (const other of next.projects)
          if (
            other.id !== p.id &&
            (await fs
              .realpath(this.projects.location(other))
              .catch(() => null)) === folder
          )
            fail("This folder is already registered to another project.");
        // The revisioned workspace owns relocations; the original folder registry
        // remains a compatibility fallback. No files or records are moved.
        p.folder = folder;
      }
    } else if (body.action === "link") {
      if (
        !relations.has(body.type) ||
        typeof body.description !== "string" ||
        !body.description.trim() ||
        body.description.length > 4000
      )
        fail(
          "Choose a relationship and provide an explanation (up to 4000 characters).",
        );
      const keys = new Set(
        (await this.snapshot({ details: true })).items.map((i) => i.key),
      );
      if (body.from === body.to || !keys.has(body.from) || !keys.has(body.to))
        fail("Choose two available projects or experiments.");
      next.projectConnections ||= [];
      const old =
        body.id && next.projectConnections.find((l) => l.id === body.id);
      if (body.id && !old) fail("Unknown connection.");
      if (!old && next.projectConnections.length >= 1000)
        fail("The workspace supports up to 1000 manual connections.");
      const link = {
        id: old?.id || randomUUID(),
        from: body.from,
        to: body.to,
        type: body.type,
        description: body.description.trim(),
        origin: "user",
        updatedAt: new Date().toISOString(),
      };
      next.projectConnections = old
        ? next.projectConnections.map((l) => (l.id === old.id ? link : l))
        : [...next.projectConnections, link];
    } else if (body.action === "unlink") {
      if (!next.projectConnections?.some((l) => l.id === body.id))
        fail("Unknown connection.");
      next.projectConnections = next.projectConnections.filter(
        (l) => l.id !== body.id,
      );
    } else fail("Unknown project action.");
    return this.store.save(next, body.revision);
  }
}
