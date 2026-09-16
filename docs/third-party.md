# Third-party notices

Axiovela Math is MIT licensed, copyright Cash Bowman. Provider adapters, setup components, the product mark and guided update code derive from [Axiovela](https://github.com/CashBowman/axiovela), also MIT licensed. Axiovela Math adapts the update formats, repository identity, workspace compatibility and immutable-release metadata policy.

The bundled target-specific Tectonic 0.17.0 binary comes from the official Tectonic release recorded in each package’s `desktop/tools/build.json`; Windows/macOS archive hashes are pinned in `scripts/desktop-targets.mjs`. Its license is included in `desktop/licenses/tectonic.txt`. Tectonic is MIT licensed and contains components under other open-source licenses; see the [Tectonic project](https://github.com/tectonic-typesetting/tectonic).

React, Vite, Electron, KaTeX, Citation.js, Lucide, Manrope, DM Mono and other dependencies retain their licenses in their distributed packages. Electron's license and Chromium notices are included in the desktop distribution. The update verification key is public; its private signing key is never distributed.

Lean, Elan and mathlib are downloaded from their upstream projects during user-triggered setup and retain their upstream licenses. They are not copied into the Axiovela Math application package.

The manuscript source-line drop helper (`src/writeup-insertion.mjs`) is reused unchanged from Axiovela under MIT. Its SHA-256 is `82e33fd1f8bec2629e06995d2b7a7e9363011a8b9b1d018613d57be0f1cb1d87`. The Math icon is a generated variation of the Axiovela compass with an integral symbol.

The integrated PDF reader uses Mozilla PDF.js (`pdfjs-dist`), Apache-2.0 licensed. Its license and notices remain in the distributed dependency. SyncTeX records are emitted by the bundled Tectonic compiler; the app parses those records with its own line-navigation code.

`src/WriteupFormatMenu.jsx` adapts Axiovela's MIT-licensed three-dot default-format control. The compact project dialog follows Axiovela's layout. Annotation composer interactions were independently implemented after inspecting Lavish 0.1.62's queued-prompt UI; Lavish runtime code is not bundled.

The source reader uses Mozilla Readability (Apache-2.0) and LinkeDOM (ISC); the reference graph uses D3 Force (ISC) and its dependencies. Their licenses remain in the distributed dependency packages. Axiovela's provider adapter has a Math-specific message-accumulation change; its permission, session and root-turn filtering behavior is preserved.

The Windows/macOS packaging workflow independently adapts Axiovela’s MIT-licensed platform tool pins, clean staging approach and ad-hoc Mac signing settings. `desktop/entitlements.mac.plist` uses its minimal JIT entitlement. Windows ICO and Mac ICNS containers preserve the approved Math mark.

The README installation buttons adapt Axiovela’s MIT-licensed SVG download cards, with Math-specific platform labels and destinations.

The Projects dropdown and connections dialog adapt Axiovela's MIT-licensed `ProjectNavigator.jsx` and `project-navigator.css`. The Math catalog independently adapts its interaction contract to the existing Math workspace store, folder registry and experiment captures.

Navigator reference snapshots: `ProjectNavigator.jsx` SHA-256 `1ec5f66f2803e08d2a2b594e2dce454aca09f7f0ed643edabafa5d45e1a02339`; stylesheet SHA-256 `b070351ec170c837c5b49ee5ab5599a9a472972610aa6a492eb5e8fb0ec720b2`. The original checkout was inspected without modification.
