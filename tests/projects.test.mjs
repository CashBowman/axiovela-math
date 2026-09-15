import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { Projects } from "../server/projects.mjs";
test("open/create reuses registered canonical folders and preserves unrelated contents", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "math-open-project-"));
  try {
    const store = new Store(dir),
      initial = await store.read();
    let state = await store.save(initial, 0);
    const projects = new Projects(dir, store);
    await projects.init();
    const folder = path.join(dir, "chosen", "Sample");
    state = await projects.openOrCreate({
      directory: folder,
      revision: state.revision,
    });
    const id = state.activeProjectId;
    await fs.writeFile(path.join(folder, "keep.txt"), "original");
    const alias = path.join(dir, "alias");
    await fs.symlink(folder, alias);
    state = await projects.openOrCreate({
      directory: alias,
      revision: state.revision,
    });
    assert.equal(state.activeProjectId, id);
    assert.equal(state.projects.length, 2);
    assert.equal(
      await fs.readFile(path.join(folder, "keep.txt"), "utf8"),
      "original",
    );
    const unrelated = path.join(dir, "unrelated");
    await fs.mkdir(unrelated);
    await fs.writeFile(path.join(unrelated, "keep.txt"), "not a project");
    await assert.rejects(
      projects.openOrCreate({ directory: unrelated, revision: state.revision }),
      /not a project/,
    );
    assert.deepEqual(await fs.readdir(unrelated), ["keep.txt"]);
    await assert.rejects(
      projects.openOrCreate({
        directory: path.join(dir, "stale"),
        revision: 0,
      }),
      /Save and reload/,
    );
    await assert.rejects(fs.access(path.join(dir, "stale")));
    const empty = path.join(dir, "empty");
    await fs.mkdir(empty);
    state = await projects.openOrCreate({
      directory: empty,
      revision: state.revision,
    });
    assert.equal(state.projects.length, 3);
    assert.ok(
      (await fs.stat(path.join(empty, "axiovela-math.project.json"))).isFile(),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
