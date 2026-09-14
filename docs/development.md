# Development and validation

The app uses React/Vite, a loopback Node service and an Electron desktop shell. The production desktop includes its Node runtime, UI assets, provider adapters and Linux x64 Tectonic. Lean is installed on demand. `scripts/package-linux.mjs` stages an explicit set of runtime directories and production dependencies; development workspaces and reports do not enter the packages.

The shared assistant and formalization contract are in `server/chat.mjs`, `shared/harness.mjs` and `server/lean-workspace.mjs`. Verifier records are app-owned and separate from model-authored project notes. Claims, evidence and certificate contracts live in `shared/`. Provider adapters imported from Axiovela live in `server/axiovela/`.

## Checks

- `npm test`: contract, provider-protocol, bridge, persistence, Lean setup and update integrity tests. No paid model calls.
- `npm run build`: frontend build.
- `npx playwright install chromium`, then `npm run test:ui`, `npm run test:feedback`, `npm run test:lean`, `npm run test:bridge`: isolated browser workflows.
- `npm run test:updates:ui`: native IPC, signed fixture download, cancellation/retry and active-work preservation.
- `npm run desktop:package:linux`: Linux x64 build, AppImage, archive and SHA-256 manifest.
- `npm run test:desktop:acceptance`, `npm run test:desktop:packaged`, `npm run test:desktop:appimage`, `node scripts/updates-smoke.mjs --packaged`: built-app acceptance.

GUI checks require a desktop session or a configured virtual display and the OS libraries required by Electron/Chromium. Tests produce ignored local evidence. `lean-setup-acceptance.mjs` additionally requires an explicitly provisioned disposable Lean/mathlib environment; it runs real compilers, not model calls. It is not run by default CI.

GitHub CI runs the unit/integration suite and frontend build. Passing CI does not establish acceptance on every Linux distribution or validate paid provider accounts. macOS/Windows builds and unattended installation are not implemented. Direct APIs have permission-gated project tools; prompts cannot guarantee mathematical success or enforce a dollar ceiling.

Keep credentials, research projects, private reports and release signing keys outside tracked source. Use isolated profiles for validation. Before a release, validate the packaged app, preserve earlier binaries, scan the exact tracked snapshot and distributables, then sign the exact artifacts. [Release/update procedure](updates.md).
