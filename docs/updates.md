# Updates and releases

Download **0.1.23** from the [release page](https://github.com/CashBowman/axiovela-math/releases/tag/v0.1.23). README buttons link to the current assets. Builds run locally with GitHub Actions disabled. Linux x64 is tested locally; Windows x64 and Mac arm64/x64 are cross-built with native acceptance pending. Windows is unsigned. Mac DMGs and ZIPs are freshly ad-hoc signed, without Developer ID signing or Apple notarization.

Save work, finish active assistants and exports, and close the app before upgrading. Run the Windows installer, replace the Mac application from the DMG, or open the new Linux AppImage. Keep the previous copy until the new one works. Preserve application data and separately stored project folders.

**Help → Check for updates** checks public releases and signed metadata, verifies download size and SHA-256, and offers **Show downloaded update**. Installation remains manual; automatic or mandatory application replacement is not implemented.

No update operation writes project files, changes credentials, executes a downloaded installer, stops an assistant or bypasses unsaved-work protection. Cancellation, network errors and corrupt downloads remove only the current partial download. A fresh launch does not execute a cached artifact. Ordinary updates preserve workspace schema 1; data migrations require their own backup/compatibility design.

## Trust

`desktop/update-config.json` pins the repository and Ed25519 verification key. Each release includes `axiovela-math-update.json`, whose signed payload binds version/tag, workspace compatibility, notes and exact asset hashes/sizes. HTTPS requests and redirects are restricted to GitHub's API and asset hosts. Semver comparison prevents offered downgrades. Unknown architectures and formats are rejected.

Release manifests are immutable and normally have no expiration, so a legitimate published download does not break after a month. If a manifest explicitly includes an expiry, it is enforced. Signed metadata authenticates a release, not the freshness of GitHub's release listing; this is not a full TUF update repository or a guarantee against a compromised publisher. Future key rotation requires shipping the new public key in a trusted release. No signing key or GitHub token is embedded in the app.

## Local release procedure (requires explicit publication approval)

1. Update the package version, validate source and package with `npm run desktop:package:linux`.
2. Run packaged desktop and update acceptance. Scan the exact public source and release contents for secrets/private data.
3. Commit and tag the reviewed source as `v<version>`, then create a matching draft GitHub release.
4. Prepare a release specification beside the reviewed artifacts with `version`, `tag`, `dataCompatibility: "workspace-v1"`, concise `notes`, and `assets` entries containing `name`, `platform`, `arch` and `format` (`AppImage` or `tar.gz` for Linux).
5. Run `node scripts/publish-update.mjs /absolute/release.json /private/update-ed25519.pem --upload-draft`. The signer verifies that the private key matches the pinned public key, hashes the actual assets, writes signed metadata, and uploads only to a matching draft. It will not replace an existing signed file or release asset.
6. Upload `SHA256SUMS`, review the complete draft, then explicitly publish it. Confirm unauthenticated release discovery, signature validation and downloading through an older-version updater probe.

Keep the private signing key in separate protected storage and back it up securely. Signed update metadata authenticates the exact release files; it does not provide Windows publisher trust or Apple notarization. Never reuse an old signature for changed binaries. No signing key or GitHub token may enter a package.

## 0.1.19: conversation context and usage

The compact Usage button next to Access shows provider-reported context and account allowance, including quota window reset times. Codex reports root-conversation context and account limits; Pi reports context when available. Missing data is shown as unavailable. Measurements are timestamped turn snapshots, not continuously polled account balances. Changing the selected model/provider hides measurements from the old selection.

## 0.1.20: saved connections and compact usage

Connections are discovered automatically on opening chats; model and reasoning choices persist. New chats reuse their role’s last saved connection without inheriting Full access or a native session. The usage meter stays beside Access and retains the last same-session measurement during a pending follow-up.

## 0.1.21: PDF annotation focus

Persistent passage highlights draw before the Leave feedback popup can receive focus. Regression checks cover immediate focus and visible highlighting while typing. Built locally; Windows is unsigned and Mac packages are ad-hoc signed without notarization.

## 0.1.22: PDF math annotations

Exact drag selection, persistent page-relative highlights, and equation/figure area feedback. Existing annotations remain compatible. The PDF renderer and LaTeX compiler are unchanged. See [release notes](releases/0.1.22.md).

## 0.1.23: query efficiency

Focused API file edits, recoverable backups and concise task delivery. See [release notes](releases/0.1.23.md).
