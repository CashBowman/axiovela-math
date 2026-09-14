# Axiovela Math

A Linux-first workspace for mathematical research, experimental evidence, Lean checks and publication writing.

[Download for Linux](https://github.com/CashBowman/axiovela-math/releases/latest) · [Getting started](docs/getting-started.md) · [Report an issue](https://github.com/CashBowman/axiovela-math/issues)

- **Research:** executive summary, rendered mathematical arguments and a research assistant.
- **Library:** papers, bibliography, claims, notes and connections between ideas. Bring selected experiments from [Axiovela](https://github.com/CashBowman/axiovela) into immutable evidence snapshots.
- **Lean Certificates:** formalization notes and actual checker results, with one-click Lean/mathlib setup. Research, Library and Lean share the same conversation.
- **Write-up:** final manuscript editor, Markdown/LaTeX preview, PDF rendering and a separate publication assistant.

Panels resize and retain their layout. Projects, conversations and writing stay on your computer. Connect Codex, Claude Code, Gemini CLI, OpenCode or Pi through CLI authentication, or use OpenAI, Anthropic, Gemini and compatible APIs. Account access and usage costs belong to the chosen provider.

This is an early Linux x64 release. Tectonic is bundled for LaTeX rendering; first use may download TeX resources. Lean and mathematical libraries download through **Lean Certificates → Set up Lean**, which runs a real installation test. First setup needs internet and several GB of storage. A successful compiler run is not a complete mathematical certificate or a novelty check.

**Updates** in the app and **Help → Check for updates** offer signed, verified downloads with progress, cancellation and retry. Installation is guided; the app does not replace itself or interrupt your research automatically. [Update details](docs/updates.md).

## Development

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174`. To build and run the desktop app:

```sh
npm run desktop:start
npm run desktop:package:linux
```

Linux packages are written to `out/installers/`. For a user-level application-menu installation from a local build, run `node scripts/install-linux.mjs`. For the browser build, run `npm run build && npm start` and open `http://127.0.0.1:8791`.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

See [development and validation](docs/development.md), the [prompt playbook](prompts/README.md), and [third-party notices](docs/third-party.md). Tests use isolated provider fixtures and make no paid model calls. macOS and Windows packages are planned; only Linux x64 is currently shipped.

## Data and privacy

The desktop stores its profile in the OS application-data directory. **File → Open app data folder** locates it. Back up that directory and any project folders stored elsewhere. The browser preview uses ignored `.workspace/` by default, independently of the desktop profile. Desktop API keys require OS encryption; CLI sign-in remains with the provider. Selected project context is sent to the chosen AI provider when you request assistant work. Direct API connections do not automatically include web browsing.

The public repository and release packages exclude development workspaces, conversations, private reports, credentials and signing keys. MIT licensed; see [LICENSE](LICENSE).
