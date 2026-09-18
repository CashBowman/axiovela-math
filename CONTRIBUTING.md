# Contributing

Thanks for helping improve Axiovela Math.

## Before opening a change

- Search existing issues and keep each change focused.
- Never include API keys, provider sessions, personal paths, private research, application data, signing material, validation reports, or generated packages.
- Preserve ordinary project files, reversible manuscript backups, explicit proof status, and the distinction between observations, conjectures, compiler success, and formal certification.
- Keep release building and signing local. Do not add automatic publishing or credentials to GitHub Actions.

## Local checks

Use Node.js 22.13 or newer and the checked-in lockfile:

```sh
npm ci
npm test
npm run build
git diff --check
```

Run the focused browser, Lean, desktop, or packaging checks described in [Development and validation](docs/development.md) when your change affects those areas. Tests must use isolated fixtures, never live credentials or personal projects.

## Pull requests

Explain the user-visible change, relevant safety boundaries, tests performed, and limitations that remain. UI changes should include a screenshot or short recording with private information removed. Installer claims must name the operating system, architecture, signing state, and native acceptance actually performed.
