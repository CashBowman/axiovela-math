# Development and validation

The app uses React/Vite, a loopback Node service and an Electron desktop shell. The production desktop includes its Node runtime, UI assets, provider adapters and target-specific Tectonic. Lean is installed on demand. `scripts/package-linux.mjs` stages an explicit set of runtime directories and production dependencies; development workspaces and reports do not enter the packages.

The shared assistant and formalization contract are in `server/chat.mjs`, `shared/harness.mjs` and `server/lean-workspace.mjs`. Verifier records are app-owned and separate from model-authored project notes. Claims, evidence and certificate contracts live in `shared/`. Provider adapters imported from Axiovela live in `server/axiovela/`.

## Local platform builds

The repository remains private until explicitly approved for public release. GitHub Actions must not be run during this phase. [Windows and macOS packaging instructions and acceptance requirements](desktop-platforms.md) describe local builds and the distinction between unsigned cross-builds and native validation.

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

The write-up header and preview toolbar follow Axiovela's source badge, format pills, bibliography/overflow placement and gold rendering action. Passage annotation is always available without a mode button. Secondary manuscript commands share the same three-dot control. The full-size hidden Library workspace retains its reader; its hidden chat is unmounted to preserve a single active shared-chat composer.

Native zoom acceptance also guards the interaction between manual zoom and a pending fit-to-width observer: manual zoom disables fit synchronously, before React effect cleanup. This prevents a resize notification from replacing the requested scale.

## Reading and concurrent writing

`npm run test:reading` covers empty manuscript formats, proof/website/PDF passage annotations, multiple sources attached to one unsent message, canonical server validation, and a publication draft appearing in the editor. Unit tests keep several fixture conversations active across roles and projects while a publication request completes. This validates isolation and routing, not a paid provider's latency or mathematical quality.

Publication and research conversations have independent controllers. A follow-up in the same active conversation is queued. Artifact synchronization requires two matching observations of each file instead of waiting for every conversation in the project to stop. Source merge bases and stale-save rejection preserve independent edits.

New publication conversations start with project editing; existing access settings stay intact. Writing instructions require actual editable files. For an authorized writing request, an unambiguous complete matching fenced draft can be recovered from chat only if the file still matches its admission snapshot. Ambiguous chat-only replies show an unsaved-output notice. Earlier files are backed up; unrelated formats are preserved.

Website imports retrieve publication metadata, Markdown structure, mathematical notation, raster figures and linked PDFs. Readability and an inert Markdown renderer replace executable page HTML. PDFs are bounded at 128 MB, article responses at 24 MB, and cached raster figures at 16 MB. All remote fetches use public-address validation and checked DNS pinning. Blocked/dynamic sites may still provide only an abstract or an unavailable-preview state with retry. Existing source upgrades preserve IDs, notes, personal read state and edited titles.

During research, the assistant can save `research/connections.json` containing justified relationships between source/claim IDs or exact cited URLs. The importer accepts recognized relation types and existing endpoints, deduplicates edges, and preserves user dismissals. These edges are visibly attributed interpretations, never formal certificates. This follows the metadata-and-attachment pattern in [Zotero's import documentation](https://www.zotero.org/support/adding_items_to_zotero).

## Library connections and compact review

The Library filter selects PDFs, web pages, unread sources, experiments, claims, theorems or proofs. Subdued **AI added source** text marks assistant-origin sources at the right of the source metadata line, aligned with the format/read status. Selecting a map node exposes its source notes and hypotheses on demand; the separate Source context pane is removed. The Math Assistant maintains `research/connections.json` with `nodes`, `sourceNotes` and justified `links`. Legacy arrays of links remain readable. Revision-checked `claimUpdates` invalidate an old review when a statement changes; explicit `removeNodes`/`removeLinks` remove obsolete map items without deleting source files. Claim/theorem/proof nodes are always unverified interpretations; only the verifier owns certification.

The map uses circles for papers, rounded rectangles for websites, diamonds for claims, hexagons for theorems, rectangles for proofs and triangles for experiments, with matching colors and a visible legend. Directed edges have a textual relationship list; contradictions use a dashed line. This combines [Obsidian's neighborhood/graph navigation](https://obsidian.md/help/plugins/graph), [W3C's requirement to supplement color with other cues](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html), and [progressive disclosure of secondary details](https://www.nngroup.com/articles/progressive-disclosure/). Shape denotes role, not truth or proof status.

Source consolidation uses existing IDs/URLs, arXiv identities, available DOI/content hashes, and conservative normalized matching of substantive titles. Generic/short names do not match by title. It retains read state, notes, citation keys and aliases; original files are never deleted. The workspace keeps merge history and the backend writes `backups/before-source-merge-<revision>.json` before saving a consolidation. Title matching is a heuristic, not a bibliographic authority; alternate records and the backup remain available for recovery.

The preview title bar holds Render document, Export source and Export PDF. LaTeX edits and bibliography changes trigger a debounced render after 1.2 seconds, coalesced per project. Earlier render responses cannot replace a newer source. The previous PDF remains visible during compilation; export of an outdated PDF is disabled. A failed render offers the normal retry button and an actual error, without an automatic retry loop. Markdown remains immediately rendered.

`npm run test:connections` exercises duplicate migration/backup, filters and AI attribution, typed graph import, source context, cross-panel feedback routing/dismissal, summary passage highlights, native clipboard selection, and automatic PDF refresh. Fixtures do not establish the mathematical quality of model-authored relationships.

## Result navigation and compact reading

Substantial research tasks now explicitly request a persistent result outline in `research/connections.json`, including claims, proposed theorems, supporting lemmas and proof sketches. Stable IDs update existing nodes; `mainResult:true` identifies intended conclusions. The app imports those artifacts automatically into Library, Connections and the Certificates navigator. Read-only access cannot save the outline, and the instructions exclude casual questions. This is an agent workflow contract, not a guarantee of mathematical success.

Connections have keyboard-focusable, generous invisible hit areas and an on-demand explanation showing endpoints, direction, reason and interpretation status. Reasons render Markdown/math; permanent edge labels are avoided. This follows [W3C keyboard guidance](https://www.w3.org/TR/WCAG22/#keyboard) and [target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), with the existing [Obsidian local graph precedent](https://obsidian.md/help/plugins/graph).

Certificates presents selectable result cards and a central statement/status view. Optional `certificate.json` mappings in `results:[{ref:"idea:node-id",declarations:["Namespace.result"],assumptions:[],obligations:[],scopeNotes:"..."}]` link exact result IDs to assistant-reported formal declarations. Existing top-level plans remain a separate legacy target. Unknown IDs do not attach to another result. The app's project check stays explicitly project-wide: it does not verify that a named declaration establishes an informal result. Source changes invalidate the check; assistant verdict fields never confer certification. Complete per-result statement/axiom/dependency certification is not implemented and the UI does not claim it.

The reader uses a compact title/action row and PDF navigation row. Open original shares the title row; there is no redundant PAPER READER label or standalone link row. Fullscreen tests measure total chrome height (at most 100 CSS px at 1680×1050, below 115 at 1000×720) while retaining readable controls and the PDF's page position.

`npm run test:results` checks fixture-authored result artifacts, lemma filtering, clickable/keyboard edge explanations, independent result states, annotation Enter/Shift+Enter/composition behavior, and real-PDF fullscreen geometry. Fixtures validate software behavior, not real model performance. Existing Lean and annotation suites remain required.
