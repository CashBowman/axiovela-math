import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from "d3-force";
const colors = {
  paper: "#4d7898",
  web: "#668878",
  claim: "#b48b43",
  evidence: "#8a789d",
};
export default function ConnectionsGraph({ items, links, selected, onSelect }) {
  const root = useRef(),
    drag = useRef();
  const [size, setSize] = useState({ width: 600, height: 500 }),
    [view, setView] = useState({ x: 0, y: 0, k: 1 }),
    [hover, setHover] = useState(""),
    [local, setLocal] = useState(false),
    [moved, setMoved] = useState({});
  useEffect(() => {
    const el = root.current,
      observer = new ResizeObserver(() => {
        if (el.clientWidth > 0)
          setSize({
            width: el.clientWidth,
            height: Math.max(320, el.clientHeight),
          });
      });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const nearby = new Set([
    selected,
    ...links
      .filter((l) => l.from === selected || l.to === selected)
      .flatMap((l) => [l.from, l.to]),
  ]);
  const visible = items.filter((x) => !local || nearby.has(x.key));
  const signature =
    visible.map((x) => x.key).join("|") +
    links.map((l) => l.from + l.to).join("|");
  const positions = useMemo(() => {
    const nodes = visible.map((x) => ({ id: x.key })),
      ids = new Set(nodes.map((n) => n.id));
    const edges = links
      .filter((l) => ids.has(l.from) && ids.has(l.to))
      .map((l) => ({ source: l.from, target: l.to }));
    const sim = forceSimulation(nodes)
      .force(
        "links",
        forceLink(edges)
          .id((n) => n.id)
          .distance(95),
      )
      .force("charge", forceManyBody().strength(-320))
      .force("collide", forceCollide(35))
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .stop();
    sim.tick(160);
    return Object.fromEntries(
      nodes.map((n) => [
        n.id,
        {
          x: Math.max(35, Math.min(size.width - 35, n.x)),
          y: Math.max(35, Math.min(size.height - 35, n.y)),
        },
      ]),
    );
  }, [signature, size.width, size.height]);
  useEffect(() => setMoved({}), [signature, size.width, size.height]);
  const point = (id) => moved[id] || positions[id];
  const focus = hover || selected,
    neighbors = new Set([
      focus,
      ...links
        .filter((l) => l.from === focus || l.to === focus)
        .flatMap((l) => [l.from, l.to]),
    ]);
  const zoom = (delta) => setView(v => {
    const k=Math.max(.35,Math.min(3,v.k*delta)), ratio=k/v.k;
    return {k,x:size.width/2-(size.width/2-v.x)*ratio,y:size.height/2-(size.height/2-v.y)*ratio};
  });

  return (
    <div className="connectionsView">
      <div className="graphToolbar">
        <div className="formatSwitch">
          <button aria-pressed={!local} onClick={() => setLocal(false)}>
            All sources
          </button>
          <button
            aria-pressed={local}
            disabled={!selected}
            onClick={() => setLocal(true)}
          >
            Local connections
          </button>
        </div>
        <span className="graphZoom">
          <button aria-label="Zoom graph out" onClick={() => zoom(0.8)}>
            −
          </button>
          <button
            onClick={() => {
              setView({ x: 0, y: 0, k: 1 });
              setMoved({});
            }}
          >
            Reset view
          </button>
          <button aria-label="Zoom graph in" onClick={() => zoom(1.25)}>
            +
          </button>
        </span>
      </div>
      <div className="graphCanvas" ref={root}>
        <svg
          aria-label="Source connections graph"
          role="group"
          tabIndex={0}
          viewBox={`0 0 ${size.width} ${size.height}`}
          onWheel={(e) => {
            e.stopPropagation();
            zoom(Math.exp(-e.deltaY * 0.002));
          }}
          onKeyDown={(e) => {
            if (
              [
                "+",
                "=",
                "-",
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
              ].includes(e.key)
            ) {
              e.preventDefault();
              if (["+", "="].includes(e.key)) zoom(1.2);
              else if (e.key === "-") zoom(0.8);
              else
                setView((v) => ({
                  ...v,
                  x:
                    v.x +
                    (e.key === "ArrowRight"
                      ? 25
                      : e.key === "ArrowLeft"
                        ? -25
                        : 0),
                  y:
                    v.y +
                    (e.key === "ArrowDown"
                      ? 25
                      : e.key === "ArrowUp"
                        ? -25
                        : 0),
                }));
            }
          }}
          onPointerDown={(e) => {
            if (e.target.closest("[data-node]")) return;
            drag.current = { x: e.clientX, y: e.clientY, view };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (d.node)
              setMoved((p) => ({
                ...p,
                [d.node]: {
                  x: d.point.x + dx / view.k,
                  y: d.point.y + dy / view.k,
                },
              }));
            else setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {links.map((l) => {
              const a = point(l.from),
                b = point(l.to);
              return a && b ? (
                <line
                  key={l.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--blue)"
                  strokeWidth={l.from === focus || l.to === focus ? 2 : 1}
                  opacity={
                    focus && l.from !== focus && l.to !== focus ? 0.2 : 0.65
                  }
                >
                  <title>
                    {items.find((x) => x.key === l.from)?.label} {l.type}{" "}
                    {items.find((x) => x.key === l.to)?.label}
                  </title>
                </line>
              ) : null;
            })}
            {visible.map((n) => {
              const p = point(n.key),
                degree = links.filter(
                  (l) => l.from === n.key || l.to === n.key,
                ).length;
              return (
                p && (
                  <g
                    key={n.key}
                    data-node={n.key}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${n.label}`}
                    aria-pressed={selected === n.key}
                    opacity={focus && !neighbors.has(n.key) ? 0.35 : 1}
                    onFocus={() => setHover(n.key)}
                    onBlur={() => setHover("")}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover("")}
                    onClick={() => onSelect(n.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(n.key);
                      }
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = {
                        node: n.key,
                        point: p,
                        x: e.clientX,
                        y: e.clientY,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  >
                    <title>
                      {n.label} · {degree} connections
                    </title>
                    <circle
                      r={9 + Math.min(9, degree * 1.5)}
                      fill={colors[n.sourceType === "web" ? "web" : n.kind]}
                      stroke={
                        selected === n.key ? "var(--ink)" : "var(--background)"
                      }
                      strokeWidth={selected === n.key ? 3 : 2}
                    />
                    <text
                      y={27}
                      textAnchor="middle"
                      fontSize={12}
                      fill="var(--ink)"
                    >
                      {n.label.length > 34
                        ? n.label.slice(0, 32) + "…"
                        : n.label}
                    </text>
                  </g>
                )
              );
            })}
          </g>
        </svg>
        {!visible.length && (
          <p className="graphEmpty">No sources match this filter.</p>
        )}
      </div>
      <div className="graphLegend">
        {[
          ["paper", "Papers"],
          ["web", "Web pages"],
          ["claim", "Claims"],
          ["evidence", "Experiments"],
        ].map(([k, label]) => (
          <span key={k}>
            <i style={{ background: colors[k] }} />
            {label}
          </span>
        ))}
      </div>
      <details className="graphRelationships">
        <summary>Relationships · {links.length}</summary>
        <p className="hint">
          Links record interpretations, not established proofs. Drag to pan;
          scroll to zoom. Select a node to inspect its notes.
        </p>
        {links.map((l) => (
          <p key={l.id} className="connectionRow">
            {items.find((x) => x.key === l.from)?.label}{" "}
            <strong>{l.type}</strong> {items.find((x) => x.key === l.to)?.label}
          </p>
        ))}
        {!links.length && (
          <p>
            Select an item, then add a relationship in Notes & relationships.
          </p>
        )}
      </details>
    </div>
  );
}
