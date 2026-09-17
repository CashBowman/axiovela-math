# Proof-attempt memory

The research assistant maintains a background ledger of concise mathematical attempts. It adds no panel or Library source: an attempt is research history, and presenting it as literature would confuse its provenance. Research, Library and Lean turns share this memory across conversations in the same project. Publication remains a separate workflow.

## Research basis and design choice

- [Reflexion, Shinn et al., NeurIPS 2023](https://arxiv.org/abs/2303.11366) stores textual feedback in episodic memory for subsequent trials. It motivates recording outcomes and lessons, including unsuccessful work, without changing model weights. Its evaluated tasks do not validate this mathematics harness.
- [Voyager, Wang et al., 2023](https://arxiv.org/abs/2305.16291) uses a growing library of reusable skills with environmental feedback. The transferable design idea here is retrieval of reusable partial results with links to their artifacts, not an assertion that a mathematics assistant inherits its Minecraft results.
- [Anthropic, Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) describes persistent structured notes, compact context and retrieval through lightweight file references. This implementation combines a small automatic briefing with optional deeper retrieval.

These sources motivate the design. Lower token use, fewer redundant mathematical attempts and better discovery rates remain hypotheses to evaluate. We deliberately start with deterministic local retrieval; there is no embedding service, background model, extra provider call or cross-project memory.

## Persistence contract

For each writable research turn the server supplies a unique path:

`research/attempts/inbox/<turn-id>.json`

The assistant checkpoints up to eight meaningful routes there, retaining earlier attempts from that turn. It records the exact scope and assumptions, approach, outcome, next step, up to eight labels and evidence references. Casual explanations do not require records. These are concise research summaries, not private chain-of-thought.

At turn completion, cancellation or failure, the server validates the submission and creates:

`research/attempts/records/<turn-id>.json`

The saved record includes conversation/turn provenance, execution status, timestamp and a snapshot of each referenced target from turn admission. A hash binds the original question, claim statement/revision or result-node text to the record. Changing that target makes the entry stale at retrieval. A newly introduced subproblem uses `targetRef: "project"` plus its exact `scope`; subsequent turns can use its stable result ID.

Records are installed atomically and never replaced by the capture routine. Distinct conversations have distinct inboxes; capture is serialized per project. A restart can recover a completed checkpoint from a turn left running. Missing, malformed or unfinished checkpoints cannot produce inferred mathematical outcomes. Invalid input is retained, and a capture failure is reported in the turn's artifact error. Read-only turns retrieve existing records without writing project files.

The input and output schema identifier is `axiovela.proof-attempts/v1`. Each submission has an `attempts` array with:

```json
{
  "id": "diagonal-route",
  "targetRef": "claim:C1",
  "scope": "Normalized diagonal matrices in arbitrary dimension.",
  "approach": "Reduce the bound to the largest diagonal entry.",
  "status": "blocked",
  "labels": ["method:spectral", "obstruction:dimension"],
  "outcome": "The estimate retains a dimension factor; this does not refute the target.",
  "nextStep": "Check whether trace normalization removes the factor.",
  "evidence": ["research/proof.md#diagonal-route"],
  "revisitOf": "",
  "revisitReason": ""
}
```

Statuses are `in-progress`, `blocked`, `unsuccessful`, `counterexample`, `partial-result` and `informal-proof`. All are assistant reports. None can change a claim's review or a certificate's verifier status. A failed provider turn is recorded separately from a failed mathematical approach. Corrections and continuations create new entries: `revisitOf` identifies an existing `<turn-id>/<attempt-id>`, and a nonempty `revisitReason` explains the new premise, evidence, technique or correction. Earlier records remain available.

## Retrieval and context cost

The server ranks attempts by the selected claim/result, query vocabulary and exact labels, weighting less common matching terms more heavily. Current target revisions precede stale ones; recency breaks ties. When the message has no useful lexical match and no selected target, a smaller recent-history briefing supports requests such as “try another route.” Exact duplicate summaries collapse only in the briefing, never in saved history.

Default briefings contain at most eight shortened entries and 6,000 characters of entry data; the recent fallback uses 3,000. These are character limits, not tokenizer-specific budgets. Full records and their precise assumptions remain available at the returned paths. Native agents use their permitted file search/read tools. Direct API agents have an optional read-only `query_proof_attempts` tool with `query`, `targetRef`, `status` and `label` string filters; empty strings omit filters. The current provider prompt is preserved instead of silently dropping its beginning when it exceeds the historical-message limit.

The same read-only query is exposed through `GET /api/proof-attempts?project=<id>&query=...&targetRef=...&status=...&label=...`. No UI depends on this endpoint. Queries expose total/matched/shown counts and warnings about unreadable records, so an empty result is distinguishable from an unreadable ledger.

## Boundaries and evaluation

Recording still requires the assistant to save its checkpoint. Existing chat history is not automatically classified or backfilled. A blocked route is not mathematically impossible, and the harness does not forbid retrying it. Labels and outcomes are model-authored; semantic equivalence between differently phrased approaches is not established. Evidence paths may refer to files that later change; the ledger preserves the attempt summary and target snapshot, not every version of cited artifacts. A user with project-file access can edit the ledger; it is not a tamper-proof audit or verifier record.

Every query currently scans the saved record files. Retrieval is bounded in model context, but very large ledgers may eventually need a local rebuildable index. Fixtures cover preservation, concurrent writes, stale targets, query limits, revisits, malformed files, access boundaries, restart recovery, native session integration and API tool protocols. They do not measure research performance. A future evaluation should compare the same model/task/budget with and without memory, grading exact-target success, repeated unsuccessful routes, token/time costs and incorrect reuse of stale reports.

Implementation: `server/proof-attempts.mjs`, `server/chat.mjs` and the optional query hook in `server/axiovela/assistant-api.mjs`. Imported adapter provenance hashes continue to describe the original import; the optional tool and current-prompt retention are local changes.

If a syntactically valid `revisitOf` cannot be found among saved records, capture now saves the checkpoint with an empty verified `revisitOf` and preserves the reported ID as `unresolvedRevisitOf`. The original inbox and explanation remain intact. Retrieval exposes the unresolved reference without treating it as a confirmed relationship. Older turns rejected solely for a missing predecessor are recovered on conversation load; the prior conversation file is backed up before its error metadata changes. This recovery does not replay assistant requests or alter research conclusions.
