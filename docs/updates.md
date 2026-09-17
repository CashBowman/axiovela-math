# Updates and releases

**Private development:** Current builds show private distribution in Help and do not contact the public release API. The repository must remain private until Cash explicitly approves a public product release. The owner authorized the 0.1.15-beta.1 private preview downloads. Do not run GitHub Actions or change repository visibility. The public-release mechanism below is retained for future use, not currently enabled. See [local platform builds](desktop-platforms.md).

Download the **0.1.16-beta.2 Apple silicon DMG** from the [private release page](https://github.com/CashBowman/axiovela-math/releases/tag/v0.1.16-beta.2), using a GitHub account with repository access. It is assembled, resource-seal verified, and launch-tested on macOS. It remains ad-hoc signed rather than Developer ID signed or notarized. Linux x64 packages remain validated in 0.1.15-beta.1; Windows x64 and Mac Intel packages remain development previews awaiting native acceptance.

Save work, finish active assistants and exports, and close the app before upgrading. On macOS, open the DMG and drag Axiovela Math to Applications. On Windows, run the per-user installer. On Linux, open the AppImage or extract the archive into a new application folder. Keep the previous copy until the new one works. Preserve application data and separately stored project folders.

**Help → Check for updates** explains private distribution and does not contact GitHub's public release API. No GitHub account token is embedded in the app. Private downloads require the browser/release page; authenticated in-app updating is not implemented.

The retained public-distribution updater can download assets and verify their signed size and SHA-256 before offering **Show downloaded update**. It never replaces the running application automatically. This path is disabled in current private builds.

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

Keep the private signing key in separate protected storage and back it up securely. Public GitHub CI has no signing key and never publishes releases automatically. Signed update metadata currently covers the Linux x64 AppImage and archive assets. The private Apple silicon DMG is distributed manually and is ad-hoc signed; Windows x64 and Mac Intel packages remain explicitly marked development previews. No authenticated private-release updater is implemented.
