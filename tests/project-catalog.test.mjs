import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.mjs";
import { Projects } from "../server/projects.mjs";
import { ProjectCatalog, exactSourceKeys } from "../server/project-catalog.mjs";
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "math-catalog-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  await store.save(await store.read(), 0);
  const projects = new Projects(dir, store);
  await projects.init();
  const catalog = new ProjectCatalog(store, projects),
    edit = async (body) =>
      catalog.edit({ ...body, revision: (await store.read()).revision });
  const create = async (folder) => {
    const state = await projects.openOrCreate({
      directory: path.join(dir, folder),
      revision: (await store.read()).revision,
    });
    return state.projects.find((p) => p.id === state.activeProjectId);
  };
  return { dir, store, projects, catalog, edit, create };
}
test("catalog migrates stored projects without creating folders, canonical reopening and pin ordering", async (t) => {
  const { dir, store, projects, catalog, edit, create } = await fixture(t);
  const initial = (await store.read()).projects[0];
  let snapshot = await catalog.snapshot();
  assert.equal(snapshot.projects[0].available, false);
  await assert.rejects(fs.stat(projects.location(initial)));
  const a = await create("one/Same name"),
    b = await create("two/Same name");
  await fs.symlink(a.folder, path.join(dir, "alias"));
  await projects.openOrCreate({
    directory: path.join(dir, "alias"),
    revision: (await store.read()).revision,
  });
  assert.equal((await store.read()).projects.length, 3);
  await edit({ action: "pin", id: b.id, pinned: true });
  snapshot = await catalog.snapshot();
  assert.equal(snapshot.projects[0].id, b.id);
  assert.equal(snapshot.items.length, 0);
  await edit({ action: "forget", id: a.id });
  assert.equal((await catalog.snapshot()).projects.length, 2);
  assert.ok(await fs.stat(a.folder));
  await edit({ action: "open", id: a.id });
  assert.equal((await catalog.snapshot()).projects.length, 3);
});
test("exact shared identities are symmetric; titles never connect projects", async (t) => {
  const { store, catalog, create } = await fixture(t),
    a = await create("A"),
    b = await create("B");
  let state = await store.read();
  for (const p of state.projects.filter((p) => [a.id, b.id].includes(p.id)))
    p.papers = [
      {
        id: "paper",
        title: "Same title",
        notes: "",
        sourceUrl:
          p.id === a.id
            ? "https://arxiv.org/pdf/2302.03660v2.pdf"
            : "https://arxiv.org/abs/2302.03660",
      },
    ];
  await store.save(state, state.revision);
  let graph = await catalog.snapshot({ details: true });
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].type, "shares sources with");
  assert.match(graph.links[0].evidence[0], /arxiv:2302.03660/);
  state = await store.read();
  state.projects.find((p) => p.id === a.id).papers[0].sourceUrl =
    "https://example.com/different";
  await store.save(state, state.revision);
  assert.equal((await catalog.snapshot({ details: true })).links.length, 0);
  assert.deepEqual(
    exactSourceKeys({ sourceUrl: "https://doi.org/10.1234/ABC" }),
    exactSourceKeys({ doi: "10.1234/abc" }),
  );
  assert.deepEqual(
    exactSourceKeys({ sourceUrl: "https://example.com/a?b=2&utm_source=x#a" }),
    ["url:https://example.com/a?b=2"],
  );
  assert.deepEqual(exactSourceKeys({ contentHash: "a".repeat(64) }), [
    "sha256:" + "a".repeat(64),
  ]);
});
test("manual links preserve stable ids, reject invalid endpoints, relocate, hide without deleting and enforce revisions", async (t) => {
  const { dir, store, projects, catalog, edit, create } = await fixture(t),
    a = await create("A"),
    b = await create("B");
  const body = {
    action: "link",
    from: `project:${a.id}`,
    to: `project:${b.id}`,
    type: "tests",
    description: "A tests the conjectural bound in B.",
  };
  await assert.rejects(edit({ ...body, description: " " }));
  await assert.rejects(edit({ ...body, to: "project:missing" }));
  await assert.rejects(edit({ ...body, to: body.from }));
  await edit(body);
  let link = (await catalog.snapshot({ details: true })).links[0];
  await edit({ ...body, id: link.id, description: "Updated explanation." });
  assert.equal(
    (await catalog.snapshot({ details: true })).links[0].id,
    link.id,
  );
  await assert.rejects(
    catalog.edit({ action: "forget", id: a.id, revision: 0 }),
    (e) => e.status === 409,
  );
  const moved = path.join(dir, "moved");
  await fs.rename(a.folder, moved);
  assert.equal(
    (await catalog.snapshot()).projects.find((p) => p.id === a.id).available,
    false,
  );
  await assert.rejects(projects.root(a.id));
  await assert.rejects(fs.stat(a.folder));
  await assert.rejects(
    edit({ action: "locate", id: a.id, path: b.folder }),
    /identity/,
  );
  await edit({ action: "locate", id: a.id, path: moved });
  assert.equal(await projects.root(a.id), moved);
  await edit({ action: "forget", id: b.id });
  assert.equal((await catalog.snapshot({ details: true })).links.length, 0);
  assert.equal((await store.read()).projectConnections.length, 1);
  await edit({ action: "open", id: b.id });
  assert.equal(
    (await catalog.snapshot({ details: true })).links[0].id,
    link.id,
  );
  await edit({ action: "unlink", id: link.id });
  assert.equal((await catalog.snapshot({ details: true })).links.length, 0);
  const second = new Projects(dir, store);
  await second.init();
  assert.equal(await second.root(a.id), moved);
});
test("catalog only reads bounded safe captures, and never overwrites corrupt state or registry", async (t) => {
  const { dir, store, projects, catalog, edit, create } = await fixture(t),
    a = await create("A");
  const batch = "11111111-1111-1111-1111-111111111111",
    id = "22222222-2222-2222-2222-222222222222",
    rel = `bridge/${a.id}/${batch}`;
  await fs.mkdir(path.join(dir, rel), { recursive: true });
  await fs.writeFile(
    path.join(dir, rel, "manifest.json"),
    JSON.stringify({
      items: [
        { id, record: { name: "Saved experiment", summary: "Measured value" } },
      ],
    }),
  );
  let graph = await catalog.snapshot({ details: true });
  assert.equal(graph.items.filter((i) => i.kind === "experiment").length, 1);
  assert.equal(graph.links[0].type, "contains");
  assert.equal(
    graph.items.at(-1).key,
    `experiment:${a.id}:${encodeURIComponent(batch + "/" + id)}`,
  );
  await fs.unlink(path.join(dir, rel, "manifest.json"));
  await fs.writeFile(path.join(dir, "secret.json"), '{"items":[]}');
  await fs.symlink(
    path.join(dir, "secret.json"),
    path.join(dir, rel, "manifest.json"),
  );
  graph = await catalog.snapshot({ details: true });
  assert.match(graph.warnings.join(" "), /Symlinks/);
  await fs.writeFile(store.file, "broken");
  await assert.rejects(edit({ action: "pin", id: a.id, pinned: true }));
  assert.equal(await fs.readFile(store.file, "utf8"), "broken");
  await fs.writeFile(projects.registryFile, "[]");
  await assert.rejects(
    new Projects(dir, store).init(),
    /Invalid project folder registry/,
  );
});
