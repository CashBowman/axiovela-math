# Annotating a manuscript

In **Write-up**, choose **Annotate** in the preview toolbar. Click a sentence or drag across a passage, then type feedback in the small popover and choose **Add to message**. Selection expands to complete sentences, including across Markdown paragraphs. Display equations and inserted Markdown figures can also receive notes. With a keyboard text selection inside the preview, Alt+M opens a note; Ctrl/Cmd+Enter adds it and Escape cancels it.

Each annotation appears as a small **unsent blurb above the Publication Assistant composer**, matching Lavish's queued-prompt interaction. Click a blurb to edit its feedback, or use its × to remove it from that message. Removing an attachment does not delete the saved annotation. Numbered margin pins reopen notes on the current draft. The separate Comments button and Send feedback action are gone.

## One message, sent when you choose

1. Add as many annotations as needed, then write any additional instruction in the normal chat composer.
2. Review or remove the attached blurbs. They and your text persist separately for each conversation, including after reload. Adding a note makes no provider call.
3. Press the normal **Send** button (or Enter in the composer) once. The message contains your text plus all attached annotations and the exact manuscript revision. It uses the selected provider, which may incur normal provider charges.
4. Open **Review proposed revision** on the completed reply. Compare current and proposed source, then choose **Apply revision** or **Keep current draft**.

The feedback turn uses a fresh read-only provider session and preserves the conversation's usual access setting. Only a successful send clears that conversation's submitted text and attachments. Failed sends keep them available to edit or retry. The message history records the sent feedback and quoted passages. Attachments from different formats or revisions must be sent separately; older notes cannot be applied to changed prose silently.

Accepting a proposal updates only the selected Markdown or LaTeX draft. Normal source-save protection keeps earlier files in `writeups/backups/`. If the manuscript or bibliography changes after the review request, request a new proposal before applying it.

The source panel's **three-dot menu → Export annotations** exports all saved notes, including earlier revisions and notes detached from the composer. Turn off Annotate for a clean reading view. Print/PDF from the Markdown preview excludes review controls and highlights.

## Anchors and limits

Notes retain the document format, exact source/bibliography revision, quoted text and rendered text offsets. PDF notes also store a page and position; figures retain their asset identity. Highlight geometry is recomputed after resizing or PDF zoom. Earlier-revision notes remain stored and exportable but cannot silently relocate or be sent as feedback on a different draft.

- The PDF scrolls continuously through all pages. A text annotation is currently within one page. Scanned pages without a text layer need OCR before text annotation is possible. PDF figures do not yet have region selection.
- Sentence boundaries are a convenience based on English text segmentation. Abbreviations and mathematical notation can be ambiguous; inspect the quoted passage before saving.
- Feedback is limited to twenty notes, 24,000 characters of note data and a 100,000-character draft per request. Providers may impose smaller context/output limits.
- The comparison shows source with surrounding context. It accepts the complete revised draft, not individual change fragments. A reply without exactly one complete matching source block cannot be applied.
- These are app-owned comments, not annotations embedded in a PDF. Export notes separately to share them. Typed but unsubmitted popover text is temporary.
- Annotate mode currently belongs to Write-up. Research and Lean have not gained these controls.

## Design and implementation

The interaction takes inspiration from Lavish's selected-passage feedback and batching. Axiovela's existing colors and controls remain the visual system. Contextual popovers and compact composer attachments follow [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): detailed controls appear when needed. [Zotero's PDF workflow](https://www.zotero.org/support/pdf_reader) supplies a precedent for connecting selected passages to review notes. Revision-bound quotes and offsets draw on the [W3C Web Annotation model](https://www.w3.org/TR/annotation-model/). The preview follows Axiovela’s document label and visible render/export controls, with Annotate added. PDF navigation occupies one slim row underneath. Additional source commands share one three-dot menu, following [menu proximity and scope guidance](https://www.nngroup.com/articles/contextual-menus-guidelines/). The revision comparison uses a native modal dialog with keyboard dismissal and focus containment, consistent with [W3C dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These are design precedents, not a measured usability study of this app.

`src/AnnotationChips.jsx` displays unsent attachments and sent feedback. `src/ChatPanel.jsx` persists attachments per project/conversation and sends them with the user's message. `src/AnnotationSurface.jsx` computes highlight overlays without rewriting the renderer's text tree. `src/annotation-dom.mjs` projects visible text, excluding duplicate accessible math representations. `shared/annotations.mjs` expands sentences and parses revision proposals. `server/manuscript-review.mjs` validates selected notes against saved state; `server/chat.mjs` admits a read-only review turn. `src/RevisionReview.jsx` and the editor independently reject stale proposals. The underlying annotation surface can be reused after this Write-up workflow has been tried in practice.

Run `npm run test:annotations` for isolated browser acceptance, including a real Tectonic PDF and a deterministic provider fixture. It does not validate a paid account or the quality of a real model's revision.

## Continuous PDF rendering

The reader reserves the geometry of every page and renders canvases only near the viewport. A stable scrollbar gutter keeps fit-to-width from oscillating. New canvas and text layers render offscreen and replace the visible pair together; the previous image scales during zoom. Each render has its own canvas and cancellation guard, following [PDF.js rendering guidance](https://mozilla.github.io/pdf.js/examples/).

Scroll normally through the paper, use the arrows to jump between pages, or enter a page number. Pinch gestures delivered as Ctrl+wheel zoom around the pointer. Ctrl+=, Ctrl+plus and Ctrl+minus zoom the focused/expanded reader; Ctrl+0 restores fit width. Outside a reader, the native View menu controls app zoom. Native shortcuts follow [Electron's keyboard handling](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts). Synthetic pinch events are tested; physical trackpad behavior can depend on the desktop environment.
