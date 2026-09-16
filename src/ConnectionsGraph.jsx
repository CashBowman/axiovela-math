import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from "d3-force";
import { Preview } from "./ui.jsx";
const colors = {
  project: "#497e85",
  experiment: "#8a789d",
  paper: "#4d7898",
  web: "#668878",
  claim: "#b48b43",
  evidence: "#8a789d",
  theorem: "#497e85",
  proof: "#95627b",
  lemma: "#677c55",
};
function NodeShape({ kind, r = 12, ...props }) {
  if (kind === "claim")
    return <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...props} />;
  if (kind === "theorem")
    return (
      <polygon
        points={`${-r},0 ${-r / 2},${-r} ${r / 2},${-r} ${r},0 ${r / 2},${r} ${-r / 2},${r}`}
        {...props}
      />
    );
  if (kind === "lemma")
    return (
      <rect
        x={-r * 1.3}
        y={-r * 0.65}
        width={2.6 * r}
        height={1.3 * r}
        rx={5}
        {...props}
      />
    );
  if (kind === "evidence" || kind === "experiment")
    return <polygon points={`0,${-r} ${r},${r} ${-r},${r}`} {...props} />;
  if (kind === "proof" || kind === "web")
    return (
      <rect
        x={-r}
        y={-r * 0.8}
        width={2 * r}
        height={r * 1.6}
        rx={kind === "web" ? 5 : 0}
        {...props}
      />
    );
  return <circle r={r} {...props} />;
}
export default function ConnectionsGraph({
  items,
  links,
  selected,
  onSelect,
  onAsk,
  context,
  catalog = false,
  edgeActions,
}) {
  const arrowId = useId();
  const root = useRef(),
    drag = useRef();
  const [size, setSize] = useState({ width: 600, height: 500 }),
    [view, setView] = useState({ x: 0, y: 0, k: 1 }),
    [hover, setHover] = useState(""),
    [edgeId, setEdgeId] = useState(null),
    [local, setLocal] = useState(catalog),
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
  const selectedEdge = links.find((l) => l.id === edgeId);
  const selectNode = (key) => {
    setEdgeId(null);
    onSelect(key);
  };
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
          .distance(160),
      )
      .force("charge", forceManyBody().strength(-320))
      .force("collide", forceCollide(78))
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
  const offsets = useMemo(() => {
    const groups = new Map(),
      values = {};
    for (const link of links) {
      const key = [link.from, link.to].sort().join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(link);
    }
    for (const group of groups.values())
      group.forEach((l, i) => {
        values[l.id] =
          (i - (group.length - 1) / 2) * 55 * (l.from < l.to ? 1 : -1);
      });
    return values;
  }, [links]);
  const point = (id) => moved[id] || positions[id];
  const focus = hover || selected,
    neighbors = new Set([
      focus,
      ...links
        .filter((l) => l.from === focus || l.to === focus)
        .flatMap((l) => [l.from, l.to]),
    ]);
  const zoom = (delta) =>
    setView((v) => {
      const k = Math.max(0.35, Math.min(3, v.k * delta)),
        ratio = k / v.k;
      return {
        k,
        x: size.width / 2 - (size.width / 2 - v.x) * ratio,
        y: size.height / 2 - (size.height / 2 - v.y) * ratio,
      };
    });

  return (
    <div className="connectionsView">
      <div className="graphToolbar">
        <div className="formatSwitch">
          <button aria-pressed={!local} onClick={() => setLocal(false)}>
            {catalog ? "Overview" : "All sources"}
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
            if (e.target.closest("[data-node],[data-edge]")) return;
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
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--blue)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {links.map((l) => {
              const a = point(l.from),
                b = point(l.to);
              const from = items.find((x) => x.key === l.from)?.label || l.from,
                to = items.find((x) => x.key === l.to)?.label || l.to,
                length =
                  a && b ? Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) : 1,
                line =
                  a && b
                    ? {
                        x1: a.x + ((b.x - a.x) / length) * 16,
                        y1: a.y + ((b.y - a.y) / length) * 16,
                        x2: b.x - ((b.x - a.x) / length) * 21,
                        y2: b.y - ((b.y - a.y) / length) * 21,
                      }
                    : {};
              const offset = offsets[l.id] || 0;
              const curve =
                a && b
                  ? `M ${line.x1} ${line.y1} Q ${(a.x + b.x) / 2 - ((b.y - a.y) / length) * offset} ${(a.y + b.y) / 2 + ((b.x - a.x) / length) * offset} ${line.x2} ${line.y2}`
                  : "";
              return a && b ? (
                <g
                  key={l.id}
                  data-edge={l.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Explain connection: ${from} ${l.type} ${to}`}
                  aria-pressed={edgeId === l.id}
                  className="graphEdge"
                  onClick={() => setEdgeId(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEdgeId(l.id);
                    }
                  }}
                >
                  <path
                    d={curve}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={24}
                    vectorEffect="non-scaling-stroke"
                    className="edgeHit"
                  />
                  <path
                    d={curve}
                    fill="none"
                    markerEnd={
                      l.type === "shares sources with"
                        ? undefined
                        : `url(#${arrowId})`
                    }
                    strokeDasharray={
                      l.type === "contradicts" ? "5 4" : undefined
                    }
                    stroke={
                      edgeId === l.id
                        ? "var(--ink)"
                        : l.manual
                          ? "var(--gold-text)"
                          : "var(--blue)"
                    }
                    strokeWidth={
                      edgeId === l.id
                        ? 3
                        : l.from === focus || l.to === focus
                          ? 2
                          : 1
                    }
                    opacity={
                      edgeId === l.id
                        ? 1
                        : focus && l.from !== focus && l.to !== focus
                          ? 0.25
                          : 0.65
                    }
                  />
                  <title>
                    {from} {l.type} {to}
                  </title>
                </g>
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
                    style={{ pointerEvents: "bounding-box" }}
                    data-node={n.key}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${n.label}`}
                    aria-pressed={selected === n.key}
                    opacity={focus && !neighbors.has(n.key) ? 0.7 : 1}
                    onFocus={() => setHover(n.key)}
                    onBlur={() => setHover("")}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover("")}
                    onClick={() => selectNode(n.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectNode(n.key);
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
                    <NodeShape
                      kind={n.sourceType === "web" ? "web" : n.kind}
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
          ...(catalog
            ? [
                ["project", "Projects"],
                ["experiment", "Experiments"],
              ]
            : []),
          ["paper", "Papers"],
          ["web", "Web pages"],
          ["claim", "Claims"],
          ["theorem", "Theorems"],
          ["lemma", "Lemmas"],
          ["proof", "Proofs"],
          ["evidence", "Experiments"],
        ]
          .filter(([k]) => !catalog || items.some((i) => i.kind === k))
          .map(([k, label]) => (
            <span key={k}>
              <svg
                width="22"
                height="22"
                viewBox="-15 -15 30 30"
                aria-hidden="true"
              >
                <NodeShape kind={k} fill={colors[k]} />
              </svg>
              {label}
            </span>
          ))}
      </div>
      {catalog && (
        <div className="graphLegend">
          <span className="edgeLegend">
            <i aria-hidden="true" />
            Recorded or exact match
          </span>
          <span className="edgeLegend manual">
            <i aria-hidden="true" />
            User connection
          </span>
        </div>
      )}
      {selectedEdge ? (
        <section
          className="connectionDetail"
          aria-label="Connection explanation"
        >
          <div className="connectionDetailHead">
            <strong>Connection</strong>
            <button
              aria-label="Close connection explanation"
              onClick={() => {
                const el = [
                  ...root.current.querySelectorAll("[data-edge]"),
                ].find((el) => el.dataset.edge === edgeId);
                setEdgeId(null);
                el?.focus();
              }}
            >
              ×
            </button>
          </div>
          <div className="connectionEndpoints">
            <button onClick={() => selectNode(selectedEdge.from)}>
              {items.find((x) => x.key === selectedEdge.from)?.label}
            </button>
            <strong>
              {selectedEdge.type}{" "}
              {selectedEdge.type === "shares sources with" ? "↔" : "→"}
            </strong>
            <button onClick={() => selectNode(selectedEdge.to)}>
              {items.find((x) => x.key === selectedEdge.to)?.label}
            </button>
          </div>
          <Preview
            prose
            source={
              selectedEdge.description ||
              selectedEdge.reason ||
              "No explanation recorded. Ask the Math Assistant to examine this relationship."
            }
          />
          {selectedEdge.location && (
            <p className="hint">Recorded location: {selectedEdge.location}</p>
          )}
          {selectedEdge.evidence?.length > 0 && (
            <ul>
              {selectedEdge.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {edgeActions?.(selectedEdge)}
          <p className="hint">
            {selectedEdge.origin === "assistant"
              ? "Assistant interpretation"
              : selectedEdge.origin || "Recorded relationship"}{" "}
            · Requires evidence and scope review; not a certificate.
          </p>
        </section>
      ) : (
        <details
          className="graphInspector"
          key={selected}
          open={catalog ? !!selected : undefined}
        >
          <summary>
            Selected item ·{" "}
            {items.find((x) => x.key === selected)?.label || "Choose a node"}
          </summary>
          {context}
        </details>
      )}
      {!catalog && (
        <div className="graphAssistant">
          <button onClick={onAsk}>
            Ask Math Assistant to update connections
          </button>
          <small>Adds a draft message for you to send.</small>
        </div>
      )}
      <details className="graphRelationships">
        <summary>Relationships · {links.length}</summary>
        <p className="hint">
          Arrows read “from → to”; the relation and justification appear below.
          Dashed arrows mean “contradicts”. Links record interpretations, not
          established proofs. Drag to pan; scroll to zoom. Select a node to
          inspect its notes, or an edge to read its explanation.
        </p>
        {links.map((l) => (
          <p key={l.id} className="connectionRow">
            {items.find((x) => x.key === l.from)?.label}{" "}
            <button
              className="relationshipSelect"
              onClick={() => setEdgeId(l.id)}
            >
              {l.type}
            </button>{" "}
            {items.find((x) => x.key === l.to)?.label}
            {(l.description || l.reason) && (
              <small className="connectionReason">
                {l.origin || "Recorded interpretation"}:{" "}
                {l.description || l.reason}
              </small>
            )}
          </p>
        ))}
        {!links.length && (
          <p>
            {catalog
              ? "Add an explained connection or import the same source into both libraries."
              : "Ask the Math Assistant to connect the sources as it develops the argument."}
          </p>
        )}
      </details>
    </div>
  );
}
