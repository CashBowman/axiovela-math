// Deterministic native-session fixture. No network, credentials, or model calls.
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
let session;
process.stdout.write('null\n[]\nunstructured diagnostic noise\n');
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const event = (method, params) => send({method, params: method.startsWith('turn/') ? {threadId: session?.id, ...params, turn: {id: 'turn-1', ...params.turn}} : {threadId: session?.id, turnId: 'turn-1', ...params}});
const store = id => path.join(process.cwd(), `.fixture-${id}.json`);
for await (const line of readline.createInterface({input: process.stdin})) {
  const {id, method, params: p = {}} = JSON.parse(line);
  if (id == null) continue;
  let result = {};
  try {
    if (method === 'model/list') result = {data: [{id: 'test-model', model: 'test-model', displayName: 'Test model', isDefault: true, supportedReasoningEfforts: [{reasoningEffort: 'low'}, {reasoningEffort: 'high'}], defaultReasoningEffort: 'low'}, {id: 'second-model', model: 'second-model', displayName: 'Second model', supportedReasoningEfforts: [{reasoningEffort: 'low'}], defaultReasoningEffort: 'low'}], nextCursor: null};
    if (method === 'config/read') result = {config: {model: 'test-model', model_reasoning_effort: 'low', privateToken: 'NEVER-EXPOSE-FIXTURE'}};
    if (method === 'thread/start' || method === 'thread/resume' || method === 'thread/fork') {
      session = method !== 'thread/start' ? JSON.parse(await readFile(store(p.threadId), 'utf8')) : {id: randomUUID(), turns: 0};
      if (method === 'thread/resume' && session.writerLocked) throw new Error(`thread ${session.id} already has an active writer`);
      if (method === 'thread/fork') {
        if (session.forkFails) throw new Error('Fixture fork unavailable');
        if (p.deferGoalContinuation !== true) throw new Error('Automatic goal continuation must be deferred');
        session = {...session, id: randomUUID(), forkedFrom: session.id, writerLocked: false, archived: false};
      }
      if (session.archived) throw new Error(`session ${session.id} is archived. Run codex unarchive first.`);
      Object.assign(session, {model: p.model, effort: p.config?.model_reasoning_effort, sandbox: p.sandbox, approvalPolicy: p.approvalPolicy, approvalsReviewer: p.approvalsReviewer});
      // A started session must survive cancellation before its first turn.
      await writeFile(store(session.id), JSON.stringify(session));
      result = {thread: {id: session.id}, model: session.model, reasoningEffort: session.effort, modelProvider: 'openai'};
    }
    if (method === 'thread/read') result = {thread:{id:session.id,status:{type:session.busyAfterTurn?'active':'idle'},isPinned:!!session.pinned}};
    if (method === 'thread/loaded/list') result = {data:session.loadedWorker?[session.id,'worker']: [session.id],nextCursor:null};
    if (method === 'thread/archive') {
      if (session.archiveFails) throw Error('Archive unavailable');
      session.archived = true;
      await writeFile(store(session.id),JSON.stringify(session));
    }
    if (method === 'thread/name/set') {
      if (session.nameFails) throw Error('Method not supported');
      if (p.threadId !== session.id || typeof p.name !== 'string') throw Error('Invalid name request');
      session.name = p.name;
      await writeFile(store(session.id), JSON.stringify(session));
    }
    if (method === 'thread/unarchive') {
      session = JSON.parse(await readFile(store(p.threadId), 'utf8'));
      session.archived = false; session.archiveOnStart = false;
      await writeFile(store(session.id), JSON.stringify(session));
      result = {thread: {id: session.id}};
    }
    if (method === 'turn/start') {
      if (session.archiveOnStart) throw new Error(`session ${session.id} is archived. Run codex unarchive first.`);
      session.turns++;
      await writeFile(store(session.id), JSON.stringify(session));
      result = {turn: {id: 'turn-1'}};
      const prompt = p.input[0].text;
      const request = prompt.match(/^User request:[ \t]*\n?([\s\S]*?)(?:\n\n|$)/m)?.[1] || prompt;
      if(request.includes('FIXTURE_ATTEMPT')&&session.sandbox!=='read-only'){
        const relative=prompt.match(/checkpoint concise attempt summaries in (research\/attempts\/inbox\/[a-f0-9-]+\.json)/)?.[1];
        if(!relative)throw Error('Missing attempt checkpoint path');
        await mkdir(path.dirname(path.join(process.cwd(),relative)),{recursive:true});
        await writeFile(path.join(process.cwd(),relative),JSON.stringify({schema:'axiovela.proof-attempts/v1',attempts:[{id:'spectral',targetRef:'project',scope:'Uniform spectral bound in dimension.',approach:'Diagonal reduction.',status:'blocked',labels:['method:spectral'],outcome:'Dimension factor survives; the route is blocked, not refuted.',nextStep:'Check trace normalization.',evidence:[]}]}));
      }
      if(request.includes('FIXTURE_LEAN_ARTIFACT')&&session.sandbox!=='read-only'){
        const folder=path.join(process.cwd(),'certificates');await mkdir(folder,{recursive:true});
        await writeFile(path.join(folder,'Main.lean'),'theorem fixture_add_zero (n : Nat) : n + 0 = n := by simp\n');
        await writeFile(path.join(folder,'lean-toolchain'),'leanprover/lean4:v4.19.0\n');
        await writeFile(path.join(folder,'lakefile.toml'),'name = "fixture"\n');
        await writeFile(path.join(folder,'lake-manifest.json'),JSON.stringify({version:'1.1.0',packages:[]}));
        await writeFile(path.join(folder,'certificate.json'),JSON.stringify({title:'Addition of zero',statement:'For every natural number $n$, $n+0=n$.',declarations:['fixture_add_zero'],assumptions:['Natural-number arithmetic'],obligations:['Check correspondence with the intended target.'],scopeNotes:'An elementary fixture, not a Sobolev formalization.'}));
        await writeFile(path.join(folder,'summary.md'),'## Formal argument\n\nThe saved declaration expresses the additive identity.');
      }
      if(request.includes('FIXTURE_RESULT_OUTLINE')&&session.sandbox!=='read-only'){
        await mkdir(path.join(process.cwd(),'research'),{recursive:true});
        await writeFile(path.join(process.cwd(),'research/summary.md'),'The target requires a supporting lemma. The proof remains preliminary.');
        if(!prompt.includes('result outline automatically')||!prompt.includes('kind (claim, theorem, lemma, proof)'))throw Error('Result guidance missing');
        await mkdir(path.join(process.cwd(),'research'),{recursive:true});
        await writeFile(path.join(process.cwd(),'research/connections.json'),JSON.stringify({nodes:[{id:'zero',kind:'theorem',title:'Main additive identity',text:'For every natural number $n$, $n+0=n$.',mainResult:true},{id:'helper',kind:'lemma',title:'Supporting identity',text:'The base case needs a formal proof.'}],links:[{from:'idea:zero',to:'idea:helper',type:'depends on',reason:'The induction route uses the base case. Its correspondence is still unreviewed.'}]}));
        const folder=path.join(process.cwd(),'certificates');await mkdir(folder,{recursive:true});
        await writeFile(path.join(folder,'Main.lean'),'theorem fixture_add_zero (n : Nat) : n + 0 = n := by simp\n');
        await writeFile(path.join(folder,'certificate.json'),JSON.stringify({title:'Additive identities',results:[{ref:'idea:zero',declarations:['fixture_add_zero'],assumptions:['Natural numbers'],obligations:['Review statement correspondence.'],scopeNotes:'A fixture declaration.'}]}));
      }
      if(request.includes('FIXTURE_PRELIMINARY')&&session.sandbox!=='read-only'){
        const format=prompt.match(/Selected manuscript format: (markdown|latex)/)?.[1];
        if(!format)throw Error('No manuscript format supplied');
        await mkdir(path.join(process.cwd(),'writeups'),{recursive:true});
        await writeFile(path.join(process.cwd(),'writeups/main.'+(format==='latex'?'tex':'md')),format==='latex'?'\\documentclass{article}\n\\begin{document}\nPreliminary fixture paper. Claims remain unverified.\n\\end{document}':'# Preliminary fixture paper\n\nClaims remain unverified.');
      }
      if (request.includes('FIXTURE_CHILD')) {
        event('turn/started', {threadId: 'child-thread', turn: {id: 'child-turn'}});
        event('item/completed', {threadId: 'child-thread', item: {type: 'agentMessage', text: 'Inspection sent to lead agent'}});
        event('turn/completed', {threadId: 'child-thread', turn: {id: 'child-turn', status: 'completed'}});
        event('item/completed', {turnId: 'previous-turn', item: {type: 'agentMessage', text: 'Stale response'}});
        event('turn/completed', {turnId: 'previous-turn', turn: {id: 'previous-turn', status: 'completed'}});
        event('item/completed', {item: {type: 'agentMessage', text: 'Root is still working'}});
      }
      setTimeout(() => {
        event('item/started', {item: {type: 'commandExecution', command: 'private raw output'}});
        event('item/completed', {item: {type: 'fileChange'}});
        if (request.includes('FIXTURE_HANG')) return;
        if(request.includes('FIXTURE_MULTI_MESSAGE')){
          event('item/agentMessage/delta',{itemId:'first',delta:'First retained '});
          event('item/completed',{item:{id:'first',type:'agentMessage',text:'First retained progress.'}});
          setTimeout(()=>{event('item/agentMessage/delta',{itemId:'second',delta:'Final accumulated '});event('item/completed',{item:{id:'second',type:'agentMessage',text:'Final accumulated answer.'}});event('turn/completed',{turn:{status:'completed'}});},1800);return;
        }
        if(request.includes('FIXTURE_DIRECTIVES')){
          event('item/completed',{item:{id:'directives',type:'agentMessage',text:':codex-file-citation{path="'+request.slice(request.indexOf('FIXTURE_DIRECTIVES')+19).trim()+'" purpose="source"}\n\n- :codex-followup[Develop lemma]{prompt="Develop the next lemma."}'}});event('turn/completed',{turn:{status:'completed'}});return;
        }

        if (request.includes('FIXTURE_HEARTBEAT')) {
          let count = 0;
          const timer = setInterval(() => {
            event('item/agentMessage/delta', {delta: '.'});
            if (++count === 20) {
              clearInterval(timer);
              event('item/completed', {item: {type: 'agentMessage', text: 'Heartbeat complete'}});
              event('turn/completed', {turn: {status: 'completed'}});
            }
          }, 100);
          return;
        }
        if (request.includes('FIXTURE_FAIL')) { event('turn/completed', {turn: {status: 'failed', error: {message: 'Fixture provider rejected this request'}}}); return; }
        const reviewMatch=prompt.match(/^REVIEW_SNAPSHOT_JSON: (.*)$/m);const review=reviewMatch?JSON.parse(reviewMatch[1]):null;
        const text = request.includes('FIXTURE_WRITING_CHAT') ? '```markdown\n# Recovered complete paper\n\nAn explicit writing fixture.\n```' : review ? 'Annotation proposal ('+session.sandbox+').\n\n```'+review.format+'\n'+review.source.replace('First sentence explains the idea.', 'First sentence explains the idea clearly.')+'\n```' : request.includes('FIXTURE_LEAN_DRAFT') ? '```lean\ntheorem retained_draft : True := by trivial\n```' : request.includes('FIXTURE_CHILD') ? 'Root completed and verified both demos' : request.includes('FIXTURE_LONG_CHAT') ? Array.from({length: 12}, (_, i) => `### Diagnostic ${i + 1}\n\nThis is a long conversation layout fixture, not a scientific finding. We inspect the recorded baseline and keep uncertainty separate from observations.\n\n- Sample size: **100**\n- Equation: \\(y = \\beta x + \\epsilon\\)\n- [Baseline diagnostic](artifacts/figures/nested/baseline.svg)\n\n\`\`\`python\nprint({"diagnostic": ${i + 1}, "status": "complete"})\n\`\`\``).join('\n\n') : request.includes('FIXTURE_PROMPT') ? JSON.stringify({prompt, ...session}) : request.includes('FIXTURE_CODE') ? '```powershell\nGet-Location\nGet-ChildItem\n```' : request.includes('FIXTURE_STATE') ? JSON.stringify({...session, turnEffort: p.effort}) : 'Created the project scaffold and recorded the requested research plan.';
        event('item/completed', {item: {type: 'agentMessage', text}});
        event('turn/completed', {turn: {status: 'completed'}});
      }, 140);
    }
    send({id, result});
  } catch (error) { send({id, error: {message: error.message}}); }
}
