import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectFile} from './axiovela/assistant-api.mjs';
const standardAxioms = new Set(['propext', 'Classical.choice', 'Quot.sound']);
export function declarationVerdict(row) {
  if (!row || row.kind !== 'theorem') return 'not-a-theorem';
  if (!Array.isArray(row.axioms) || row.axioms.some(x => typeof x !== 'string')) return 'unavailable';
  if (row.axioms.includes('sorryAx')) return 'incomplete';
  if (row.axioms.some(x => !standardAxioms.has(x))) return 'extra-axioms';
  return 'checked';
}
// Evidence from a real Lean command, not certificate.json verdicts or chat prose.
// This is an axiom/declaration audit, not an external kernel checker or a proof
// that the informal statement was translated faithfully.
export async function auditLean(root, plan, {lake, signal}, run) {
  const names = [...new Set([...(plan?.declarations || []), ...(plan?.results || []).flatMap(r => r.declarations || [])])].slice(0, 300);
  if (!names.length) return [];
  const valid = names.filter(n => typeof n === 'string' && n.length <= 300 && /^[\p{L}_][\p{L}\p{N}_'.]*$/u.test(n));
  const unavailable = names.filter(n => !valid.includes(n)).map(name => ({name, status: 'invalid-name'}));
  if (!valid.length) return unavailable;
  const source = await fs.readFile(await projectFile(root, 'certificates/Main.lean'), 'utf8');
  const marker = 'AXIOVELA_AUDIT_' + randomUUID().replaceAll('-', '') + ':';
  const commands = valid.map(name => `
run_cmd do
  let n := (${JSON.stringify(name)}.splitOn ".").foldl Lean.Name.str Lean.Name.anonymous
  let env ← Lean.getEnv
  match env.find? n with
  | none => Lean.logInfo (${JSON.stringify(marker)} ++ (Lean.Json.mkObj [("name", Lean.toJson n.toString), ("kind", Lean.toJson "missing")]).compress)
  | some info =>
    let axioms ← Lean.collectAxioms n
    let kind := match info with
      | .thmInfo _ => "theorem"
      | _ => "other"
    let type ← Lean.Elab.Command.liftTermElabM do
      return (← Lean.Meta.ppExpr info.type).pretty
    Lean.logInfo (${JSON.stringify(marker)} ++ (Lean.Json.mkObj [("name", Lean.toJson n.toString), ("kind", Lean.toJson kind), ("type", Lean.toJson type), ("axioms", Lean.toJson (axioms.map Lean.Name.toString))]).compress)
`).join('\n');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'axiovela-lean-audit-'));
  try {
    const file = path.join(temporary, 'Audit.lean');
    await fs.writeFile(file, 'import Lean\n' + source + '\n' + commands);
    const result = await run(lake || 'lake', ['env', 'lean', file], path.join(root, 'certificates'), 120000, signal);
    const rows = new Map();
    if (result.exitCode === 0 && !result.timedOut && !result.canceled && !result.error)
      for (const line of result.output.split('\n')) {
        if (!line.startsWith(marker)) continue;
        try {
          const row = JSON.parse(line.slice(marker.length));
          if (valid.includes(row.name)) rows.set(row.name, {...row, status: row.kind === 'missing' ? 'missing' : declarationVerdict(row)});
        } catch {}
      }
    return [...unavailable, ...valid.map(name => rows.get(name) || {name, status: 'unavailable', detail: result.canceled ? 'Check stopped.' : result.timedOut ? 'Axiom check timed out.' : result.error || 'Lean did not return a complete declaration audit.'})];
  } finally { await fs.rm(temporary, {recursive: true, force: true}); }
}
