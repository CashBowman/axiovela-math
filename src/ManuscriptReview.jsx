import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Highlighter, MessageSquare, X, Send, Download } from "lucide-react";
import { Preview, download } from "./ui.jsx";
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
  onRequestReview,
  reviewBusy = false,
}) {
  const [annotating, setAnnotating] = useState(false),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState(null),
    [comment, setComment] = useState(""),
    [hash, setHash] = useState(""),
    [notice, setNotice] = useState(""),
    [editingId, setEditingId] = useState(null),
    [active, setActive] = useState(null),
    [location, setLocation] = useState(null),
    [position, setPosition] = useState(null),
    [selected, setSelected] = useState([]),
    [sending, setSending] = useState(false);
  const popup = useRef(),
    input = useRef(),
    surface = useRef(),
    toggle = useRef(),
    previousFocus = useRef();
  const source = project[format],
    comments = (project.manuscriptComments || []).filter(
      (c) => c.format === format,
    ),
    stale =
      format === "latex" &&
      pdf &&
      (pdf.source !== source || pdf.bibliography !== project.bibliography);
  const current = comments.filter((c) => c.sourceHash === hash && !c.resolved),
    chosen = current.filter((c) => selected.includes(c.id));
  useEffect(() => {
    let canceled = false;
    setHash("");
    setDraft(null);
    setEditingId(null);
    setPosition(null);
    setComment("");
    setSelected([]);
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
  function closeNote() {
    setDraft(null);
    setEditingId(null);
    setComment("");
    setPosition(null);
    previousFocus.current?.isConnected
      ? previousFocus.current.focus()
      : toggle.current?.focus();
  }
  function capture(anchor) {
    if (stale || !hash) return;
    if ((draft || editingId) && comment.trim()) {
      setNotice("Save or cancel this note before selecting another passage.");
      return;
    }
    setNotice("");
    setDraft(anchor);
    setEditingId(null);
    setPosition(null);
    window.getSelection()?.removeAllRanges();
  }
  function change(id, patch) {
    update((p) => ({
      manuscriptComments: (p.manuscriptComments || []).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
  }
  function add(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    if (editingId) change(editingId, { comment: comment.trim() });
    else if (draft && hash && !stale) {
      const id = crypto.randomUUID();
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
      setSelected((ids) => [...ids, id]);
      setActive(id);
    } else return;
    closeNote();
  }
  function selectComment(id) {
    setOpen(true);
    setActive(id);
    requestAnimationFrame(() => {
      const item = surface.current?.querySelector(
        '[data-comment-id="' + id + '"]',
      );
      const pane = item?.closest(".manuscriptComments");
      if (pane)
        pane.scrollTop +=
          item.getBoundingClientRect().top -
          pane.getBoundingClientRect().top -
          50;
      item?.focus({ preventScroll: true });
    });
  }
  function pdfSource(p) {
    if (stale) {
      setNotice("Render the current draft before jumping to its source.");
      return;
    }
    const hit = sourceAt(pdf?.sourceMap || [], p.page, p.x, p.y);
    if (hit) {
      onLine(hit.line);
      setNotice("Source line " + hit.line + " (SyncTeX).");
    } else setNotice("This PDF location has no manuscript source mapping.");
  }
  async function send() {
    setSending(true);
    setNotice("");
    try {
      await onRequestReview({
        format,
        sourceHash: hash,
        commentIds: chosen.map((c) => c.id),
      });
      setNotice(
        "Feedback sent. Review the proposed draft in the Publication Assistant.",
      );
    } catch (e) {
      setNotice(e.message);
    } finally {
      setSending(false);
    }
  }
  const annotations =
    (annotating || open) && !stale
      ? current
          .filter(
            (c) =>
              Number.isInteger(c.anchor.start) || c.anchor.kind === "figure",
          )
          .map((c) => ({
            ...c,
            number: comments.findIndex((x) => x.id === c.id) + 1,
            active: c.id === active,
          }))
      : [];
  const annotation = {
    annotating: annotating && !stale,
    annotations,
    draft,
    onCapture: capture,
    onSelect: selectComment,
    onDraftRect: (r) =>
      setPosition((old) =>
        old && Math.abs(old.left - r.left) < 1 && Math.abs(old.top - r.top) < 1
          ? old
          : r,
      ),
  };
  const shownComment = editingId
    ? comments.find((c) => c.id === editingId)
    : null;
  const noteOpen = !!(draft || editingId),
    popoverStyle = position
      ? {
          left: Math.max(12, Math.min(innerWidth - 332, position.left)),
          top: Math.max(
            12,
            Math.min(innerHeight - 300, position.top + position.height + 10),
          ),
        }
      : { right: 20, bottom: 20 };
  return (
    <div ref={surface} className="manuscriptReview">
      <div className="reviewToolbar">
        <button
          ref={toggle}
          className={"annotateToggle " + (annotating ? "selected" : "")}
          aria-pressed={annotating}
          onClick={() => {
            setAnnotating((x) => !x);
            if (annotating) closeNote();
          }}
          disabled={!!stale}
        >
          <Highlighter size={14} />
          Annotate
        </button>
        <button aria-expanded={open} onClick={() => setOpen((x) => !x)}>
          <MessageSquare size={14} />
          Comments{comments.length ? " · " + comments.length : ""}
        </button>
        {annotating && (
          <span className="annotationHint">
            Click a sentence or drag across a passage. Alt+M adds a selected
            passage.
          </span>
        )}
      </div>
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
      <div className={"reviewContent " + (open ? "withComments" : "")}>
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
              location={location}
              annotation={annotation}
              markers={
                !stale && (open || annotating)
                  ? current
                      .filter((c) => !Number.isInteger(c.anchor.start))
                      .map((c) => c.anchor)
                  : []
              }
              onSource={pdfSource}
            />
          ) : (
            <div className="empty largeEmpty">
              Choose Render PDF to compile the manuscript.
            </div>
          )}
        </div>
        {open && (
          <aside
            className="manuscriptComments"
            aria-label="Manuscript comments"
          >
            <div className="annotationListHead">
              <strong>Feedback</strong>
              <button
                className="icon"
                aria-label="Close comments"
                onClick={() => setOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
            {!comments.length && (
              <p className="hint">
                Turn on Annotate, then select a sentence or passage to leave
                feedback.
              </p>
            )}
            {comments.length > 0 && (
              <div className="annotationBatch">
                <label>
                  <input
                    type="checkbox"
                    aria-label="Select all current comments"
                    checked={
                      current.length > 0 && chosen.length === current.length
                    }
                    disabled={!current.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? current.map((c) => c.id) : [],
                      )
                    }
                  />
                  Select current notes
                </label>
                <button
                  className="icon"
                  title="Export comments"
                  aria-label="Export comments"
                  onClick={() =>
                    download(
                      "manuscript-comments.md",
                      comments
                        .map(
                          (c, i) =>
                            `## ${i + 1}. ${c.resolved ? "Resolved" : "Open"} · ${c.anchor.line ? "line " + c.anchor.line : "page " + c.anchor.page}\n\n> ${(c.anchor.quote || "Selected location").replaceAll("\n", "\n> ")}\n\n${c.comment}\n\nSource revision: ${c.sourceHash}`,
                        )
                        .join("\n\n"),
                    )
                  }
                >
                  <Download size={14} />
                </button>
              </div>
            )}
            {comments.map((c, i) => (
              <article
                tabIndex={-1}
                data-comment-id={c.id}
                key={c.id}
                className={
                  "manuscriptComment " +
                  (c.resolved ? "resolved " : "") +
                  (active === c.id ? "activeComment" : "")
                }
              >
                <div className="annotationMeta">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={"Include comment " + (i + 1) + " in feedback"}
                      checked={chosen.some((x) => x.id === c.id)}
                      disabled={c.resolved || c.sourceHash !== hash}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, c.id]
                            : ids.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <span className="commentNumber">{i + 1}</span>
                  </label>
                  <span>
                    {c.anchor.line
                      ? "Line " + c.anchor.line
                      : "Page " + c.anchor.page}{" "}
                    ·{" "}
                    {c.sourceHash === hash
                      ? c.resolved
                        ? "Resolved"
                        : "Current revision"
                      : "Earlier revision"}
                  </span>
                </div>
                {c.anchor.quote && <blockquote>{c.anchor.quote}</blockquote>}
                <p>{c.comment}</p>
                <div className="row">
                  {c.sourceHash === hash && (
                    <button
                      onClick={() => {
                        setActive(c.id);
                        if (c.anchor.page) setLocation({ ...c.anchor });
                        else {
                          const pin = surface.current?.querySelector(
                            '[aria-label="Comment ' + (i + 1) + '"]',
                          );
                          const pane = pin?.closest(".paperPreview");
                          if (pane)
                            pane.scrollTop +=
                              pin.getBoundingClientRect().top -
                              pane.getBoundingClientRect().top -
                              pane.clientHeight / 3;
                          pin?.focus({ preventScroll: true });
                        }
                      }}
                    >
                      Show passage
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setComment(c.comment);
                      setPosition(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => change(c.id, { resolved: !c.resolved })}
                  >
                    {c.resolved ? "Reopen" : "Resolve"}
                  </button>
                </div>
              </article>
            ))}
            {!!comments.length && (
              <div className="annotationSend">
                <button
                  className="primary"
                  disabled={
                    !chosen.length || sending || reviewBusy || !onRequestReview
                  }
                  onClick={send}
                >
                  <Send size={14} />
                  {sending
                    ? "Sending…"
                    : "Send feedback" +
                      (chosen.length ? " · " + chosen.length : "")}
                </button>
                <p className="hint">
                  The assistant proposes a revision for you to review.
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
      {noteOpen &&
        createPortal(
          <section
            ref={popup}
            className="annotationPopover"
            data-annotation-ui="true"
            role="dialog"
            aria-label={editingId ? "Edit annotation" : "Add annotation"}
            style={popoverStyle}
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
                {draft?.quote ||
                  shownComment?.anchor.quote ||
                  "Selected location"}
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
                <small>Ctrl+Enter to save</small>
                <button className="primary" disabled={!comment.trim()}>
                  {editingId ? "Save comment" : "Add comment"}
                </button>
              </div>
            </form>
          </section>,
          document.body,
        )}
    </div>
  );
}
