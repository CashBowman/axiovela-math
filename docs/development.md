# Development and validation

The app uses React/Vite, a loopback Node service and an Electron desktop shell. The production desktop includes its Node runtime, UI assets, provider adapters and Linux x64 Tectonic. Lean is installed on demand. `scripts/package-linux.mjs` stages an explicit set of runtime directories and production dependencies; development workspaces and reports do not enter the packages.

The shared assistant and formalization contract are in `server/chat.mjs`, `shared/harness.mjs` and `server/lean-workspace.mjs`. Verifier records are app-owned and separate from model-authored project notes. Claims, evidence and certificate contracts live in `shared/`. Provider adapters imported from Axiovela live in `server/axiovela/`.

## Checks

- `npm test`: contract, provider-protocol, bridge, persistence, Lean setup and update integrity tests. No paid model calls.
- `npm run build`: frontend build.
- `npx playwright install chromium`, then `npm run test:ui`, `npm run test:feedback`, `npm run test:reader`, `npm run test:annotations`, `npm run test:lean`, `npm run test:bridge`: isolated browser workflows.
- `npm run test:updates:ui`: native IPC, signed fixture download, cancellation/retry and active-work preservation.
- `npm run desktop:package:linux`: Linux x64 build, AppImage, archive and SHA-256 manifest.
- `npm run test:desktop:acceptance`, `npm run test:desktop:packaged`, `npm run test:desktop:appimage`, `node scripts/updates-smoke.mjs --packaged`: built-app acceptance.

GUI checks require a desktop session or a configured virtual display and the OS libraries required by Electron/Chromium. Tests produce ignored local evidence. `lean-setup-acceptance.mjs` additionally requires an explicitly provisioned disposable Lean/mathlib environment; it runs real compilers, not model calls. It is not run by default CI.

GitHub CI runs the unit/integration suite and frontend build. Passing CI does not establish acceptance on every Linux distribution or validate paid provider accounts. macOS/Windows builds and unattended installation are not implemented. Direct APIs have permission-gated project tools; prompts cannot guarantee mathematical success or enforce a dollar ceiling.

Keep credentials, research projects, private reports and release signing keys outside tracked source. Use isolated profiles for validation. Before a release, validate the packaged app, preserve earlier binaries, scan the exact tracked snapshot and distributables, then sign the exact artifacts. [Release/update procedure](updates.md).

`test:reader` covers actual Tectonic/SyncTeX navigation, revision-bound comments, pasted arXiv import, reader expansion and autosave conflicts. It uses temporary project data and no paid model calls. The arXiv import interaction is fixture-backed; live availability depends on arXiv.

`test:annotations` covers whole-sentence and multi-paragraph selection, Markdown equations/figures, PDF zoom/reflow, print cleanliness, persistence, keyboard dismissal, combined text and annotation attachments through a read-only fixture provider, and explicit/stale proposal acceptance. The packaged desktop acceptance also exercises sentence annotation and margin pins, native File commands and symmetric PDF zoom shortcuts. [Annotation architecture and limits](annotations.md).

The continuous reader reserves all page sizes but only renders nearby canvases. Tests check pixel content before clicking, stable fit width, multi-page scrolling, page arrows and synthetic pinch/keyboard input. Physical trackpad/driver behavior needs device acceptance. Project tests cover opening canonical registered folders, preserving unrelated directories and rejecting stale workspace revisions.

## Source organization and document parity

`npm run test:library` covers actual provider message accumulation, readable citations and unsent follow-ups, automatic project-PDF indexing, source filters, reference-graph controls, retained PDF canvas identity across workspace switches, fullscreen fitting and preliminary-paper synchronization in the selected format. Web extraction and blocked-fetch fallback have isolated unit tests; the browser test supplies a deterministic page snapshot. No paid provider account is used.

`server/library-sources.mjs` handles bounded source fetches, readable text extraction and project-local discovery. Outbound requests pin the checked public DNS address and revalidate redirects. Web text is untrusted source data and never mounted as HTML. `shared/assistant-output.mjs` parses UI directives into inert data; React renders source and follow-up controls. `src/ConnectionsGraph.jsx` uses a stopped force simulation for a stable, interactive reference layout; edges come only from recorded relationships.

The write-up header and preview toolbar follow Axiovela's source badge, format pills, bibliography/overflow placement and gold rendering action. Annotate remains an additional action. Secondary manuscript commands share the same three-dot control. The full-size hidden Library workspace retains its reader; its hidden chat is unmounted to preserve a single active shared-chat composer.

Native zoom acceptance also guards the interaction between manual zoom and a pending fit-to-width observer: manual zoom disables fit synchronously, before React effect cleanup. This prevents a resize notification from replacing the requested scale.
