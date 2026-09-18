# Changelog

## Unreleased

- Publish the audited source under the MIT license with public-beta installation guidance, a product tour, security and contribution policies, and manual-only release operations.
- Enable signed guided-download checks in future source builds. Existing 0.1.16 beta installers continue to use their original manual-update flow.

## 0.1.16-beta.3 — 2026-09-17

Windows x64 validation release. The unsigned NSIS installer and portable ZIP are built on Windows with the pinned Tectonic compiler, and the packaged and installed apps pass native launch/relaunch storage and backend-shutdown smoke tests. Silent install and uninstall are verified from a path containing spaces. Browser-mode Axiovela project selection now uses a fixed native Windows folder chooser.

Windows test fixtures no longer assume POSIX executable scripts or automatic Lean setup. Chromium smoke-test screenshots use software rendering on Windows to avoid compositor-only capture failures without changing normal application launches.

The installer is not Authenticode signed. A warning-free trusted channel still requires a protected code-signing certificate and a separately reviewed signed build.

## 0.1.16-beta.2 — 2026-09-16

macOS repair release. The Apple silicon app is assembled and ad-hoc signed on macOS, its resource seal is verified before packaging, and the native DMG is exercised with launch/relaunch storage smoke tests. macOS now uses its native folder chooser and supports the same guarded one-click Lean/Mathlib setup as Linux, including the built-in `shasum` checksum utility.

The DMG is not Developer ID signed or notarized. Gatekeeper-ready public distribution still requires Apple signing credentials and notarization.

## 0.1.15-beta.1 — 2026-09-16

Linux x64 beta. Linux x64 has local native acceptance. The Windows and macOS artifacts produced alongside this release were cross-build previews; later platform-specific releases supersede them.

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

See [GitHub release history](https://github.com/CashBowman/axiovela-math/releases).
