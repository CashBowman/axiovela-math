# Getting started on Linux

Download the Linux x64 AppImage from [Releases](https://github.com/CashBowman/axiovela-math/releases/latest). Allow execution in file properties if required, then open it. The portable archive is an alternative: extract it and open `axiovela-math`. Node.js is included in the desktop download.

1. Create a project with the plus button. The app handles its files.
2. Use the connection button below chat to connect a CLI account or API provider. Installation and sign-in commands are available beside each provider.
3. Ask a mathematical question in Research. The assistant chooses relevant methods from your request and saves working arguments in the project.
4. To formalize a result, open Lean Certificates and use **Set up Lean**. The terminal installs tools and mathematical libraries and runs a small compiler/import test. It shows failures and supports retry. A CLI command is available in Setup details. Existing proof files and pinned versions are preserved. The assistant can then create formal source, readable notes and obligations; **Run Lean check** checks the saved entry file.
5. Use Write-up for the final manuscript. Markdown and LaTeX drafts are independent; **Render PDF** compiles the LaTeX draft with bundled Tectonic.

Research, Library and Lean share conversation history, model selection and drafts. Writing has a separate assistant. New research conversations allow project edits; existing read-only choices remain intact. Full access permits command execution, including automatic checks after formalization changes. An explicit check in the Lean panel does not silently change conversation permissions.

Library can import selected Axiovela experiments as evidence snapshots and connect papers or evidence to claims. Observations never become proved claims automatically. Opening the same project directory in both apps is not a supported conversion workflow.

The setup-tested Lean/mathlib baseline is v4.19.0. Existing projects can use another pinned official release. Missing basic Linux utilities may require your administrator password; Lean installs per user. The first setup needs internet and several GB of disk space. Source, compiler status, statement correspondence and full certification are separate states.

Use **Updates** or **Help → Check for updates** for new releases. Save your work and close the app before replacing application files. Profiles and project folders stay separate from application files. Keep the previous app until the new one works. The app does not perform automatic replacement or downgrade.
