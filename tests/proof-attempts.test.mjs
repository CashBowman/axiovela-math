import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {proofTargets, prepareProofAttempts, captureProofAttempts, readProofAttempts, queryProofAttempts, selectProofAttempts} from '../server/proof-attempts.mjs';
import {executeResearchTool} from '../server/axiovela/assistant-api.mjs';
import {Store} from '../server/store.mjs';
import {Projects} from '../server/projects.mjs';
import {Chats} from '../server/chat.mjs';

const project = () => ({question: 'Is the spectral bound uniform in dimension?', claims: [
  {id: 'C1', statement: 'For every dimension d, the normalized norm is at most 1.', revision: 1, status: 'conjecture'},
], graphNodes: [{id: 'reduction', text: 'Reduction to diagonal matrices.'}]});
const attempt = (overrides = {}) => ({id: 'diagonal', targetRef: 'claim:C1',
  scope: 'Normalized diagonal matrices in arbitrary dimension.', approach: 'Spectral reduction to diagonal matrices.',
  status: 'blocked', labels: ['method:spectral', 'obstruction:dimension'],
  outcome: 'The estimate leaves a dimension factor. This does not refute the target.',
  nextStep: 'Check whether trace normalization removes the factor.', evidence: ['research/proof.md#diagonal'], revisitOf: '', revisitReason: '', ...overrides});
async function sandbox(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'axiovela-attempts-'));
  try { await fn(root); } finally { await fs.rm(root, {recursive: true, force: true}); }
}
async function checkpoint(root, p = project(), rows = [attempt()], options = {}) {
  const turn = {id: randomUUID(), conversationId: randomUUID(), mode: 'auto', message: 'Try a spectral bound.', status: 'complete', ...options};
  turn.proofMemory = (await prepareProofAttempts(root, p, turn)).admission;
  await fs.mkdir(path.dirname(path.join(root, turn.proofMemory.inputPath)), {recursive: true});
  await fs.writeFile(path.join(root, turn.proofMemory.inputPath), JSON.stringify({schema: 'axiovela.proof-attempts/v1', attempts: rows}));
  return turn;
}
test('capture preserves target revisions and provenance, and is idempotent', () => sandbox(async root => {
  const p = project(), turn = await checkpoint(root, p);
  const result = await captureProofAttempts(root, turn);
  assert.equal(result.saved, 1);
  const original = await fs.readFile(path.join(root, result.path), 'utf8');
  await fs.writeFile(path.join(root, turn.proofMemory.inputPath), '{}');
  assert.deepEqual(await captureProofAttempts(root, turn), result);
  assert.equal(await fs.readFile(path.join(root, result.path), 'utf8'), original);
  const data = await queryProofAttempts(root, p, {targetRef: 'claim:C1'});
  assert.equal(data.attempts[0].stale, false);
  p.claims[0].revision++; p.claims[0].statement += ' with a new assumption';
  assert.equal((await queryProofAttempts(root, p, {targetRef: 'claim:C1'})).attempts[0].stale, true);
  const full = (await readProofAttempts(root)).attempts[0];
  assert.equal(full.target.statement, turn.proofMemory.targets[1].statement);
  assert.equal(full.interpretation, 'assistant-reported, unverified');
}));
test('concurrent conversations preserve both records; duplicate summaries collapse only at retrieval', () => sandbox(async root => {
  const a = await checkpoint(root), b = await checkpoint(root);
  await Promise.all([captureProofAttempts(root, a), captureProofAttempts(root, b)]);
  const data = await queryProofAttempts(root, project(), {query: 'spectral'});
  assert.equal(data.total, 2); assert.equal(data.shown, 1);
  assert.equal((await fs.readdir(path.join(root, 'research/attempts/records'))).length, 2);
}));
test('read-only turns and absent checkpoints never manufacture outcomes or project files', () => sandbox(async root => {
  const turn = {id: randomUUID(), message: 'Explain the bound.', mode: 'ask'};
  const memory = await prepareProofAttempts(root, project(), turn);
  assert.match(memory.prompt, /Read-only/);
  assert.equal((await captureProofAttempts(root, {...turn, proofMemory: memory.admission})).status, 'read-only');
  assert.equal((await captureProofAttempts(root, {...turn, mode: 'auto', proofMemory: memory.admission})).status, 'not-recorded');
  assert.deepEqual(await fs.readdir(root), []);
}));
test('canceled and failed turns preserve actual checkpoint summaries with execution status', () => sandbox(async root => {
  for (const status of ['canceled', 'failed', 'interrupted']) {
    const t = await checkpoint(root, project(), [attempt({id: status})], {status});
    await captureProofAttempts(root, t);
  }
  assert.deepEqual((await readProofAttempts(root)).attempts.map(a => a.turnStatus).sort(), ['canceled', 'failed', 'interrupted']);
}));
test('invalid statuses, unknown targets, duplicate ids and malformed files are rejected without erasing inputs', () => sandbox(async root => {
  for (const rows of [[attempt({id: undefined})], [attempt({status: 'verified'})], [attempt({targetRef: 'idea:invented'})], [attempt(), attempt()], [attempt({labels: ['x'.repeat(49)]})]]) {
    const turn = await checkpoint(root, project(), rows);
    await assert.rejects(captureProofAttempts(root, turn));
    assert.ok(await fs.stat(path.join(root, turn.proofMemory.inputPath)));
  }
  const turn = await checkpoint(root);
  await fs.writeFile(path.join(root, turn.proofMemory.inputPath), '{');
  await assert.rejects(captureProofAttempts(root, turn));
  assert.equal((await readProofAttempts(root)).attempts.length, 0);
}));
test('revisits require a real prior record and a reason, and never overwrite history', () => sandbox(async root => {
  const first = await checkpoint(root); await captureProofAttempts(root, first);
  const id = first.id + '/diagonal';
  for (const row of [attempt({revisitOf: id}), attempt({revisitOf: randomUUID() + '/unknown', revisitReason: 'Different assumption'})])
    await assert.rejects(captureProofAttempts(root, await checkpoint(root, project(), [row])));
  const next = await checkpoint(root, project(), [attempt({status: 'partial-result', revisitOf: id, revisitReason: 'Added trace normalization.'})]);
  await captureProofAttempts(root, next);
  assert.equal((await readProofAttempts(root)).attempts.length, 2);
}));
test('malformed records and symlinked inbox files are handled safely', () => sandbox(async root => {
  const turn = await checkpoint(root); const file = path.join(root, turn.proofMemory.inputPath);
  await fs.rename(file, file + '.original'); await fs.symlink(file + '.original', file);
  await assert.rejects(captureProofAttempts(root, turn), /Symlinks/);
  await fs.mkdir(path.join(root, 'research/attempts/records'), {recursive: true});
  await fs.writeFile(path.join(root, 'research/attempts/records', randomUUID() + '.json'), '{');
  const read = await queryProofAttempts(root, project());
  assert.equal(read.total, 0); assert.equal(read.warningCount, 1);
}));
test('retrieval selects relevant targets/labels, distinguishes stale records, and respects briefing budget', () => {
  const p = project(), targets = proofTargets(p);
  const rows = Array.from({length: 30}, (_, i) => ({...attempt(), id: randomUUID() + '/route', target: targets[1],
    scope: i < 20 ? 'Unrelated topology compactness' : 'Spectral diagonal bound',
    approach: i < 20 ? 'Topology' : 'Spectral', labels: i < 20 ? ['topology'] : ['spectral'],
    outcome: ('Specific obstruction ' + i + ' ').repeat(100), nextStep: '',
    createdAt: new Date(i * 1000).toISOString(), path: 'research/attempts/records/example.json', turnStatus: 'complete'}));
  const result = selectProofAttempts(rows, p, {query: 'spectral diagonal', label: 'spectral', budget: 6000});
  assert.equal(result.matched, 10); assert.ok(result.shown > 0 && result.shown < 8);
  assert.ok(JSON.stringify(result.attempts).length <= 6002);
  assert.equal(selectProofAttempts(rows, p, {targetRef: 'idea:reduction'}).matched, 0);
});
test('direct API query tool works read-only and preserves write restrictions', () => sandbox(async root => {
  const t = await checkpoint(root); await captureProofAttempts(root, t);
  const options = {cwd: root, mode: 'ask', signal: new AbortController().signal,
    queryProofAttempts: filters => queryProofAttempts(root, project(), filters)};
  const response = JSON.parse(await executeResearchTool('query_proof_attempts', {query: 'spectral', targetRef: '', status: '', label: ''}, options));
  assert.equal(response.shown, 1);
  await assert.rejects(executeResearchTool('write_file', {path: 'bad', content: 'bad'}, options), /does not permit/);
}));

async function chatFixture(root) {
  process.env.WORKBENCH_CODEX_PATH = path.resolve('scripts/fixtures/assistant-rpc.mjs');
  const store = new Store(root), initial = await store.read();
  Object.assign(initial.projects[0], project());
  const state = await store.save(initial, 0), projects = new Projects(root, store); await projects.init();
  const chats = new Chats(projects, store), id = state.activeProjectId;
  const wait = async () => {
    for (let i = 0; i < 300 && chats.controllers.size; i++) await new Promise(r => setTimeout(r, 20));
    assert.equal(chats.controllers.size, 0); await chats.persist(id);
  };
  return {chats, store, projects, id, wait, cwd: await projects.root(id)};
}
test('native chat saves attempts, retrieves across new conversations, and survives restart', () => sandbox(async root => {
  const {chats, store, projects, id, wait, cwd} = await chatFixture(root);
  const a = await chats.newConversation(id, 'research');
  await chats.send(id, a.id, 'FIXTURE_ATTEMPT'); await wait();
  assert.equal(a.turns[0].proofMemoryResult.saved, 1);
  const restored = new Chats(projects, store), b = await restored.newConversation(id, 'research');
  await restored.send(id, b.id, 'FIXTURE_PROMPT spectral bound');
  for (let i = 0; i < 300 && restored.controllers.size; i++) await new Promise(r => setTimeout(r, 20));
  await restored.persist(id);
  assert.equal(b.turns[0].status, 'complete');
  assert.match(JSON.parse(b.turns[0].output).prompt, /Dimension factor survives/);
  assert.equal((await queryProofAttempts(cwd, project())).total, 1);
}));
test('failed native turns capture checkpoints and interrupted persisted turns recover on load', () => sandbox(async root => {
  const {chats, store, projects, id, wait, cwd} = await chatFixture(root);
  const c = await chats.newConversation(id, 'research');
  await chats.send(id, c.id, 'FIXTURE_ATTEMPT FIXTURE_FAIL'); await wait();
  assert.equal(c.turns[0].status, 'failed'); assert.equal(c.turns[0].proofMemoryResult.saved, 1);
  const abandoned = await checkpoint(cwd, project(), [attempt()], {status: 'running'});
  c.turns.push(abandoned); await chats.persist(id);
  const restored = new Chats(projects, store);
  const record = (await restored.load(id)).find(x => x.id === c.id).turns.at(-1);
  assert.equal(record.status, 'interrupted'); assert.equal(record.proofMemoryResult.saved, 1);
  assert.ok((await readProofAttempts(cwd)).attempts.some(a => a.turnStatus === 'interrupted'));
}));
