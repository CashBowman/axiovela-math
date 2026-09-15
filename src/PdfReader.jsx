import AnnotationSurface from "./AnnotationSurface.jsx";
import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
GlobalWorkerOptions.workerSrc = workerUrl;
function PdfPage({
  pdf,
  number,
  zoom,
  onPosition,
  onSource,
  markers = [],
  annotation = {},
}) {
  const root = useRef(),
    canvas = useRef(),
    layer = useRef();
  const [error, setError] = useState("");
  useEffect(() => {
    let canceled = false,
      renderTask,
      textLayer;
    async function render() {
      const page = await pdf.getPage(number);
      if (canceled) return;
      const viewport = page.getViewport({ scale: zoom }),
        ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.current.width = Math.ceil(viewport.width * ratio);
      canvas.current.height = Math.ceil(viewport.height * ratio);
      canvas.current.style.width = viewport.width + "px";
      canvas.current.style.height = viewport.height + "px";
      root.current.style.width = viewport.width + "px";
      root.current.style.height = viewport.height + "px";
      layer.current.replaceChildren();
      layer.current.style.setProperty("--scale-factor", zoom);
      layer.current.style.setProperty("--total-scale-factor", zoom);
      renderTask = page.render({
        canvasContext: canvas.current.getContext("2d"),
        viewport,
        transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (canceled) return;
      textLayer = new TextLayer({
        textContentSource: await page.getTextContent(),
        container: layer.current,
        viewport,
      });
      await textLayer.render();
    }
    render().catch((e) => {
      if (!canceled && e.name !== "RenderingCancelledException")
        setError(e.message);
    });
    return () => {
      canceled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, number, zoom]);
  function position(e) {
    const r = root.current.getBoundingClientRect();
    return {
      page: number,
      x: (e.clientX - r.left) / zoom,
      y: (e.clientY - r.top) / zoom,
      quote: window.getSelection()?.toString().trim() || "",
    };
  }
  return (
    <AnnotationSurface
      {...annotation}
      rootRef={root}
      textRef={layer}
      page={number}
      pageScale={zoom}
      className="pdfPage"
      data-page={number}
      onReadDoubleClick={(e) => {
        e.preventDefault();
        onSource?.(position(e));
      }}
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <canvas ref={canvas} aria-label={"PDF page " + number} />
          <div ref={layer} className="textLayer" />
          {markers
            .filter((m) => m.page === number)
            .map((m, i) => (
              <span
                key={i}
                className="pdfCommentMarker"
                style={{ left: m.x * zoom, top: m.y * zoom }}
                title="Commented location"
              />
            ))}
        </>
      )}
    </AnnotationSurface>
  );
}
export default function PdfReader({
  url,
  title = "PDF document",
  onPosition,
  onSource,
  location,
  markers = [],
  annotation,
}) {
  const [pdf, setPdf] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(0.9),
    [fitWidth, setFitWidth] = useState(true),
    container = useRef();
  useEffect(() => {
    let canceled = false;
    setPdf(null);
    setError("");
    setPage(1);
    setFitWidth(true);
    const task = getDocument({ url, isEvalSupported: false });
    task.promise
      .then((doc) => {
        if (!canceled) setPdf(doc);
      })
      .catch((e) => {
        if (!canceled) setError(e.message);
      });
    return () => {
      canceled = true;
      void task.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (location) {
      setPage(location.page);
      container.current.scrollTop = Math.max(0, location.y * zoom - 80);
    }
  }, [location]);
  useEffect(() => {
    if (!pdf || !fitWidth) return;
    let canceled = false;
    const resize = async () => {
      try {
        const current = await pdf.getPage(page);
        if (!canceled)
          setZoom(
            Math.max(
              0.2,
              Math.min(
                3,
                (container.current.clientWidth - 36) /
                  current.getViewport({ scale: 1 }).width,
              ),
            ),
          );
      } catch (e) {
        if (!canceled) setError(e.message);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    return () => {
      canceled = true;
      observer.disconnect();
    };
  }, [pdf, page, fitWidth]);
  return (
    <div className="pdfReader" role="region" aria-label={title}>
      <div className="pdfToolbar">
        <button
          disabled={!pdf || page <= 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label="Previous PDF page"
        >
          ‹
        </button>
        <label>
          Page{" "}
          <input
            aria-label="PDF page number"
            type="number"
            min={1}
            max={pdf?.numPages || 1}
            value={page}
            onChange={(e) =>
              setPage(
                Math.max(
                  1,
                  Math.min(pdf?.numPages || 1, Number(e.target.value) || 1),
                ),
              )
            }
          />
        </label>
        <span>of {pdf?.numPages || "…"}</span>
        <button
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage((p) => p + 1)}
          aria-label="Next PDF page"
        >
          ›
        </button>
        <button
          onClick={() => {
            setFitWidth(false);
            setZoom((z) => Math.max(0.2, z - 0.15));
          }}
          aria-label="Zoom out PDF"
        >
          −
        </button>
        <button aria-pressed={fitWidth} onClick={() => setFitWidth(true)}>
          Fit width
        </button>
        <button
          onClick={() => {
            setFitWidth(false);
            setZoom((z) => Math.min(3, z + 0.15));
          }}
          aria-label="Zoom in PDF"
        >
          +
        </button>
        <a href={url} target="_blank" rel="noreferrer">
          Open PDF
        </a>
      </div>
      <div ref={container} className="pdfCanvasScroll">
        {error ? (
          <p role="alert">Could not display this PDF: {error}</p>
        ) : pdf ? (
          <PdfPage
            pdf={pdf}
            number={page}
            zoom={zoom}
            markers={markers}
            annotation={annotation}
            onPosition={onPosition}
            onSource={onSource}
          />
        ) : (
          <p role="status">Loading PDF…</p>
        )}
      </div>
    </div>
  );
}
