# Updates and releases

**Public beta:** Downloads are available from GitHub Releases. Release artifacts are built, tested and uploaded locally; GitHub Actions is not used to build or publish them. See [platform status](desktop-platforms.md).

Download the **0.1.16-beta.3 Windows x64 installer** from its [release page](https://github.com/CashBowman/axiovela-math/releases/tag/v0.1.16-beta.3). It is built and install/launch/uninstall tested on Windows, but remains unsigned. The 0.1.16-beta.2 Apple silicon DMG is resource-seal verified and launch-tested on macOS, but is not Developer ID signed or notarized. Linux x64 packages remain validated in 0.1.15-beta.1. Mac Intel remains unvalidated and is not offered publicly.

Save work, finish active assistants and exports, and close the app before upgrading. On macOS, open the DMG and drag Axiovela Math to Applications. On Windows, run the per-user installer. On Linux, open the AppImage or extract the archive into a new application folder. Keep the previous copy until the new one works. Preserve application data and separately stored project folders.

The downloadable 0.1.16 beta installers predate the repository's public release and retain a manual-update Help panel. They contain no GitHub account token. Obtain replacements from the public release page.

New public-source builds can discover eligible releases, download assets and verify their Ed25519-signed size and SHA-256 before offering **Show downloaded update**. The updater never replaces the running application automatically. A release without the signed metadata remains a manual download.

No update operation writes project files, changes credentials, executes a downloaded installer, stops an assistant or bypasses unsaved-work protection. Cancellation, network errors and corrupt downloads remove only the current partial download. A fresh launch does not execute a cached artifact. Ordinary updates preserve workspace schema 1; data migrations require their own backup/compatibility design.

## Trust

`desktop/update-config.json` pins the repository and Ed25519 verification key. Each release includes `axiovela-math-update.json`, whose signed payload binds version/tag, workspace compatibility, notes and exact asset hashes/sizes. HTTPS requests and redirects are restricted to GitHub's API and asset hosts. Semver comparison prevents offered downgrades. Unknown architectures and formats are rejected.

Release manifests are immutable and normally have no expiration, so a legitimate published download does not break after a month. If a manifest explicitly includes an expiry, it is enforced. Signed metadata authenticates a release, not the freshness of GitHub's release listing; this is not a full TUF update repository or a guarantee against a compromised publisher. Future key rotation requires shipping the new public key in a trusted release. No signing key or GitHub token is embedded in the app.

## Maintainer release procedure

1. Update the package version, validate source and package with `npm run desktop:package:linux`.
2. Run packaged desktop and update acceptance. Scan the exact public source and release contents for secrets/private data.
3. Commit and tag the reviewed source as `v<version>`, then create a matching draft GitHub release.
4. Prepare a release specification beside the reviewed artifacts with `version`, `tag`, `dataCompatibility: "workspace-v1"`, concise `notes`, and `assets` entries containing `name`, `platform`, `arch` and `format` (`AppImage` or `tar.gz` for Linux).
5. Run `node scripts/publish-update.mjs /absolute/release.json /private/update-ed25519.pem --upload-draft`. The signer verifies that the private key matches the pinned public key, hashes the actual assets, writes signed metadata, and uploads only to a matching draft. It will not replace an existing signed file or release asset.
6. Upload `SHA256SUMS`, review the complete draft, then explicitly publish it. Confirm unauthenticated release discovery, signature validation and downloading through an older-version updater probe.

Keep the private signing key in separate protected storage and back it up securely. GitHub Actions has no signing key and never publishes releases automatically. Signed update metadata currently covers the Linux x64 AppImage and archive assets. The Apple silicon DMG and Windows x64 installer are public beta downloads with explicit platform-trust warnings; Mac Intel is not publicly distributed. The application never embeds a GitHub credential.
