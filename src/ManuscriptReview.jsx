import React, { useEffect, useRef, useState } from "react";
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
  annotating = false,
  editRequest,
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
  const source = project[format],
    comments = (project.manuscriptComments || []).filter(
      (c) => c.format === format,
    ),
    stale =
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
      .digest(
        "SHA-256",
        new TextEncoder().encode(source + "\0" + project.bibliography),
      )
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
  }, [source, format, project.bibliography]);
  useEffect(() => {
    if (draft || editingId) {
      previousFocus.current = document.activeElement;
      input.current?.focus();
    }
  }, [!!draft, editingId]);
  useEffect(() => {
    if (editRequest) edit(editRequest.id);
  }, [editRequest]);
  function closeNote() {
    setDraft(null);
    setEditingId(null);
    setComment("");
    setPosition(null);
    previousFocus.current?.isConnected &&
      previousFocus.current.focus({ preventScroll: true });
  }
  function capture(anchor) {
    if (stale || !hash) return;
    if ((draft || editingId) && comment.trim()) {
      setNotice("Add or cancel this note before selecting another passage.");
      return;
    }
    setNotice("");
    setDraft(anchor);
    setEditingId(null);
    setPosition(null);
    window.getSelection()?.removeAllRanges();
  }
  function edit(id) {
    const c = comments.find((c) => c.id === id);
    if (!c) return;
    setDraft(null);
    setEditingId(id);
    setComment(c.comment);
    setPosition(null);
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
  const annotations =
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
      : [];
  const annotation = {
    annotating: annotating && !stale,
    annotations,
    draft,
    onCapture: capture,
    onSelect: edit,
    onDraftRect: (r) =>
      setPosition((old) =>
        old && Math.abs(old.left - r.left) < 1 && Math.abs(old.top - r.top) < 1
          ? old
          : r,
      ),
  };
  const shown = editingId ? comments.find((c) => c.id === editingId) : null;
  const style = position
    ? {
        left: Math.max(12, Math.min(innerWidth - 332, position.left)),
        top: Math.max(
          12,
          Math.min(innerHeight - 300, position.top + position.height + 10),
        ),
      }
    : { right: 20, bottom: 20 };
  return (
    <div className="manuscriptReview">
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
      <div className="reviewDocument">
        {format === "markdown" ? (
          <div className="scrollBody paperPreview">
            <AnnotationSurface
              {...annotation}
              tabIndex={0}
              aria-label="Manuscript annotation surface"
            >
              <Preview
                source={source}
                bibliography={project.bibliography}
                onSourceLine={annotating ? undefined : onLine}
                sourceLocations
                imageUrl={(src) =>
                  src?.startsWith("assets/")
                    ? `/api/writeup-image?project=${project.id}&path=${encodeURIComponent(src)}`
                    : null
                }
              />
            </AnnotationSurface>
          </div>
        ) : pdf ? (
          <PdfReader
            url={`/api/rendered?project=${project.id}&id=${pdf.id}`}
            title="Publication PDF"
            annotation={annotation}
            onSource={pdfSource}
          />
        ) : (
          <div className="empty largeEmpty">
            Choose Render document to compile the manuscript.
          </div>
        )}
      </div>
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
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
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
              <blockquote>
                {draft?.quote || shown?.anchor.quote || "Selected location"}
              </blockquote>
              <textarea
                ref={input}
                aria-label="Annotation feedback"
                placeholder="What should change here?"
                value={comment}
                maxLength={4000}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="annotationPopoverFoot">
                <small>Held until you send</small>
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
