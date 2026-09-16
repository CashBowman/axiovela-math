# Projects and manuscript navigation

## Saved projects

Use **Projects**, beside the tabs, to search saved names, folder paths and research questions. Pins appear first, followed by recently opened projects. Closing a tab keeps its history entry. Opening it again restores the existing project identity instead of creating another tab or another project.

**Connections & manage** opens a temporary dialog. The default graph shows the selected project's neighborhood; Overview shows the indexed collection. Selecting a node does not switch projects. Use **Open in tab** when ready. Escape closes the dialog and restores focus and the previous document selection. Manuscripts, queued feedback, conversations and current reading panels are not reset by opening or dismissing this dialog.

- **Pin** changes ordering only.
- **Locate** reconnects a moved project folder after validating its `axiovela-math.project.json` identity. The project ID stays the same.
- **Remove from list** hides the entry. It does not delete files, close tabs, erase conversations or remove connections. Reopening the saved project unhides it.
- Unavailable folders remain visible. Indexing and reopening them never create an empty replacement.

## Explained connections

Select an edge with the mouse or focus it and press Enter/Space. The explanation includes its origin and recorded evidence locations. The relationships list provides the same information without navigating the graph. Close returns focus to the edge.

Blue edges represent recorded experiment membership or exact shared source identities. Gold edges represent explicitly entered user connections. Origins are also written in text. Shared-source links are symmetric; directed relations have arrowheads. Parallel connections use separate curves. Projects use circles and experiments use triangles, with a legend.

Automatic source matches use DOI, arXiv ID (ignoring version), normalized HTTP URL (ignoring fragments and known tracking parameters), or PDF SHA-256. Similar titles or research topics never create an automatic connection. A matching source does not establish agreement, proof or certification. Manual links require two available endpoints, a relation and a meaningful explanation, and support editing/removal. Connections with hidden or unavailable endpoints remain saved for recovery.

The map indexes only registered Math projects and their imported experiment captures. It does not crawl other folders, contact websites, run models, attach other-project material to a chat, or grant access to another project. Existing scientific connections inside each Library remain separate and authoritative for that project.

## Storage and compatibility

The revisioned workspace remains the authority for project IDs, navigation metadata (`navigation.pinned`, `navigation.hidden`, `navigation.lastOpened`) and `projectConnections`. There is no second catalog file. Folder lookup uses the saved project's `folder` when present, with `project-folders.json` and the original internal folder convention as compatibility fallbacks. Relocation updates the revisioned `folder`; it never copies or rewrites project contents.

Manual edges have a stable UUID, `from`, `to`, `type`, `description`, `origin: "user"` and update timestamp. Their endpoint shapes match the Axiovela navigator:

- `project:<Math project ID>`
- `experiment:<Math project ID>:<encoded capture-batch/capture-ID>`

Math's experiment endpoint refers to its immutable imported capture, not a mutable external run directory. Opening it selects the corresponding Library evidence item. Axiovela and Math do not share writable profiles or synchronize project IDs; cross-app synchronization is not implemented.

`GET /api/project-catalog` reads only the saved list and folder availability. `?graph=1` derives graph details on demand. POST changes require the current workspace revision and use the existing serialized, atomic Store save. Conflicting windows receive a conflict instead of overwriting newer state. Corrupt registries/state are not replaced with empty catalogs. Descendant symlinks and traversal are rejected by contained-path checks.

Bounds: 100 workspace projects, 1,000 sources per project, 200 captures per project/300 total, 1,000 derived source-pair links, 1,000 manual links, 4 MB per capture metadata file. Legacy PDF hashing reads at most 24 MB per file and 128 MB per graph request; hashes are cached in memory. Warnings explain unavailable or truncated metadata, which remains unchanged.

## Manuscript result numbering

Certificates follows the currently selected Markdown or LaTeX manuscript format. Use the same result numbers as the paper, normally a shared counter within each section. The panel groups results by manuscript section and orders them as written. Supporting dependencies remain clickable. A proof appears under its parent result, with no separate invented proof number. Results absent from the manuscript appear under **Working results**, without paper numbers.

Stable result IDs keep certificate mappings, links and annotations independent of numbering. The assistant instructions require these anchors when writing:

```markdown
## 2. Stability
### Lemma 2.1: Uniform control
<!-- axiovela-result: idea:uniform-control -->

The statement, assumptions and proof go here.
```

Markdown uses the visible heading's exact number. An existing uniquely matching numbered heading can also be recognized without an anchor; ambiguous matches remain working results. When reordering Markdown results, update their headings and cross-references together.

```latex
\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
% Inside the document:
\begin{lemma}[Uniform control]\label{idea:uniform-control}
The statement goes here.
\end{lemma}
```

LaTeX numbers come from the actual successful compile's auxiliary labels, preserving custom counters and appendix numbering. Uncompiled or changed source says **render to number**; stale compiler labels are never used for new source. The app recognizes explicit result environments and anchors in the main document; arbitrary macro-generated or included result environments are not inferred. Independent Markdown and LaTeX drafts are never rewritten to synchronize their numbers. No label or connection grants verification status.

## Local checks

```sh
npm test
npm run build
npm run test:projects
npm run test:results
npm run test:annotations
npm run test:reading
npm run test:reader
npm run test:ui
```

`AXIOVELA_PROJECT_TEST_BINARY=/absolute/path/to/axiovela-math npm run test:projects` exercises the navigator against a packaged Linux app using disposable projects and an isolated desktop profile. Native Windows/macOS acceptance remains separate from local cross-packaging.
