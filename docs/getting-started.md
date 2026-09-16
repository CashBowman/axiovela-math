# Getting started

Sign in to GitHub with repository access and open the [0.1.15-beta.1 downloads](https://github.com/CashBowman/axiovela-math/releases/tag/v0.1.15-beta.1). Linux x64 is validated. Windows has an unsigned preview installer; Mac downloads are unsigned development app ZIPs awaiting native signing and testing. See [platform status](desktop-platforms.md).

On Linux, download the x64 AppImage. Allow execution in file properties if required, then open it. The portable archive is an alternative: extract it and open `axiovela-math`. Node.js is included in the desktop download.

1. Create a project with the plus button. The app handles its files.
2. Use the connection button below chat to connect a CLI account or API provider. Installation and sign-in commands are available beside each provider.
3. Ask a mathematical question in Research. The assistant chooses relevant methods from your request and saves working arguments in the project.
4. To formalize a result, open Lean Certificates and use **Set up Lean**. The terminal installs tools and mathematical libraries and runs a small compiler/import test. It shows failures and supports retry. A CLI command is available in Setup details. Existing proof files and pinned versions are preserved. The assistant can then create formal source, readable notes and obligations; **Run Lean check** checks the saved entry file and linked theorems, including transitive unfinished proofs and extra axioms.
5. Use Write-up for the final manuscript. Markdown and LaTeX drafts are independent; **Render document** compiles the LaTeX draft with bundled Tectonic.

Research, Library and Lean share conversation history, model selection and drafts. Writing has a separate assistant. New research conversations allow project edits; existing read-only choices remain intact. When Lean is installed, project-editing and full-access chats trigger checks of saved formalization changes. Read-only chats inspect files without running Lean. An explicit check in the Lean panel does not silently change conversation permissions.

Library can import selected Axiovela experiments as evidence snapshots and connect papers or evidence to claims. Observations never become proved claims automatically. Opening the same project directory in both apps is not a supported conversion workflow.

The setup-tested Lean/mathlib baseline is v4.19.0. Existing projects can use another pinned official release. Missing basic Linux utilities may require your administrator password; Lean installs per user. The first setup needs internet and several GB of disk space. Source, compiler status, statement correspondence and full certification are separate states.

During private development, download updates from the release page. **Help → Check for updates** explains this manual workflow. Finish current work and close the app before replacing application files. Profiles and project folders stay separate from application files. Keep the previous app until the new one works. The app does not perform automatic replacement or downgrade.

## Library and project tabs

The search field filters saved items by title, author or arXiv identifier. Paste an arXiv abstract URL, PDF URL, or identifier such as `2502.02150`, `2302.03660` or `2302.03660v3` into that same field to import immediately. You can also type one and press Enter. Ordinary search text only filters your existing library. It retrieves the PDF, records the resolved version and authors, and adds a BibTeX entry. If the arXiv API is temporarily unavailable, the importer tries the paper’s canonical abstract-page citation metadata. Existing entries are selected without duplication; use an explicit version ID to import another version. New entries and the bibliography save automatically. Use the checkbox beside a source to record whether you have read it. This does not change the assistant’s knowledge or verify a citation.

Close a project tab with its × button. Closing saves workspace edits and keeps its project files and conversations. Reopen it through **File → Open project**. **Reset layout** in the top bar restores the current panel arrangement. **Bring experiments** opens the Axiovela import workflow from the same toolbar. Closing a tab does not stop an active assistant.

Write-up uses Axiovela’s source-editor and preview arrangement. Its actions menu contains source reload, submission checks and image insertion. Drop PNG, JPEG or WebP images on a source line, or insert them at the cursor. Images stay in the project’s `writeups/assets/`; LaTeX rendering copies referenced images into its isolated export folder.

Claims are optional, revisioned statements that sources and experimental evidence can refer to. They do not gate chat or Lean formalization. Recorded relationships express an interpretation, and an informal status is not formal verification.

## Automatic saving and review

Workspace edits, manuscript text, bibliography and comments save automatically after a short typing pause. Normal saving stays quiet. A failed or conflicting save displays a recovery action; it never silently overwrites an external manuscript revision. Use Write-up actions to load an assistant's saved draft when needed. Prior source files are retained in the project's `writeups/backups/`; local drafts and replaced editor text also remain in workspace recovery/history.

Expand the Library reader or manuscript preview with its corner expand button; Escape restores the panel. The PDF reader scrolls continuously through all pages and retains page arrows, zoom, fit width and an external PDF link. Pinch to zoom where the trackpad supplies Chromium pinch events; Ctrl+= / Ctrl+plus and Ctrl+minus also zoom the focused or expanded reader.

In Write-up, select a sentence or passage and choose **Add to message**. Notes appear as removable blurbs above the Publication Assistant composer. Add your own text and press the normal **Send** button when the whole message is ready. Nothing is sent when a note is added. **Review proposed revision** shows the response's changes; only **Apply revision** replaces the draft. Export source and PDF from the preview toolbar; export annotations from the source panel's three-dot menu. See [the annotation workflow and limits](annotations.md).

Double-click a Markdown preview block to select its originating source line. In a newly rendered LaTeX PDF, double-click a passage to navigate using compiler-generated SyncTeX data. Navigation restores an expanded preview so the source is visible. This is approximate line-level navigation for the main manuscript; it cannot recover LaTeX from imported research PDFs. Render again after source or bibliography changes. See [the implementation and its limits](math-harness.md).

## Defaults and project commands

Use the three-dot button beside the Markdown/LaTeX toggle to choose the default write-up format on this device. Projects with an explicit saved format choice keep it, and neither draft is converted or overwritten.

The tab strip's **+** opens a compact folder dialog. Enter a new project name (created under the app's projects folder) or a full path; the desktop offers **Browse folders**. Existing folders registered in this workspace reopen their current project and tab. Empty folders can become new projects. Unrecognized nonempty folders are left untouched; this is not a cross-app or cross-profile project importer.

Use **File → Open project** for recent/closed projects. Workspace export, recovery export, research version history and the app-data folder are separate File commands. Browser previews provide a small File menu in the toolbar. Workspace JSON does not contain PDF files, experiment capture files or provider conversation files; those remain in their local folders.

## Organize sources

Paste an arXiv abstract link, PDF link or identifier into Library to import its PDF and citation. Other HTTP(S) links save a web source, or a PDF when the response is a PDF. Public HTML pages get a local plain-text reading snapshot where extraction succeeds. Images, interactive content, sign-in pages and paywalls may require **Open original**; a failed preview still leaves the link saved. The app does not bypass site access restrictions.

Use **All items**, **Papers & PDFs**, **Web pages**, **Unread sources**, **Experiments** or **Claims** to filter the list. Search also matches titles, authors, arXiv IDs and source URLs. Source titles can be corrected in Notes; a read checkbox records your reading state. Web/PDF imports add minimal BibTeX entries; verify bibliographic metadata before publication.

Project PDFs saved into `papers/` and explicit web citations from saved assistant replies are indexed automatically. Discovery stays inside the chosen project; it does not scan personal folders. Existing records retain their notes and reading state. Explicitly cited web pages are initially saved as links; paste one again to retrieve a reading snapshot. Chat source chips open their Library record instead of exposing provider directive syntax. Unresolved references remain labeled as unindexed rather than claiming the file was read.

**Connections** shows a reference graph with typed colors, connected-node emphasis, pan/zoom and local connections. The graph follows the Library filter and includes every matching item. The relationship list provides exact labels. Edges are recorded relationships and experiment associations, not automatically inferred mathematical implications.

Switching away from Library preserves its selected source, PDF canvas and reading position. Expanding the PDF reader fits it to the wider panel even after manual zoom. Markdown fullscreen uses a larger reading size and a limited text-column width.

## Navigate projects and results

**Projects** beside the tabs searches saved names, paths and questions. Pin frequently used projects or open **Connections & manage** to inspect shared sources and saved experiment membership. Add a manual connection with an explanation when the relationship needs your judgment. Missing folders can be relocated; removing an entry only hides it.

Lean Certificates follows the chosen manuscript’s section order and stable result anchors. Markdown shows the paper’s visible heading numbers; LaTeX reads the actual compile labels. Results not included in the draft stay under **Working results**. [Numbering conventions and examples →](project-navigator.md#manuscript-result-numbering)

## Lean progress

**Proof checks pending** means saved work still needs a check; **Checking proofs** means a check is running. **Proofs verified** means the linked formal theorems passed proof and axiom checks. **Proof incomplete**, **Uses extra assumptions**, and missing-theorem labels identify work for the assistant to resolve. **Recheck needed** means source files changed after verification. The existing blue, green, and amber colors accompany these text labels.

Lean checks formal statements. The assistant separately assesses their match to your mathematical claims, so a verified formal proof is not a guarantee of that translation or of novelty. Routine code repair and statement assessment belong to the assistant workflow.
