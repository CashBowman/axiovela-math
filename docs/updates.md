# Updates and releases

**Private development:** Current builds show private distribution in Help and do not contact the public release API. The repository must remain private until Cash explicitly approves a public product release. Do not run GitHub Actions or publish installers during this phase. The public-release mechanism below is retained for future use, not currently enabled. See [local platform builds](desktop-platforms.md).

The native application menu **Help → Check for updates** inspects [GitHub Releases](https://github.com/CashBowman/axiovela-math/releases). Stable is the default; beta releases require opting in. The app also checks quietly 30 seconds after launch and every six hours while running. A release notice can be dismissed. Checks contact GitHub without account credentials or research content.

This is a guided download workflow adapted from Axiovela. Electron has [no built-in Linux auto-updater](https://www.electronjs.org/docs/latest/api/auto-updater), and the shipped formats are AppImage and portable archives. The app downloads a selected format to its own cache and verifies its signed size and SHA-256 before offering **Show downloaded update**. Save your work and finish assistants/exports, close the app, then open the new AppImage or extract the archive into a new application folder. Keep the previous copy until the new one works. If you use an application-menu shortcut pointing at an older copy, update that shortcut to the new executable or run the local build's user-level installer. This release does not automate application replacement or restart.

No update operation writes project files, changes credentials, executes a downloaded installer, stops an assistant or bypasses unsaved-work protection. Cancellation, network errors and corrupt downloads remove only the current partial download. A fresh launch does not execute a cached artifact. Ordinary updates preserve workspace schema 1; data migrations require their own backup/compatibility design.

## Trust

`desktop/update-config.json` pins the repository and Ed25519 verification key. Each release includes `axiovela-math-update.json`, whose signed payload binds version/tag, workspace compatibility, notes and exact asset hashes/sizes. HTTPS requests and redirects are restricted to GitHub's API and asset hosts. Semver comparison prevents offered downgrades. Unknown architectures and formats are rejected.

Release manifests are immutable and normally have no expiration, so a legitimate published download does not break after a month. If a manifest explicitly includes an expiry, it is enforced. Signed metadata authenticates a release, not the freshness of GitHub's release listing; this is not a full TUF update repository or a guarantee against a compromised publisher. Future key rotation requires shipping the new public key in a trusted release. No signing key or GitHub token is embedded in the app.

## Future public-release procedure (requires explicit approval)

1. Update the package version, validate source and package with `npm run desktop:package:linux`.
2. Run packaged desktop and update acceptance. Scan the exact public source and release contents for secrets/private data.
3. Commit and tag the reviewed source as `v<version>`, then create a matching draft GitHub release.
4. Prepare a release specification beside the reviewed artifacts with `version`, `tag`, `dataCompatibility: "workspace-v1"`, concise `notes`, and `assets` entries containing `name`, `platform`, `arch` and `format` (`AppImage` or `tar.gz` for Linux).
5. Run `node scripts/publish-update.mjs /absolute/release.json /private/update-ed25519.pem --upload-draft`. The signer verifies that the private key matches the pinned public key, hashes the actual assets, writes signed metadata, and uploads only to a matching draft. It will not replace an existing signed file or release asset.
6. Upload `SHA256SUMS`, review the complete draft, then explicitly publish it. Confirm unauthenticated release discovery, signature validation and downloading through an older-version updater probe.

Keep the private signing key in separate protected storage and back it up securely. Public GitHub CI has no signing key and never publishes releases automatically. Current artifacts are Linux x64 only. Do not advertise other operating systems until their packages pass acceptance.
