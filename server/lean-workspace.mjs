import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { projectFile } from "./axiovela/assistant-api.mjs";
import { inspectLean } from "./checks.mjs";
import { LeanSetup } from "./lean-setup.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
export function leanDraft(output = "") {
  const blocks = [...output.matchAll(/```(?:lean|lean4)\s*\n([\s\S]*?)```/gi)];
  return blocks.length === 1 ? blocks[0][1] : null;
}
export async function leanSnapshot(root) {
  const values = {},
    files = [];
  async function walk(relative) {
    const directory = await projectFile(root, relative, true);
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const relativeFile = relative + "/" + entry.name;
      if (entry.isDirectory()) {
        if (relative.split("/").length < 8) await walk(relativeFile);
        continue;
      }
      if (
        !entry.isFile() ||
        !(
          entry.name.endsWith(".lean") ||
          [
            "lean-toolchain",
            "lake-manifest.json",
            "lakefile.toml",
            "certificate.json",
            "summary.md",
          ].includes(entry.name)
        )
      )
        continue;
      if (files.length >= 300)
        throw Error(
          "The certificate project has too many source files to inspect.",
        );
      const file = await projectFile(root, relativeFile);
      const info = await fs.stat(file);
      if (info.size > 1024 * 1024)
        throw Error("A certificate source file exceeds the inspection limit.");
      const text = await fs.readFile(file, "utf8");
      values[relativeFile.slice(13)] = text;
      files.push({ path: relativeFile.slice(13), hash: hash(text) });
    }
  }
  await walk("certificates");
  let plan = null,
    planError = "";
  if (values["certificate.json"])
    try {
      const raw = JSON.parse(values["certificate.json"]);
      const text = (v, max = 12000) =>
        typeof v === "string" ? v.slice(0, max) : "";
      plan = {
        title: text(raw.title, 300),
        statement: text(raw.statement),
        scopeNotes: text(raw.scopeNotes),
        declarations: Array.isArray(raw.declarations)
          ? raw.declarations.filter((v) => typeof v === "string").slice(0, 100)
          : [],
        assumptions: Array.isArray(raw.assumptions)
          ? raw.assumptions.filter((v) => typeof v === "string").slice(0, 100)
          : [],
        obligations: Array.isArray(raw.obligations)
          ? raw.obligations
              .map((v) =>
                typeof v === "string" ? v : text(v?.description || v?.label),
              )
              .filter(Boolean)
              .slice(0, 100)
          : [],
      };
      plan.results = (Array.isArray(raw.results) ? raw.results : [])
        .slice(0, 300)
        .filter(
          (r) =>
            r &&
            typeof r.ref === "string" &&
            /^(?:idea|claim):[\w-]{1,64}$/.test(r.ref),
        )
        .map((r) => ({
          ref: r.ref,
          declarations: Array.isArray(r.declarations)
            ? r.declarations
                .filter((v) => typeof v === "string")
                .map((v) => v.slice(0, 300))
                .slice(0, 100)
            : [],
          assumptions: Array.isArray(r.assumptions)
            ? r.assumptions
                .filter((v) => typeof v === "string")
                .map((v) => text(v))
                .slice(0, 100)
            : [],
          obligations: Array.isArray(r.obligations)
            ? r.obligations
                .filter((v) => typeof v === "string")
                .map((v) => text(v))
                .slice(0, 100)
            : [],
          scopeNotes: text(r.scopeNotes),
        }));
    } catch {
      planError =
        "The assistant’s formalization notes could not be read. Ask it to repair the saved notes.";
    }
  return {
    snapshotHash: files.length ? hash(JSON.stringify(files)) : null,
    sourceHash:
      values["Main.lean"] === undefined ? null : hash(values["Main.lean"]),
    files,
    plan,
    planError,
    summary: values["summary.md"] || "",
    toolchain: values["lean-toolchain"]?.trim() || "",
    hasManifest: values["lake-manifest.json"] !== undefined,
  };
}
export async function lakeLocation() {
  const candidates = process.env.AXIOVELA_LAKE_PATH
    ? [process.env.AXIOVELA_LAKE_PATH]
    : [
        ...new Set([
          path.join(
            process.env.ELAN_HOME || path.join(os.homedir(), ".elan"),
            "bin", process.platform === "win32" ? "lake.exe" : "lake",
          ),
          ...(process.env.PATH || "")
            .split(path.delimiter)
            .filter(Boolean)
            .map((dir) => path.join(dir, process.platform === "win32" ? "lake.exe" : "lake")),
        ]),
      ];
  for (const executable of candidates)
    try {
      await fs.access(executable, fs.constants.X_OK);
      return executable;
    } catch {}
  return null;
}
export class LeanWorkspace {
  constructor(data, projects) {
    this.data = data;
    this.projects = projects;
    this.active = new Map();
    this.saving = new Set();
    this.setup = new LeanSetup(data, projects);
  }
  async snapshot(id) {
    return leanSnapshot(await this.projects.root(id));
  }
  async read(id) {
    const snapshot = await this.snapshot(id),
      dir = path.join(this.data, "verification", id);
    let records = [];
    try {
      for (const file of await fs.readdir(dir))
        if (/^[a-f0-9-]+\.json$/.test(file))
          records.push(
            JSON.parse(await fs.readFile(path.join(dir, file), "utf8")),
          );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    records.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
    return {
      ...snapshot,
      setup: await this.setup.status(id),
      records,
      running: this.active.has(id),
      lakeAvailable: !!(await lakeLocation()),
      stale:
        !!records[0] &&
        (records[0].snapshotHash
          ? records[0].snapshotHash !== snapshot.snapshotHash
          : records[0].sourceHash !== snapshot.sourceHash),
    };
  }
  async check(id, run = false, signal) {
    if (this.active.has(id)) throw Error("A Lean check is already running.");
    if ((await this.setup.status(id)).busy)
      throw Error(
        "Wait for Lean setup to finish before checking this project.",
      );
    const controller = new AbortController(),
      abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    this.active.set(id, controller);
    try {
      const root = await this.projects.root(id),
        before = await leanSnapshot(root);
      const record = await inspectLean(root, run, undefined, {
        signal: controller.signal,
        lake: await lakeLocation(),
        save: false,
      });
      record.snapshotHash = before.snapshotHash;
      if ((await leanSnapshot(root)).snapshotHash !== before.snapshotHash) {
        record.status = "stale";
        record.message =
          "The formalization changed during the check. Check the current version again.";
      }
      const dir = path.join(this.data, "verification", id);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, record.id + ".json"),
        JSON.stringify(record, null, 2),
      );
      return record;
    } finally {
      signal?.removeEventListener("abort", abort);
      this.active.delete(id);
    }
  }
  async afterTurn(id, before, mode, signal) {
    const after = await this.snapshot(id);
    if (!after.snapshotHash || after.snapshotHash === before) return null;
    return this.check(id, mode === "full" && !signal?.aborted, signal);
  }
  async saveDraft(id, conversation, turnId) {
    if (this.saving.has(id) || this.active.has(id))
      throw Error("Wait for the current certificate save or check to finish.");
    const turn = conversation.turns.find((t) => t.id === turnId),
      source = leanDraft(turn?.output);
    if (turn?.status !== "complete" || !source || source.length > 1_000_000)
      throw Error(
        "This reply does not contain one complete Lean draft. Ask the assistant to save the formalization.",
      );
    this.saving.add(id);
    try {
      const root = await this.projects.root(id),
        file = await projectFile(root, "certificates/Main.lean", true);
      try {
        const existing = await fs.readFile(file, "utf8");
        if (existing !== source)
          throw Error(
            "A different formalization is already saved. Ask the shared assistant to revise it; your existing proof has been preserved.",
          );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, source, { flag: "wx" });
      }
      await this.check(id, false);
      return this.read(id);
    } finally {
      this.saving.delete(id);
    }
  }
  stopAll() {
    for (const c of this.active.values()) c.abort();
  }
}
