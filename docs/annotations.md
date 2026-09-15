# Annotating a manuscript

In **Write-up**, choose **Annotate**. Click a sentence or drag across a passage, then type feedback in the small popover and choose **Add comment**. Selection expands to complete sentences, including across Markdown paragraphs. Display equations and inserted Markdown figures can also receive notes. With a keyboard text selection inside the preview, Alt+M opens a note; Ctrl/Cmd+Enter saves it and Escape cancels it.

Subtle highlights and numbered margin pins identify saved notes. Select a pin to open its feedback. The **Comments** list lets you edit, resolve, reopen or export notes. Close Comments and turn off Annotate for a clean reading view. Comments save automatically. Print/PDF from the Markdown preview excludes review controls and highlights.

## From feedback to a revised draft

1. Select the current notes you want addressed in Comments.
2. Choose **Send feedback**. The Publication Assistant receives those notes, their quoted passages, the current manuscript and bibliography. It uses the selected provider, which may incur normal provider charges.
3. Open **Review proposed revision** on the completed reply. Compare current and proposed source in the changed region.
4. Choose **Apply revision** to accept the complete proposed draft, or **Keep current draft** to leave it alone.

The feedback turn uses a fresh read-only provider session and preserves the conversation's usual access setting and unsent message. It does not automatically apply edits or resolve notes. Accepting updates only the selected Markdown or LaTeX draft. Normal source-save protection keeps earlier files in `writeups/backups/`. If the manuscript or bibliography changes after the review request, the proposal must be requested again before it can be applied.

## Anchors and limits

Notes retain the document format, exact source/bibliography revision, quoted text and rendered text offsets. PDF notes also store a page and position; figures retain their asset identity. Highlight geometry is recomputed after resizing or PDF zoom. Earlier-revision notes remain readable in Comments but cannot silently relocate or be sent as feedback on a different draft.

- PDF text selection is within one displayed page. Scanned pages without a text layer need OCR before text annotation is possible. PDF figures do not yet have region selection.
- Sentence boundaries are a convenience based on English text segmentation. Abbreviations and mathematical notation can be ambiguous; inspect the quoted passage before saving.
- Feedback is limited to twenty notes, 24,000 characters of note data and a 100,000-character draft per request. Providers may impose smaller context/output limits.
- The comparison shows source with surrounding context. It accepts the complete revised draft, not individual change fragments. A reply without exactly one complete matching source block cannot be applied.
- These are app-owned comments, not annotations embedded in a PDF. Export notes separately to share them. Typed but unsubmitted popover text is temporary.
- Annotate mode currently belongs to Write-up. Research and Lean have not gained these controls.

## Design and implementation

The interaction takes inspiration from Lavish's selected-passage feedback and batching. Axiovela's existing colors and controls remain the visual system. Contextual popovers and a collapsible list follow [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): detailed controls appear when needed. [Zotero's PDF workflow](https://www.zotero.org/support/pdf_reader) supplies a precedent for connecting selected passages to review notes. Revision-bound quotes and offsets draw on the [W3C Web Annotation model](https://www.w3.org/TR/annotation-model/). The revision comparison uses a native modal dialog with keyboard dismissal and focus containment, consistent with [W3C dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These are design precedents, not a measured usability study of this app.

`src/AnnotationSurface.jsx` computes highlight overlays without rewriting the renderer's text tree. `src/annotation-dom.mjs` projects visible text, excluding duplicate accessible math representations. `shared/annotations.mjs` expands sentences and parses revision proposals. `server/manuscript-review.mjs` validates selected notes against saved state; `server/chat.mjs` admits a read-only review turn. `src/RevisionReview.jsx` and the editor independently reject stale proposals. The underlying annotation surface can be reused after this Write-up workflow has been tried in practice.

Run `npm run test:annotations` for isolated browser acceptance, including a real Tectonic PDF and a deterministic provider fixture. It does not validate a paid account or the quality of a real model's revision.
