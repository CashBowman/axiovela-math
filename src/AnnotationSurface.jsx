import React, { useEffect, useRef, useState } from "react";
import {
  feedbackExcluded,
  capturePassage,
  textProjection,
  rangeFromAnchor,
  rangeRects,
} from "./annotation-dom.mjs";

export default function AnnotationSurface({
  children,
  rootRef,
  textRef,
  className = "",
  annotating = false,
  annotations = [],
  draft,
  onCapture,
  onSelect,
  onDraftRect,
  onReadDoubleClick,
  page,
  pageScale = 1,
  ...props
}) {
  const captureTimer = useRef();
  useEffect(() => () => clearTimeout(captureTimer.current), []);
  const own = useRef(),
    root = rootRef || own,
    callbacks = useRef();
  callbacks.current = { onCapture, onSelect, onDraftRect };
  const [marks, setMarks] = useState([]);
  useEffect(() => {
    const element = root.current,
      target = textRef?.current || element;
    if (!element || !target) return;
    if (
      !annotations.some((item) => !page || item.anchor.page === page) &&
      (!draft || (page && draft.page !== page))
    ) {
      setMarks((old) => (old.length ? [] : old));
      return;
    }
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const projection = textProjection(target),
          base = element.getBoundingClientRect();
        const next = [
          ...annotations,
          ...(draft ? [{ id: "draft", anchor: draft }] : []),
        ].flatMap((item) => {
          if (page && item.anchor.page !== page) return [];
          const figure =
            item.anchor.kind === "figure"
              ? [...target.querySelectorAll("img")][item.anchor.figureIndex]
              : null;
          const box = figure?.getBoundingClientRect();
          const rects =
            box && figure.getAttribute("src") === item.anchor.asset
              ? [
                  {
                    left: box.left - base.left,
                    top: box.top - base.top,
                    width: box.width,
                    height: box.height,
                  },
                ]
              : rangeRects(rangeFromAnchor(projection, item.anchor), element);
          if (item.id === "draft" && rects.length) {
            const r = rects.at(-1);
            callbacks.current.onDraftRect?.({
              left: base.left + r.left,
              top: base.top + r.top,
              width: r.width,
              height: r.height,
            });
          }
          return rects.length ? [{ ...item, rects }] : [];
        });
        setMarks((old) =>
          JSON.stringify(old) === JSON.stringify(next) ? old : next,
        );
      });
    };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const mutation = new MutationObserver(records => {
      // Measuring highlights must not react to its own overlay DOM updates.
      if (records.some(r => !(r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest("[data-annotation-ui]"))) update();
    });
    mutation.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [annotations, draft, page, textRef, pageScale]);
  function capture(event, exact = false) {
    if (
      !annotating ||
      event.target.closest(
        feedbackExcluded + ",a",
      )
    )
      return;
    const target = textRef?.current || root.current,
      figure = event.target.closest("img");
    if (figure && target.contains(figure)) {
      callbacks.current.onCapture?.({
        kind: "figure",
        figureIndex: [...target.querySelectorAll("img")].indexOf(figure),
        asset: figure.getAttribute("src"),
        quote: figure.alt || "Figure",
        line:
          Number(figure.closest("[data-source-line]")?.dataset.sourceLine) ||
          undefined,
      }, figure.getBoundingClientRect());
      return;
    }
    const projection = textProjection(target);
    const anchor = capturePassage(target, event, { exact, projection });
    if (anchor) {
      const rects = rangeRects(
        rangeFromAnchor(projection, anchor),
        root.current,
      );
      const rect = rects[0], last = rects.at(-1), base = root.current.getBoundingClientRect();
      callbacks.current.onCapture?.({
        ...anchor,
        ...(event.type === "keydown" ? { focusFeedback: true } : {}),
        ...(page
          ? {
              page,
              x: (rect?.left || 0) / pageScale,
              y: (rect?.top || 0) / pageScale,
            }
          : {}),
      }, last ? {left: base.left + last.left, top: base.top + last.top, width: last.width, height: last.height} : null);
    }
  }
  let lastPinTop = -24;
  const positioned = [...marks]
    .sort((a, b) => a.rects[0].top - b.rects[0].top)
    .map((m) => {
      const pinTop = Math.max(m.rects[0].top, lastPinTop + 24);
      if (m.id !== "draft") lastPinTop = pinTop;
      return { ...m, pinTop };
    });
  return (
    <div
      {...props}
      ref={root}
      className={
        "annotationSurface " + className + (annotating ? " isAnnotating" : "")
      }
      onMouseUp={(e) => {
        clearTimeout(captureTimer.current);
        if (e.button !== 0 || e.detail > 1) return;
        if (!window.getSelection()?.isCollapsed) capture(e);
        else {
          const event = {
            target: e.target,
            clientX: e.clientX,
            clientY: e.clientY,
          };
          captureTimer.current = setTimeout(() => capture(event), 260);
        }
      }}
      onDoubleClickCapture={(e) => {
        clearTimeout(captureTimer.current);
        window.dispatchEvent(new Event("math-dismiss-feedback"));
        onReadDoubleClick?.(e);
      }}
      onKeyDown={(e) => {
        if (annotating && e.altKey && e.key.toLowerCase() === "m") {
          e.preventDefault();
          capture(e);
        }
      }}
    >
      {children}
      <div className="annotationOverlay" data-annotation-ui="true">
        {positioned.map((mark) => (
          <React.Fragment key={mark.id}>
            {mark.rects.map((r, i) => (
              <span
                key={i}
                className={
                  "passageHighlight " +
                  (mark.id === "draft" ? "draftHighlight" : "") +
                  (mark.active ? " activeHighlight" : "")
                }
                style={r}
              />
            ))}
            {mark.id !== "draft" && (
              <button
                className={"annotationPin " + (mark.active ? "activePin" : "")}
                style={{ right: 2, top: mark.pinTop }}
                aria-label={"Comment " + mark.number}
                title={"Comment " + mark.number}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  callbacks.current.onSelect?.(mark.id, e.currentTarget.getBoundingClientRect());
                }}
              >
                {mark.number}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
