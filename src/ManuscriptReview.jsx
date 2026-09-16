import {
  readingDocument,
  webMarkdown,
} from "../shared/reading-annotations.mjs";
import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Preview } from "./ui.jsx";
import PdfReader from "./PdfReader.jsx";
import AnnotationSurface from "./AnnotationSurface.jsx";
import { sourceAt } from "../shared/synctex.mjs";
import "./annotations.css";

export default function ManuscriptReview({
  project,
  format,
  pdf,
  update,
  onLine,
  onQueue,
  annotating = true,
  inline = false,
  captured,
  capturePosition,
  onDismiss,
  editRequest,
  target,
}) {
  const [draft, setDraft] = useState(null),
    [comment, setComment] = useState(""),
    [hash, setHash] = useState(""),
    [notice, setNotice] = useState(""),
    [editingId, setEditingId] = useState(null),
    [position, setPosition] = useState(null);
  const popup = useRef(),
    input = useRef(),
    previousFocus = useRef();
  const reading = target ? readingDocument(project, target) : null;
  const source = reading ? reading.source : project[format],
    revision = reading ? reading.revision : project.bibliography,
    comments = useMemo(() => (project.manuscriptComments || []).filter((c) =>
      target
        ? c.target?.kind === target.kind && c.target?.id === target.id
        : !c.target && c.format === format,
    ), [project.manuscriptComments, target?.kind, target?.id, format]),
    stale =
      !target &&
      format === "latex" &&
      pdf &&
      (pdf.source !== source || pdf.bibliography !== project.bibliography);
  useEffect(() => {
    let canceled = false;
    setHash("");
    setDraft(null);
    setEditingId(null);
    setPosition(null);
    setComment("");
    setNotice("");
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(source + "\0" + revision))
      .then((bytes) => {
        if (!canceled)
          setHash(
            [...new Uint8Array(bytes)]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
          );
      });
    return () => {
      canceled = true;
    };
  }, [source, format, revision, target?.kind, target?.id]);
  useEffect(() => {
    if (draft || editingId) {
      previousFocus.current = document.activeElement;
      // A dragged selection stays available for native Copy. Click feedback to type.
      if (
        editingId ||
        draft?.focusFeedback ||
        window.getSelection()?.isCollapsed
      )
        input.current?.focus({ preventScroll: true });
    }
  }, [!!draft, editingId]);
  useEffect(() => {
    if (editRequest) edit(editRequest.id);
  }, [editRequest]);
  useEffect(() => {
    if (captured && hash) {
      if (editRequest) edit(editRequest.id);
      else capture(captured);
    }
  }, [captured, hash]);
  useEffect(() => {
    if (!draft && !editingId) return;
    const dismiss = (e) => {
      if (e.button === 0 && !popup.current?.contains(e.target)) closeNote();
    };
    const other = () => closeNote();
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("math-dismiss-feedback", other);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("math-dismiss-feedback", other);
    };
  }, [!!draft, editingId]);
  function closeNote() {
    onDismiss?.();
    setDraft(null);
    setEditingId(null);
    setComment("");
    setPosition(null);
    previousFocus.current?.isConnected &&
      previousFocus.current.focus({ preventScroll: true });
  }
  function capture(anchor, rect) {
    if (stale || !hash) return;
    if (!captured) window.dispatchEvent(new Event("math-dismiss-feedback"));
    setComment("");
    setNotice("");
    setDraft(anchor);
    setEditingId(null);
    setPosition(rect || capturePosition || null);
  }
  function edit(id, rect) {
    const c = comments.find((c) => c.id === id);
    if (!c) return;
    setDraft(null);
    setEditingId(id);
    setComment(c.comment);
    setPosition(rect || capturePosition || null);
  }
  function add(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    let id = editingId;
    if (id)
      update((p) => ({
        manuscriptComments: (p.manuscriptComments || []).map((c) =>
          c.id === id ? { ...c, comment: comment.trim() } : c,
        ),
      }));
    else if (draft && hash && !stale) {
      id = crypto.randomUUID();
      update((p) => ({
        manuscriptComments: [
          ...(p.manuscriptComments || []),
          {
            id,
            format,
            ...(target ? { target, title: reading.title } : {}),
            sourceHash: hash,
            anchor: draft,
            comment: comment.trim(),
            createdAt: new Date().toISOString(),
            resolved: false,
          },
        ],
      }));
    } else return;
    onQueue(id);
    closeNote();
  }
  function pdfSource(p) {
    if (stale) {
      setNotice("Render the current draft before jumping to its source.");
      return;
    }
    const hit = sourceAt(pdf?.sourceMap || [], p.page, p.x, p.y);
    if (hit) onLine(hit.line);
    else setNotice("This PDF location has no manuscript source mapping.");
  }
  const annotations = useMemo(() =>
    annotating && !stale
      ? comments
          .filter(
            (c) =>
              c.sourceHash === hash &&
              !c.resolved &&
              (Number.isInteger(c.anchor.start) || c.anchor.kind === "figure"),
          )
          .map((c) => ({
            ...c,
            number: comments.findIndex((x) => x.id === c.id) + 1,
          }))
      : [], [annotating, stale, comments, hash]);
  const handlers = useRef();
  handlers.current = {capture, edit};
  const annotation = useMemo(() => ({
    annotating: annotating && !stale,
    annotations,
    draft,
    onCapture: (...args) => handlers.current.capture(...args),
    onSelect: (...args) => handlers.current.edit(...args),
    onDraftRect: (r) =>
      setPosition((old) =>
        old && Math.abs(old.left - r.left) < 1 && Math.abs(old.top - r.top) < 1
          ? old
          : r,
      ),
  }), [annotating, stale, annotations, draft]);
  const imageUrl = useCallback((src) =>
    target?.kind === "paper" && /^https?:\/\//i.test(src || "")
      ? `/api/library/image?project=${project.id}&source=${target.id}&url=${encodeURIComponent(src)}`
      : src?.startsWith("assets/")
        ? `/api/writeup-image?project=${project.id}&path=${encodeURIComponent(src)}`
        : null, [target?.kind, target?.id, project.id]);
  const shown = editingId ? comments.find((c) => c.id === editingId) : null;
  const style = position
    ? {
        left: Math.max(12, Math.min(innerWidth - 332, position.left)),
        top: Math.max(
          12,
          Math.min(innerHeight - 300, position.top + position.height + 10),
        ),
      }
    : { right: 20, bottom: 20, ...(draft && !captured ? { visibility: "hidden" } : {}) };
  return (
    <div
      className={
        captured
          ? "workspaceFeedback"
          : "manuscriptReview" + (inline ? " inlineReview" : "")
      }
      data-reading-review="true"
    >
      {notice && (
        <div className="reviewNotice" role="status">
          {notice}
          <button
            aria-label="Dismiss annotation message"
            className="icon"
            onClick={() => setNotice("")}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {!captured && (
        <div className="reviewDocument">
          {format === "markdown" ? (
            <div className={(inline ? "" : "scrollBody ") + "paperPreview"}>
              <AnnotationSurface
                {...annotation}
                tabIndex={0}
                aria-label={
                  target
                    ? "Reading annotation surface"
                    : "Manuscript annotation surface"
                }
              >
                <Preview
                  source={
                    target?.kind === "paper" ? webMarkdown(source) : source
                  }
                  prose={!!target}
                  sources={project.papers}
                  bibliography={project.bibliography}
                  onSourceLine={onLine}
                  sourceLocations
                  imageUrl={imageUrl}
                />
              </AnnotationSurface>
            </div>
          ) : pdf ? (
            <PdfReader
              url={
                target
                  ? pdf.url
                  : `/api/rendered?project=${project.id}&id=${pdf.id}`
              }
              title={target ? "Read " + reading.title : "Publication PDF"}
              annotation={annotation}
              onSource={target ? undefined : pdfSource}
            />
          ) : (
            <div className="empty largeEmpty">
              Choose Render document to compile the manuscript.
            </div>
          )}
        </div>
      )}
      {(draft || editingId) &&
        createPortal(
          <section
            ref={popup}
            className="annotationPopover"
            data-annotation-ui="true"
            role="dialog"
            aria-label={editingId ? "Edit annotation" : "Add annotation"}
            style={style}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeNote();
              }
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229 &&
                (e.target === input.current || e.ctrlKey || e.metaKey)
              ) {
                e.preventDefault();
                add(e);
              }
              if (e.key === "Tab") {
                e.stopPropagation();
                const nodes = [
                  ...popup.current.querySelectorAll("textarea,button"),
                ].filter((x) => !x.disabled);
                if (e.shiftKey && document.activeElement === nodes[0]) {
                  e.preventDefault();
                  nodes.at(-1)?.focus();
                } else if (
                  !e.shiftKey &&
                  document.activeElement === nodes.at(-1)
                ) {
                  e.preventDefault();
                  nodes[0]?.focus();
                }
              }
            }}
          >
            <form onSubmit={add}>
              <div className="annotationListHead">
                <strong>
                  {editingId ? "Edit feedback" : "Leave feedback"}
                </strong>
                <button
                  type="button"
                  className="icon"
                  aria-label="Cancel annotation"
                  onClick={closeNote}
                >
                  <X size={14} />
                </button>
              </div>
              <textarea
                ref={input}
                aria-label="Annotation feedback"
                placeholder="What should change here?"
                value={comment}
                maxLength={4000}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="annotationPopoverFoot">
                <button className="primary" disabled={!comment.trim()}>
                  Add to message
                </button>
              </div>
            </form>
          </section>,
          document.body,
        )}
    </div>
  );
}
