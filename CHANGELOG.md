# Changelog

## 0.1.15-beta.1 — 2026-09-16

Private preview. Linux x64 has local native acceptance. Windows x64 and Mac Apple silicon/Intel downloads are unsigned cross-builds; native signing and launch validation remain pending. Mac downloads are app ZIPs, not finished DMG installers.

- Check linked Lean theorems and transitive axioms after successful compilation; distinguish unfinished proofs and extra assumptions. Automatically check saved assistant formalizations in project-editing mode when Lean is available.
- Use concise proof progress labels while preserving the existing colors and the distinction between formal proof checks and assistant statement matching.
- Recover from a rejected Codex session resume caused by another active writer by copying saved history into a new session. Preserve the original and never replay an already submitted turn.
- Repair invalid PDF metadata titles, refresh older source metadata, and consolidate duplicate sources while preserving aliases, notes, citations, and recovery backups.
- Position annotation popovers before their first visible paint. Reduce repeated Markdown/KaTeX rendering, unchanged chat refreshes, idle timers, and annotation text scanning.
- Request shorter executive summaries and make the assistant responsible for routine formalization repair and statement assessment.
- Include project search/pinning, explained project connections, manuscript-linked result numbering, and local proof-attempt memory introduced since 0.1.13.
- Add direct platform download buttons, installation guidance, and explicit validation limits.

Checks use isolated provider fixtures without paid model calls. Compilation alone does not certify an informal mathematical claim or novelty.

## Earlier releases

See [GitHub release history](https://github.com/CashBowman/axiovela-math/releases). Repository access is required.
