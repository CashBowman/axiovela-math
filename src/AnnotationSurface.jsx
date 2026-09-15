import React, { useEffect, useRef, useState } from "react";
import {
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
  const own = useRef(),
    root = rootRef || own,
    callbacks = useRef();
  callbacks.current = { onCapture, onSelect, onDraftRect };
  const [marks, setMarks] = useState([]);
  useEffect(() => {
    const element = root.current,
      target = textRef?.current || element;
    if (!element || !target) return;
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
    const mutation = new MutationObserver(update);
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
    if (!annotating || event.target.closest("[data-annotation-ui]")) return;
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
      });
      return;
    }
    const anchor = capturePassage(target, event, { exact });
    if (anchor) {
      const rect = rangeRects(
        rangeFromAnchor(textProjection(target), anchor),
        root.current,
      )[0];
      callbacks.current.onCapture?.({
        ...anchor,
        ...(page
          ? {
              page,
              x: (rect?.left || 0) / pageScale,
              y: (rect?.top || 0) / pageScale,
            }
          : {}),
      });
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
      onClickCapture={(e) => {
        if (annotating && e.target.closest("a")) e.preventDefault();
      }}
      onMouseUp={capture}
      onDoubleClickCapture={(e) => {
        if (annotating) {
          e.preventDefault();
          e.stopPropagation();
        } else onReadDoubleClick?.(e);
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
                  callbacks.current.onSelect?.(mark.id);
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
