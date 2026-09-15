# Annotating manuscripts and sources

Annotations are always available in the write-up preview, executive summary, proof write-ups and paper reader. There is no mode switch. Click a sentence or drag across a passage, then type feedback in the small popover and choose **Add to message**. Selection expands to complete sentences, including across Markdown paragraphs. Display equations and inserted Markdown figures can also receive notes. With a keyboard text selection inside the preview, Alt+M opens a note; Enter in the feedback field adds it to the unsent message, Shift+Enter inserts a new line, Ctrl/Cmd+Enter also adds it, and Escape cancels it. Composition keystrokes do not submit.

Dragging preserves the native text selection and focus, so Ctrl/Cmd+C copies exactly what you selected. **Copy passage** in the feedback popover copies the full sentence or passage used by the annotation. Click the feedback field to type or paste; adding feedback still requires **Add to message**. The desktop app supplies standard right-click Copy/Paste commands through [Electron menu roles](https://www.electronjs.org/docs/latest/tutorial/menus). Right-clicking does not dismiss a pending note.

Each annotation appears as a small **unsent blurb above the appropriate assistant composer** (Publication for the manuscript, Math for research and sources), matching Lavish's queued-prompt interaction. Click a blurb to edit its feedback, or use its × to remove it from that message. Removing an attachment does not delete the saved annotation. Numbered margin pins reopen notes on the current draft. The separate Comments button and Send feedback action are gone.

## One message, sent when you choose

1. Add as many annotations as needed, then write any additional instruction in the normal chat composer.
2. Review or remove the attached blurbs. They and your text persist separately for each conversation, including after reload. Adding a note makes no provider call.
3. Press the normal **Send** button (or Enter in the composer) once. The message contains your text plus all attached annotations and the exact manuscript revision. It uses the selected provider, which may incur normal provider charges.
4. Open **Review proposed revision** on the completed reply. Compare current and proposed source, then choose **Apply revision** or **Keep current draft**.

The feedback turn uses a fresh read-only provider session and preserves the conversation's usual access setting. Only a successful send clears that conversation's submitted text and attachments. Failed sends keep them available to edit or retry. The message history records the sent feedback and quoted passages. Attachments from different formats or revisions must be sent separately; older notes cannot be applied to changed prose silently.

Accepting a proposal updates only the selected Markdown or LaTeX draft. Normal source-save protection keeps earlier files in `writeups/backups/`. If the manuscript or bibliography changes after the review request, request a new proposal before applying it.

The source panel's **three-dot menu → Export annotations** exports all saved notes, including earlier revisions and notes detached from the composer. Print/PDF from the Markdown preview excludes review controls and highlights.

## Proof write-ups and paper reader

Select a passage in the Executive summary, Proof write-ups or the Library reader. The same sentence/passage selection, popover, margin pins and unsent blurbs apply to proofs, saved website articles and PDF text. Add notes from several sources to the shared Math Assistant conversation, then send them together with your instructions. Each blurb retains the source title, quoted passage and, for PDFs, page number. Clicking a queued source note opens its source for editing.

These research messages use the conversation's existing access setting. Requested summary changes are saved to `research/summary.md` and proof changes to `research/proof.md`; imported articles and PDFs remain source material. A source revision change blocks sending its earlier notes. Publication annotations keep the separate read-only proposal and explicit Apply revision workflow described above. No annotation automatically starts a model call.

## Anchors and limits

Notes retain the document format, exact source/bibliography revision, quoted text and rendered text offsets. PDF notes also store a page and position; figures retain their asset identity. Highlight geometry is recomputed after resizing or PDF zoom. Earlier-revision notes remain stored and exportable but cannot silently relocate or be sent as feedback on a different draft.

- The PDF scrolls continuously through all pages. A text annotation is currently within one page. Scanned pages without a text layer need OCR before text annotation is possible. PDF figures do not yet have region selection.
- Sentence boundaries are a convenience based on English text segmentation. Abbreviations and mathematical notation can be ambiguous; inspect the quoted passage before saving.
- Feedback is limited to twenty notes, 24,000 characters of note data and a 100,000-character draft per request. Providers may impose smaller context/output limits.
- The comparison shows source with surrounding context. It accepts the complete revised draft, not individual change fragments. A reply without exactly one complete matching source block cannot be applied.
- These are app-owned comments, not annotations embedded in a PDF. Export notes separately to share them. Typed but unsubmitted popover text is temporary. Escape, Cancel, an outside click or changing panels dismisses it without attaching anything. Only Add to message creates an attachment.
- Select text in any other readable panel, including the executive summary, claim/connection details, experiment evidence, Lean plans/checks and assistant replies. These notes capture a bounded snapshot of the selected text and nearby context. They route to Math Assistant from Research/Library/Lean and Publication Assistant from Write-up. Snapshots do not assert that a verifier result is current; the assistant must inspect saved records. Inputs, links and buttons retain their normal interactions.

## Design and implementation

The interaction takes inspiration from Lavish's selected-passage feedback and batching. Axiovela's existing colors and controls remain the visual system. Contextual popovers and compact composer attachments follow [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): detailed controls appear when needed. [Zotero's PDF workflow](https://www.zotero.org/support/pdf_reader) supplies a precedent for connecting selected passages to review notes. Revision-bound quotes and offsets draw on the [W3C Web Annotation model](https://www.w3.org/TR/annotation-model/). The preview places render/export controls in its title bar and omits redundant document labels. PDF navigation occupies one slim row underneath. Additional source commands share one three-dot menu, following [menu proximity and scope guidance](https://www.nngroup.com/articles/contextual-menus-guidelines/). The revision comparison uses a native modal dialog with keyboard dismissal and focus containment, consistent with [W3C dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These are design precedents, not a measured usability study of this app.

`src/WorkspaceFeedback.jsx` delegates selection in other readable panels without adding nested scroll containers. The executive summary uses the same precise passage overlays and revision anchors as the other document readers; general panel snapshots retain bounded context and assistant routing. `src/AnnotationChips.jsx` displays unsent attachments and sent feedback. `src/ChatPanel.jsx` persists attachments per project/conversation and sends them with the user's message. `src/AnnotationSurface.jsx` computes highlight overlays without rewriting the renderer's text tree. `src/annotation-dom.mjs` projects visible text, excluding duplicate accessible math representations. `shared/annotations.mjs` expands sentences and parses revision proposals. `server/manuscript-review.mjs` validates selected notes against saved state; `server/chat.mjs` admits a read-only review turn. `src/RevisionReview.jsx` and the editor independently reject stale proposals. The same surface is used for proof and source review. `server/reading-feedback.mjs` validates each source revision independently before combining research notes.

Run `npm run test:annotations` for isolated browser acceptance, including a real Tectonic PDF and a deterministic provider fixture. It does not validate a paid account or the quality of a real model's revision.

## Continuous PDF rendering

The reader reserves the geometry of every page and renders canvases only near the viewport. A stable scrollbar gutter keeps fit-to-width from oscillating. New canvas and text layers render offscreen and replace the visible pair together; the previous image scales during zoom. Each render has its own canvas and cancellation guard, following [PDF.js rendering guidance](https://mozilla.github.io/pdf.js/examples/).

Scroll normally through the paper, use the arrows to jump between pages, or enter a page number. Pinch gestures delivered as Ctrl+wheel zoom around the pointer. Ctrl+=, Ctrl+plus and Ctrl+minus zoom the focused/expanded reader; Ctrl+0 restores fit width. Outside a reader, the native View menu controls app zoom. Native shortcuts follow [Electron's keyboard handling](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts). Synthetic pinch events are tested; physical trackpad behavior can depend on the desktop environment.
