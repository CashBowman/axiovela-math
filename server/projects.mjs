import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { containedProjectPath } from "./axiovela/project-paths.mjs";
import { blankProject } from "../shared/research.mjs";
export class Projects {
  constructor(data, store) {
    this.data = data;
    this.store = store;
    this.registryFile = path.join(data, "project-folders.json");
    this.registry = {};
  }
  async init() {
    try {
      this.registry = JSON.parse(await fs.readFile(this.registryFile, "utf8"));
      if (
        !this.registry ||
        typeof this.registry !== "object" ||
        Array.isArray(this.registry) ||
        Object.entries(this.registry).some(
          ([id, folder]) =>
            !/^[a-zA-Z0-9-]{1,64}$/.test(id) ||
            typeof folder !== "string" ||
            !path.isAbsolute(folder) ||
            folder.includes("\0"),
        )
      )
        throw Error(
          "Invalid project folder registry; restore its backup before continuing.",
        );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  location(project) {
    return (
      project.folder ||
      this.registry[project.id] ||
      path.join(this.data, "projects", project.id)
    );
  }
  async root(id) {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw Error("Invalid project ID.");
    const s = await this.store.read();
    const p = s.projects.find((p) => p.id === id);
    if (!p) throw Error("Project not found.");
    const root = this.location(p);
    if (p.folder || this.registry[id]) {
      if (!(await fs.stat(root)).isDirectory())
        throw Error("Project folder unavailable. Locate it in Projects.");
    }
    await fs.mkdir(root, { recursive: true });
    for (const dir of [
      "research",
      "writeups",
      "certificates",
      "assistant",
      "exports",
    ])
      await fs.mkdir(containedProjectPath(root, dir), { recursive: true });
    if (!this.registry[id]) {
      this.registry[id] = root;
      await this.saveRegistry();
      const manifest = containedProjectPath(root, "axiovela-math.project.json");
      await fs
        .writeFile(
          manifest,
          JSON.stringify({ schemaVersion: 1, id, name: p.name }),
          { flag: "wx" },
        )
        .catch((e) => {
          if (e.code !== "EEXIST") throw e;
        });
    }
    return root;
  }
  async saveRegistry() {
    this.registryTail = (this.registryTail || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.data, { recursive: true });
        await fs.writeFile(
          this.registryFile + ".tmp",
          JSON.stringify(this.registry, null, 2),
          { mode: 0o600 },
        );
        await fs.rename(this.registryFile + ".tmp", this.registryFile);
      });
    await this.registryTail;
  }
  async openOrCreate({ directory, revision }) {
    if (
      typeof directory !== "string" ||
      !directory.trim() ||
      directory.includes("\0")
    )
      throw Error("Enter a project folder or name.");
    const requested = directory.trim();
    const folder = path.isAbsolute(requested)
      ? path.resolve(requested)
      : path.resolve(this.data, "projects", requested);
    const s = await this.store.read();
    if (revision !== s.revision)
      throw Object.assign(
        Error("Save and reload the workspace before opening a project."),
        { status: 409 },
      );
    const canonical = await fs.realpath(folder).catch((e) => {
      if (e.code === "ENOENT") return folder;
      throw e;
    });
    for (const p of s.projects) {
      const existing = this.location(p);
      if ((await fs.realpath(existing).catch(() => existing)) === canonical) {
        if (!(await fs.stat(existing)).isDirectory())
          throw Error("Project folder unavailable. Locate it first.");
        p.navigation = {
          ...p.navigation,
          hidden: false,
          lastOpened: new Date().toISOString(),
        };
        return this.store.save({ ...s, activeProjectId: p.id }, revision);
      }
    }
    const entries = await fs.readdir(folder).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (entries?.length)
      throw Error(
        "This folder is not a project in this workspace. Choose an empty or new folder; use the original workspace to reopen its registered projects.",
      );
    return this.create({
      name: path.basename(folder),
      parentDirectory: path.dirname(folder),
      revision,
      allowEmpty: true,
    });
  }
  async create({ name, parentDirectory, revision, allowEmpty = false }) {
    if (
      typeof name !== "string" ||
      !name.trim() ||
      /[\\/\x00-\x1f]/.test(name) ||
      [".", ".."].includes(name)
    )
      throw Error("Choose a project name without path separators.");
    const s = await this.store.read();
    if (revision !== s.revision)
      throw Object.assign(
        Error("Save and reload the workspace before creating a project."),
        { status: 409 },
      );
    const id = randomUUID();
    const parent = parentDirectory?.trim()
      ? path.resolve(parentDirectory)
      : path.join(this.data, "projects");
    const folder = path.join(parent, name.trim());
    await fs.mkdir(parent, { recursive: true });
    await fs.mkdir(folder).catch(async (e) => {
      if (
        e.code !== "EEXIST" ||
        !allowEmpty ||
        (await fs.readdir(folder)).length
      )
        throw e;
    });
    const p = blankProject(id, name.trim());
    p.folder = folder;
    p.navigation = { lastOpened: new Date().toISOString() };
    this.registry[id] = folder;
    await fs.mkdir(this.data, { recursive: true });
    await this.saveRegistry();
    await fs.writeFile(
      path.join(folder, "axiovela-math.project.json"),
      JSON.stringify({ schemaVersion: 1, id, name: p.name }, null, 2),
      { flag: "wx" },
    );
    return this.store.save(
      { ...s, activeProjectId: id, projects: [...s.projects, p] },
      revision,
    );
  }
}
