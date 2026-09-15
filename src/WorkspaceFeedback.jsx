import React, { useEffect, useState } from "react";
import ManuscriptReview from "./ManuscriptReview.jsx";
import {
  capturePassage,
  textProjection,
  rangeFromAnchor,
} from "./annotation-dom.mjs";

// Delegate ordinary panel selection without wrapping scroll containers or interactive controls.
// Document readers use their more precise source/revision and PDF coordinates instead.
export default function WorkspaceFeedback({ project, update, role }) {
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    const edit = (e) => {
      const note = e.detail;
      if (note.target?.kind === "panel" && note.target.role === role)
        setSelection({
          target: note.target,
          anchor: note.anchor,
          edit: { id: note.id, at: Date.now() },
        });
    };
    window.addEventListener("math-edit-panel-note", edit);
    return () => window.removeEventListener("math-edit-panel-note", edit);
  }, [role]);
  useEffect(() => {
    const capture = (event) => {
      if (event.button != null && event.button !== 0) return;
      if (
        event.target.closest(
          "[data-reading-review],[data-annotation-ui],input,textarea,select,button,a,summary,.inactiveWorkspace",
        )
      )
        return;
      const panel = event.target.closest(".panel"),
        selected = window.getSelection();
      if (
        !panel ||
        !selected ||
        selected.isCollapsed ||
        !panel.contains(selected.anchorNode) ||
        !panel.contains(selected.focusNode)
      )
        return;
      const anchor = capturePassage(panel, event);
      if (!anchor) return;
      if (event.type === "keydown") anchor.focusFeedback = true;
      const projection = textProjection(panel),
        range = rangeFromAnchor(projection, anchor);

      const start = Math.max(0, anchor.start - 500),
        source = projection.text.slice(start, anchor.end + 500);
      if (!source || source.length > 12000) return;
      anchor.start -= start;
      anchor.end -= start;
      window.dispatchEvent(new Event("math-dismiss-feedback"));
      setSelection({
        anchor,
        position: range
          ? {
              left: range.getBoundingClientRect().left,
              top: range.getBoundingClientRect().top,
              height: range.getBoundingClientRect().height,
            }
          : null,
        target: {
          kind: "panel",
          id: crypto.randomUUID(),
          title: panel.querySelector("h2")?.textContent || "Workspace",
          source,
          role,
        },
      });
    };
    const keyboard = (e) => {
      if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        const target = window.getSelection()?.anchorNode?.parentElement;
        if (target) capture({ target, type: "keydown" });
      }
    };
    document.addEventListener("mouseup", capture);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("keydown", keyboard);
    };
  }, [project.id, role]);
  return (
    selection && (
      <ManuscriptReview
        key={selection.target.id}
        project={project}
        update={update}
        format="markdown"
        target={selection.target}
        captured={selection.anchor}
        capturePosition={selection.position}
        editRequest={selection.edit}
        onDismiss={() => setSelection(null)}
        onQueue={(id) =>
          window.dispatchEvent(
            new CustomEvent("math-queue-feedback", {
              detail: { id, projectId: project.id, role },
            }),
          )
        }
      />
    )
  );
}
