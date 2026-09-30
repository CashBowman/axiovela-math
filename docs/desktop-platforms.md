# Desktop builds

Version **0.1.21** is published from local builds. GitHub Actions remain disabled. [Downloads](https://github.com/CashBowman/axiovela-math/releases/tag/v0.1.21) include Linux x64 AppImage/archive, Windows x64 EXE/ZIP, and Mac Apple silicon/Intel DMG/ZIP. Linux is validated locally; native Windows/Mac acceptance remains pending. Windows is unsigned; Mac bundles are freshly ad-hoc signed without Developer ID signing or notarization.

## Build commands

Use Node.js 22.13+, npm, Git and the checked-in lockfile. Linux cross-builds also need `tar` and `zip`. Windows NSIS generation requires a complete Wine installation on non-Windows hosts. Run `npm ci` first.

```sh
npm run desktop:package:windows
npm run desktop:package:mac
npm run desktop:package:mac:intel
```

On Linux without Wine, install Podman and run `npm run desktop:package:windows:container`. This uses a digest-pinned official electron-builder image locally, mounts only this checkout and the build-tool cache, and does not mount host credentials. The upstream Wine 1.0.1 bundle lacks PE builtins, so this workflow deliberately uses the complete Wine installed in the container. The image download requires about 5 GB of disk space.

- Windows: unsigned x64 NSIS installer and portable ZIP. The installer defaults to the current user, allows choosing a directory, does not launch automatically, and preserves application data on uninstall. Windows ARM is not a validated target.
- Mac: Apple silicon by default on Linux; on a Mac the default matches the host architecture. The Intel command always selects x64. A Linux build produces an **unsigned app ZIP for development**, not a completed Mac installer. Framework signing and launch acceptance remain pending.
- On a Mac, `npm run desktop:package:mac -- --dmg` or `npm run desktop:package:mac:intel -- --dmg` signs the final app ad hoc, verifies its signature, and creates a DMG and ZIP. These builds are not notarized or signed with a Developer ID. Product distribution will require a separate, explicitly authorized signing/notarization step and Gatekeeper testing. No signing credentials are read by these scripts.
- Linux: `npm run desktop:package:linux` retains the existing AppImage and archive workflow.

The output is under `out/installers/<platform>-<arch>/`, with `SHA256SUMS`, `START-HERE.txt` and `build-report.json`. Outputs are ignored by Git. Never interpret a successful cross-build as a successful native launch.

### Unsigned DMG containers on Linux

After building the Mac app bundles, install the host HFS+ formatting/checking utilities and compile the pinned Mozilla `libdmg-hfsplus` tools using the commands in `scripts/package-unsigned-dmg.py`. Then run:

```sh
python3 scripts/package-unsigned-dmg.py arm64
python3 scripts/package-unsigned-dmg.py x64
```

This creates genuine compressed UDIF images with HFS+ volumes, the existing app bundle and an Applications shortcut. It does not sign or modify the app. Each build checks the filesystem before and after compression and extracts the image to compare every app file, permission and symbolic link against its source. The adjacent `.dmg.validation.json` records the digest and checks; existing release assets and manifests are not replaced. The build refuses to overwrite an existing DMG. Tool logs stay in `.local/dmg-tools/` and temporary volumes are removed. These containers still require mount, signing, Gatekeeper and launch testing on the target Mac.

## Packaging and tool integrity

`scripts/package-desktop.mjs` creates a fresh stage from reviewed runtime paths, the production UI and production dependencies. It omits optional native dependencies and rejects unexpected native add-ons rather than accidentally shipping host binaries. Desktop PDF rendering runs in Chromium. Workspaces, provider credentials, private docs, reports, development scripts and signing keys are excluded. Target-specific temporary directories allow independent platform builds without packager cleanup conflicts.

Tectonic 0.17.0 downloads come from the upstream release. Each archive is checked against the pinned SHA-256 in `scripts/desktop-targets.mjs`; the binary digest and target are recorded in the app. The runtime uses a bundled compiler only when its manifest matches the actual OS and architecture. Node.js is provided by Electron. The icon containers are generated from the approved Math mark; the artwork is unchanged.

The clean packaging, platform tool pins and ad-hoc Mac signing approach follow Axiovela. Electron documents that [Mac code signing requires a Mac](https://github.com/electron/packager#building-windows-apps-from-non-windows-platforms); [electron-builder documents cross-platform build limits](https://www.electron.build/multi-platform-build.html).

## Current limitations and native acceptance

Windows and Mac cross-builds still require target-OS acceptance:

1. Install, launch, close, relaunch and upgrade over a previous build. Verify the stable profile, single-instance lock and project persistence, including paths containing spaces and non-ASCII characters. Test uninstall without deleting user data.
2. Verify native menus, clipboard, file dialogs, full-screen PDF zoom and annotation feedback. Exercise unsaved-edit and running-assistant close protection.
3. Render a real LaTeX document with bundled Tectonic. Confirm independent Markdown/LaTeX drafts and source navigation.
4. Connect a provider using an isolated test account. Check CLI lookup, API-key encryption with the OS credential store, simultaneous conversations and cancellation. No live accounts are used by automated fixtures.
5. Install Elan manually using the [Lean installation guide](https://lean-lang.org/install/), preserve the project's pinned toolchain and dependencies, and run an actual Lean check. One-click setup is available on Linux and macOS. Compiler success remains distinct from full mathematical certification.
6. Verify Windows publisher/signature handling or Mac signing, notarization and Gatekeeper handling before distribution beyond approved testers.

Help → Check for updates uses signed public release metadata and guides manual installation. The app never contains a GitHub token.

Earlier releases had native Windows x64 and Apple silicon acceptance, preserved in Git history. This release retains those platform fixes; its rebuilt Windows and Mac artifacts still require fresh native acceptance.
