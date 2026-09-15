import React, { useEffect, useState } from "react";
import { Preview, download } from "./ui.jsx";
import PdfReader from "./PdfReader.jsx";
import { sourceAt } from "../shared/synctex.mjs";
export default function ManuscriptReview({
  project,
  format,
  pdf,
  update,
  onLine,
}) {
  const [open, setOpen] = useState(false),
    [anchor, setAnchor] = useState(null),
    [comment, setComment] = useState(""),
    [hash, setHash] = useState(""),
    [notice, setNotice] = useState(""),
    [editingId, setEditingId] = useState(null),
    [location, setLocation] = useState(null);
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
    setAnchor(null);
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
  function pdfSource(position) {
    if (stale) {
      setNotice("Render the current draft before jumping to its source.");
      return;
    }
    const hit = sourceAt(
      pdf?.sourceMap || [],
      position.page,
      position.x,
      position.y,
    );
    if (hit) {
      onLine(hit.line);
      setNotice("Source line " + hit.line + " (SyncTeX).");
    } else setNotice("This PDF location has no manuscript source mapping.");
  }
  function markdownPosition(e) {
    const block = e.target.closest("[data-source-line]");
    if (block)
      setAnchor({
        line: Number(block.dataset.sourceLine),
        quote:
          window.getSelection()?.toString().trim() ||
          block.textContent.slice(0, 350),
      });
  }
  function add(e) {
    e.preventDefault();
    if (editingId) {
      change(editingId, { comment: comment.trim() });
      setEditingId(null);
      setComment("");
      return;
    }
    if (!anchor || !hash || stale) return;
    const item = {
      id: crypto.randomUUID(),
      format,
      sourceHash: hash,
      anchor,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    update((p) => ({
      manuscriptComments: [...(p.manuscriptComments || []), item],
    }));
    setComment("");
  }
  function change(id, patch) {
    update((p) => ({
      manuscriptComments: (p.manuscriptComments || []).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
  }
  return (
    <div className="manuscriptReview">
      <div className="reviewToolbar">
        <button aria-expanded={open} onClick={() => setOpen((x) => !x)}>
          Comments{comments.length ? " · " + comments.length : ""}
        </button>
        {comments.length > 0 && (
          <button
            onClick={() =>
              download(
                "manuscript-comments.md",
                comments
                  .map(
                    (c) =>
                      `## ${c.resolved ? "Resolved" : "Open"} · ${c.format} · ${c.anchor.line ? "line " + c.anchor.line : "page " + c.anchor.page}\n\n> ${(c.anchor.quote || "Selected location").replaceAll("\n", "\n> ")}\n\n${c.comment}\n\nSource revision: ${c.sourceHash}`,
                  )
                  .join("\n\n"),
              )
            }
          >
            Export comments
          </button>
        )}
        <span className="hint">
          Double-click the preview to find its source.
        </span>
      </div>
      {notice && (
        <p className="reviewNotice" role="status">
          {notice}
        </p>
      )}
      <div className={"reviewContent " + (open ? "withComments" : "")}>
        <div
          className="reviewDocument"
          onMouseUp={format === "markdown" ? markdownPosition : undefined}
        >
          {format === "markdown" ? (
            <div className="scrollBody paperPreview">
              <Preview
                source={source}
                bibliography={project.bibliography}
                onSourceLine={onLine}
                sourceLocations
                imageUrl={(src) =>
                  src?.startsWith("assets/")
                    ? `/api/writeup-image?project=${project.id}&path=${encodeURIComponent(src)}`
                    : null
                }
              />
            </div>
          ) : pdf ? (
            <PdfReader
              url={`/api/rendered?project=${project.id}&id=${pdf.id}`}
              title="Publication PDF"
              location={location}
              markers={comments
                .filter((c) => c.sourceHash === hash && !c.resolved)
                .map((c) => c.anchor)}
              onPosition={(p) => setAnchor({ ...p, renderId: pdf.id })}
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
            <form onSubmit={add}>
              <p className="hint">
                {stale
                  ? "Render the current draft to add comments."
                  : anchor
                    ? (anchor.line
                        ? "Line " + anchor.line
                        : "Page " + anchor.page) + " selected."
                    : "Select text or click a passage in the preview."}
              </p>
              {anchor?.quote && (
                <blockquote>{anchor.quote.slice(0, 350)}</blockquote>
              )}
              <label>
                Comment
                <textarea
                  aria-label="New manuscript comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button
                disabled={
                  !comment.trim() || (!editingId && (!anchor || !hash || stale))
                }
              >
                {editingId ? "Save comment" : "Add comment"}
              </button>
            </form>
            {comments.map((c) => (
              <article
                className={
                  "manuscriptComment " + (c.resolved ? "resolved" : "")
                }
                key={c.id}
              >
                <p className="hint">
                  {c.anchor.line
                    ? "Line " + c.anchor.line
                    : "Page " + c.anchor.page}{" "}
                  ·{" "}
                  {c.sourceHash === hash
                    ? "Current revision"
                    : "Earlier revision"}
                </p>
                {c.anchor.quote && (
                  <blockquote>{c.anchor.quote.slice(0, 350)}</blockquote>
                )}
                <p>{c.comment}</p>
                <div className="row">
                  {c.anchor.line && c.sourceHash === hash && (
                    <button onClick={() => onLine(c.anchor.line)}>
                      Go to source
                    </button>
                  )}
                  {c.anchor.page && c.sourceHash === hash && (
                    <button onClick={() => setLocation({ ...c.anchor })}>
                      Show on page
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setComment(c.comment);
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
          </aside>
        )}
      </div>
    </div>
  );
}
