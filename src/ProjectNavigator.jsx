// Adapted from Axiovela ProjectNavigator.jsx (MIT). Math keeps its existing project IDs and revisioned store.
import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FolderOpen, Pin, X } from "lucide-react";
import ConnectionsGraph from "./ConnectionsGraph.jsx";
import "./project-navigator.css";
import {
  capturePassage,
  textProjection,
  rangeFromAnchor,
} from "./annotation-dom.mjs";

const relations = [
  "related-to",
  "extends",
  "supports",
  "contradicts",
  "uses",
  "tests",
  "motivates",
];
export default function ProjectNavigator({
  current,
  tabs,
  busy,
  api,
  onBrowse,
  onOpen,
}) {
  const [open, setOpen] = useState(false),
    [map, setMap] = useState(false),
    [data, setData] = useState({
      projects: [],
      items: [],
      links: [],
      warnings: [],
    });
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [editing, setEditing] = useState(null),
    [working, setWorking] = useState(false),
    [locating, setLocating] = useState(null);
  const anchor = useRef(),
    trigger = useRef(),
    search = useRef(),
    dialog = useRef(),
    request = useRef(0);
  const selection = useRef(null);
  function captureSelection() {
    const s = window.getSelection(),
      root = s?.anchorNode?.parentElement?.closest(".panel");
    if (root && s.rangeCount && !s.isCollapsed)
      selection.current = {
        root,
        anchor: capturePassage(root, null, { exact: true }),
      };
  }
  function restoreSelection() {
    const saved = selection.current;
    selection.current = null;
    requestAnimationFrame(() => {
      if (!saved?.root.isConnected || !saved.anchor) return;
      const range = rangeFromAnchor(textProjection(saved.root), saved.anchor);
      if (range) {
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
      }
    });
  }
  const menuId = useId();
  const call = (body) =>
    api("/api/project-catalog", { method: "POST", body: JSON.stringify(body) });
  async function refresh() {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await api("/api/project-catalog" + (map ? "?graph=1" : ""));
      if (id === request.current) {
        setData(next);
        if (map)
          setSelected(
            (value) =>
              value ||
              next.items.find(
                (i) => i.projectId === current && i.kind === "project",
              )?.key ||
              next.items[0]?.key ||
              "",
          );
      }
    } catch (e) {
      if (id === request.current) setError(e.message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (open || map) void refresh();
  }, [open, map, current]);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.button === 0 && !anchor.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (map) {
      dialog.current?.showModal();
      setSelected(
        data.projects.find((p) => p.id === current)
          ? `project:${data.projects.find((p) => p.id === current).id}`
          : "",
      );
    } else dialog.current?.close();
  }, [map]);
  async function act(body) {
    setWorking(true);
    setError("");
    try {
      await call(body);
      await refresh();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setWorking(false);
    }
  }
  async function openItem(root, runId) {
    setWorking(true);
    setError("");
    try {
      await onOpen(root, runId);
      setOpen(false);
      setMap(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  const filtered = data.projects.filter((p) =>
    `${p.name} ${p.root} ${p.question || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const item = data.items.find((i) => i.key === selected);
  const visibleProjects = new Set(filtered.map((p) => p.id));
  const graphItems = data.items.filter((i) => visibleProjects.has(i.projectId));
  const graphIds = new Set(graphItems.map((i) => i.key));
  const graphLinks = data.links.filter(
    (l) => graphIds.has(l.from) && graphIds.has(l.to),
  );
  const closeMap = () => {
    dialog.current?.close();
    setMap(false);
    setEditing(null);
    setLocating(null);
    trigger.current?.focus({ preventScroll: true });
    restoreSelection();
  };
  function keyboard(e) {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const buttons = [
      ...anchor.current.querySelectorAll(
        ".projectMenu input,.projectMenu button:not(:disabled)",
      ),
    ];
    const i = buttons.indexOf(document.activeElement),
      next = e.key === "ArrowDown" ? i + 1 : i - 1;
    e.preventDefault();
    buttons[(next + buttons.length) % buttons.length]?.focus();
  }
  return (
    <div
      className="projectNavigator"
      ref={anchor}
      data-annotation-ui="true"
      onKeyDown={keyboard}
    >
      <button
        className="projectSwitch"
        ref={trigger}
        aria-expanded={open}
        aria-controls={menuId}
        onPointerDown={captureSelection}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") captureSelection();
        }}
        onClick={() => setOpen(!open)}
      >
        <FolderOpen size={15} /> Projects <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="projectMenu"
          id={menuId}
          role="region"
          aria-label="Saved projects"
        >
          <input
            ref={search}
            type="search"
            aria-label="Find projects"
            placeholder="Find a project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="savedProjects">
            {filtered.map((p) => (
              <div className="savedProject" key={p.id}>
                <button
                  className="savedProjectOpen"
                  disabled={busy || working || !p.available}
                  aria-current={p.id === current ? "page" : undefined}
                  title={p.root}
                  onClick={() => openItem(p.id)}
                >
                  <strong>{p.name}</strong>
                  <small>{p.root}</small>
                  <span>
                    {p.available
                      ? tabs.some((t) => t.id === p.id)
                        ? "Open tab"
                        : p.pinned
                          ? "Pinned"
                          : "Recent"
                      : p.issue}
                  </span>
                </button>
                <button
                  className="pinProject"
                  aria-label={`${p.pinned ? "Unpin" : "Pin"} ${p.name}`}
                  aria-pressed={p.pinned}
                  disabled={working}
                  onClick={() =>
                    act({ action: "pin", id: p.id, pinned: !p.pinned })
                  }
                >
                  <Pin size={14} />
                </button>
              </div>
            ))}
            {!filtered.length && !loading && (
              <p className="hint">
                {query
                  ? "No matching projects."
                  : "Opened projects will appear here. Add an existing folder to get started."}
              </p>
            )}
          </div>
          {loading && <p role="status">Loading projects…</p>}
          {error && (
            <p role="alert" className="renderError">
              {error}
            </p>
          )}
          <div className="projectMenuActions">
            <button
              onClick={() => {
                setOpen(false);
                onBrowse();
              }}
            >
              Open or create…
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setMap(true);
              }}
            >
              Connections & manage
            </button>
          </div>
        </div>
      )}
      <dialog
        ref={dialog}
        className="projectAtlas"
        aria-label="Project connections and saved folders"
        onCancel={(e) => {
          e.preventDefault();
          closeMap();
        }}
        onClose={() => setMap(false)}
      >
        <header>
          <div>
            <h2>Projects</h2>
            <p>Your saved folders and the work that connects them.</p>
          </div>
          <button aria-label="Close projects" onClick={closeMap}>
            <X size={18} />
          </button>
        </header>
        {map && (
          <>
            <div className="atlasToolbar">
              <input
                aria-label="Filter saved projects"
                type="search"
                placeholder="Find a project…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button onClick={refresh} disabled={loading || working}>
                Refresh
              </button>
              <button
                onClick={() => {
                  closeMap();
                  onBrowse();
                }}
              >
                Add folder…
              </button>
              <button
                disabled={data.items.length < 2 || working}
                onClick={() =>
                  setEditing({
                    from: selected || data.items[0]?.key,
                    to: "",
                    type: "related-to",
                    description: "",
                  })
                }
              >
                Add connection
              </button>
            </div>
            {error && (
              <p role="alert" className="renderError">
                {error}
              </p>
            )}
            <div className="atlasBody">
              <aside aria-label="All saved projects">
                {filtered.map((p) => (
                  <div className="atlasProject" key={p.id}>
                    <button
                      className="atlasProjectSelect"
                      aria-pressed={selected === `project:${p.id}`}
                      onClick={() => setSelected(`project:${p.id}`)}
                    >
                      <strong>{p.name}</strong>
                      <small>{p.root}</small>
                      <span>
                        {p.available
                          ? p.question || "No research question recorded"
                          : p.issue}
                      </span>
                    </button>
                    <div>
                      <button
                        disabled={!p.available || working || busy}
                        onClick={() => openItem(p.id)}
                      >
                        Open tab
                      </button>
                      <button
                        disabled={working}
                        onClick={() =>
                          act({ action: "pin", id: p.id, pinned: !p.pinned })
                        }
                      >
                        {p.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        disabled={working}
                        onClick={() => setLocating({ id: p.id, path: p.root })}
                      >
                        Locate
                      </button>
                      <button
                        disabled={working}
                        title="Remove from this list only; files and tabs stay intact"
                        onClick={() => act({ action: "forget", id: p.id })}
                      >
                        Remove from list
                      </button>
                    </div>
                  </div>
                ))}
                {!filtered.length && (
                  <p className="hint">
                    No matching saved folders. Add a project folder to include
                    it.
                  </p>
                )}
              </aside>
              <section aria-label="Project connections">
                <ConnectionsGraph
                  catalog
                  items={graphItems}
                  links={graphLinks}
                  selected={selected}
                  onSelect={setSelected}
                  context={
                    item && (
                      <div className="atlasItem">
                        <p>{item.detail || "No research question recorded."}</p>
                        <small>{item.location}</small>
                        <button
                          disabled={working || busy}
                          onClick={() => openItem(item.projectId, item.runId)}
                        >
                          Open{" "}
                          {item.kind === "experiment"
                            ? "experiment"
                            : "project"}{" "}
                          in tab
                        </button>
                      </div>
                    )
                  }
                  edgeActions={(link) =>
                    link.manual && (
                      <div className="atlasEdgeActions">
                        <button onClick={() => setEditing({ ...link })}>
                          Edit connection
                        </button>
                        <button
                          disabled={working}
                          onClick={() => act({ action: "unlink", id: link.id })}
                        >
                          Remove connection
                        </button>
                      </div>
                    )
                  }
                />
              </section>
            </div>
            {data.warnings.length > 0 && (
              <details className="atlasWarnings">
                <summary>Index notices · {data.warnings.length}</summary>
                {data.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </details>
            )}
            <p className="atlasPrivacy">
              Only folders you open or add are indexed on this device. Shared
              sources and recorded experiments appear automatically. Other
              relationships need an explanation.
            </p>
            {editing && (
              <form
                className="atlasEditor"
                aria-label="Edit project connection"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act({ action: "link", ...editing }))
                    setEditing(null);
                }}
              >
                <h3>{editing.id ? "Edit connection" : "Add a connection"}</h3>
                {["from", "to"].map((field) => (
                  <label key={field}>
                    {field === "from" ? "From" : "To"}
                    <select
                      aria-label={`Connection ${field}`}
                      required
                      value={editing[field]}
                      onChange={(e) =>
                        setEditing({ ...editing, [field]: e.target.value })
                      }
                    >
                      <option value="">Choose project or experiment</option>
                      {data.items
                        .filter(
                          (i) => field === "from" || i.key !== editing.from,
                        )
                        .map((i) => (
                          <option key={i.key} value={i.key}>
                            {
                              data.projects.find((p) => p.id === i.projectId)
                                ?.name
                            }
                            {i.kind === "experiment" ? ` / ${i.label}` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <label>
                  Relationship
                  <select
                    aria-label="Connection relationship"
                    value={editing.type}
                    onChange={(e) =>
                      setEditing({ ...editing, type: e.target.value })
                    }
                  >
                    {relations.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Why are these connected?
                  <textarea
                    autoFocus
                    required
                    maxLength={4000}
                    aria-label="Connection explanation"
                    placeholder="Describe the connection, evidence and any uncertainty…"
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </label>
                <div>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                  <button disabled={working || !editing.description.trim()}>
                    Save connection
                  </button>
                </div>
              </form>
            )}
            {locating && (
              <form
                className="atlasEditor"
                aria-label="Locate project"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act({ action: "locate", ...locating }))
                    setLocating(null);
                }}
              >
                <h3>Locate moved project</h3>
                <p>
                  Select its existing folder. Saved connection identities are
                  preserved.
                </p>
                <input
                  autoFocus
                  aria-label="Existing project location"
                  value={locating.path}
                  onChange={(e) =>
                    setLocating({ ...locating, path: e.target.value })
                  }
                />
                {window.methodflowDesktop && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const p =
                          await window.methodflowDesktop.chooseProjectFolder();
                        if (p) setLocating({ ...locating, path: p });
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Browse…
                  </button>
                )}
                <div>
                  <button type="button" onClick={() => setLocating(null)}>
                    Cancel
                  </button>
                  <button disabled={working}>Save location</button>
                </div>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
