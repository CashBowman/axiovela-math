import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {desktopTarget, runtimeFile} from '../scripts/desktop-targets.mjs';
import {bundledTectonic} from '../server/desktop-tools.mjs';
import {createRequire} from 'node:module';
const {Updates} = createRequire(import.meta.url)('../desktop/updates.cjs');

test('private builds never request public release metadata', async () => {
  const updates = new Updates({profile: '/unused', currentVersion: '0.1.14-dev.1', privateDistribution: true, fetcher: () => { throw Error('Network must not be called'); }});
  assert.equal((await updates.check()).status, 'private');
  assert.equal(updates.snapshot().release, null);
  assert.equal(updates.snapshot().error, null);
  await assert.rejects(updates.download('exe'), /storage|verified/);
});

test('cross-platform staging excludes private data, tools from another platform and development files', () => {
  for (const file of ['server/index.mjs', 'shared/harness.mjs', 'desktop/main.cjs', 'desktop/licenses/tectonic.txt', 'LICENSE', 'public/workbench-mark.png']) assert.ok(runtimeFile(file), file);
  for (const file of ['.env', 'server/.env.json', 'server/.workspace/state.json', 'desktop/tools/tectonic', 'desktop/icons/math.ico', 'AGENTS.md', 'docs/notes.md', 'reports/report.json', 'desktop/keys/private.pem', 'server/credentials.enc', 'server/node_modules/pkg/index.mjs']) assert.equal(runtimeFile(file), false, file);
  assert.throws(() => desktopTarget('../../linux'), /Unsupported/);
  assert.throws(() => desktopTarget('win32-arm64'), /Unsupported/);
  for (const target of ['win32-x64', 'darwin-x64', 'darwin-arm64']) assert.match(desktopTarget(target).sha256, /^[a-f0-9]{64}$/);
});

test('bundled compiler must match OS and architecture, including Windows extension', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'math-tools-'));
  try {
    await fs.writeFile(path.join(directory, 'tectonic.exe'), 'fixture');
    await fs.writeFile(path.join(directory, 'build.json'), JSON.stringify({target: 'win32-x64'}));
    assert.equal(bundledTectonic({directory, platform: 'win32', arch: 'x64'}), path.join(directory, 'tectonic.exe'));
    assert.equal(bundledTectonic({directory, platform: 'win32', arch: 'arm64'}), null);
    assert.equal(bundledTectonic({directory, platform: 'linux', arch: 'x64'}), null);
    await fs.rm(path.join(directory, 'tectonic.exe'));
    assert.equal(bundledTectonic({directory, platform: 'win32', arch: 'x64'}), null);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
