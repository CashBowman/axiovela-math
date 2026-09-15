import ManuscriptReview from "./ManuscriptReview.jsx";
import { addLibrarySources } from "../shared/library.mjs";
import ConnectionsGraph from "./ConnectionsGraph.jsx";
import { arxivId, arxivBibtex } from "../shared/arxiv.mjs";
import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Plus,
  Upload,
  Search,
  Network,
  FileText,
} from "lucide-react";
import { flushSync } from "react-dom";
import ExperimentBridge from "./ExperimentBridge.jsx";
import { EvidenceReader } from "./ExperimentEvidence.jsx";
import { Panel, Preview, request } from "./ui.jsx";
import ChatPanel from "./ChatPanel.jsx";
import Resizable from "./Resizable.jsx";
export default function Library({
  sourceRequest,
  active = true,
  project,
  update,
  onImport,
  onBibliography,
  resetKey,
  busy,
  beforeSend,
  onArtifact,
  importRequested,
  onImportHandled,
}) {
  useEffect(() => {
    if (importRequested) {
      setImportOpen(true);
      onImportHandled();
    }
  }, [importRequested]);
  const libraryChat = useRef();
  const [editAnnotation, setEditAnnotation] = useState(null);
  const [evidence, setEvidence] = useState([]),
    [importOpen, setImportOpen] = useState(false),
    [bridgeError, setBridgeError] = useState(""),
    [showRemoved, setShowRemoved] = useState(false),
    [removedId, setRemovedId] = useState("");
  async function removeEvidence(id, removed) {
    setBridgeError("");
    try {
      const r = await request("/api/bridge/evidence?project=" + project.id, {
        method: "PUT",
        body: JSON.stringify({ id, removed }),
      });
      setEvidence(r.items);
      setRemovedId(removed ? id : "");
      if (!removed) setSelected("evidence:" + id);
    } catch (e) {
      setBridgeError(e.message);
    }
  }
  async function refreshEvidence() {
    const r = await request("/api/bridge/evidence?project=" + project.id);
    setEvidence(r.items);
  }
  useEffect(() => {
    refreshEvidence().catch((e) => setBridgeError(e.message));
  }, [project.id]);
  async function imported(items, a) {
    flushSync(() =>
      update((p) => {
        let claims = p.claims;
        let claimId = a.claimId;
        if (claimId === "new") {
          const existing = p.evidenceNotes?.[items[0].id]?.claimId;
          if (existing) claimId = existing;
          else {
            claimId =
              "C" +
              (Math.max(0, ...claims.map((c) => Number(c.id.slice(1)) || 0)) +
                1);
            claims = [
              ...claims,
              {
                id: claimId,
                statement: a.claim.trim(),
                revision: 1,
                status: "conjecture",
                reviewer: "",
                reviewNote: "",
              },
            ];
          }
        }
        const c = claims.find((c) => c.id === claimId);
        return {
          claims,
          evidenceNotes: {
            ...p.evidenceNotes,
            ...Object.fromEntries(
              items.map((item) => [
                item.id,
                {
                  kind: a.kind,
                  note: a.note,
                  claimId: c?.id || "",
                  claimRevision: c?.revision,
                },
              ]),
            ),
          },
        };
      }),
    );
    await beforeSend();
    await refreshEvidence();
    setSelected("evidence:" + items[0].id);
    setView("reader");
  }
  const [importing, setImporting] = useState(false),
    [importStatus, setImportStatus] = useState("");
  async function importArxiv(e, input = filter) {
    e?.preventDefault();
    if (importing) return;
    setImportStatus("");
    setImporting(true);
    try {
      const id = arxivId(input);
      const existing = project.papers.find(
        (p) =>
          p.arxivId === id ||
          (!/v\d+$/.test(id) && p.arxivId?.replace(/v\d+$/, "") === id),
      );
      if (existing) {
        setFilter("");
        setSelected("paper:" + existing.id);
        setImportStatus("Already in your library.");
        return;
      }
      const { paper } = await request("/api/papers/arxiv", {
        method: "POST",
        body: JSON.stringify({ input: id }),
      });
      update((p) => {
        const bibliography = p.bibliography.includes(
          "{" + paper.citationKey + ",",
        )
          ? p.bibliography
          : p.bibliography.trim() + "\n\n" + arxivBibtex(paper) + "\n";
        return {
          ...addLibrarySources({ ...p, bibliography }, [paper]),
          bibliography,
        };
      });
      setSelected("paper:" + paper.id);
      setView("reader");
      setFilter("");
      setImportStatus("Added PDF and citation: " + paper.title);
    } catch (e) {
      setImportStatus(e.message);
    } finally {
      setImporting(false);
    }
  }
  useEffect(() => {
    if (sourceRequest) {
      setSelected("paper:" + sourceRequest.id);
      setView("reader");
      if (sourceRequest.annotationId) {
        setEditAnnotation({ id: sourceRequest.annotationId, at: Date.now() });
      }
    }
  }, [sourceRequest]);
  useEffect(() => {
    const open = (e) => {
      setSelected("paper:" + e.detail);
      setView("reader");
    };
    window.addEventListener("math-open-source", open);
    return () => window.removeEventListener("math-open-source", open);
  }, []);
  async function importLink(e, input = filter) {
    e?.preventDefault();
    try {
      arxivId(input);
      return importArxiv(null, input);
    } catch {}
    if (importing) return;
    setImporting(true);
    setImportStatus("");
    try {
      const { paper, notice } = await request("/api/library/link", {
        method: "POST",
        body: JSON.stringify({ input }),
      });
      update((p) => addLibrarySources(p, [paper]));
      setSelected("paper:" + paper.id);
      setView("reader");
      setFilter("");
      setImportStatus(notice || "Added " + paper.title);
    } catch (e) {
      setImportStatus(e.message);
    } finally {
      setImporting(false);
    }
  }
  const [sourceFilter, setSourceFilter] = useState("all");
  const [filter, setFilter] = useState(""),
    [selected, setSelected] = useState(""),
    [view, setView] = useState("reader"),
    [newClaim, setNewClaim] = useState(""),
    [add, setAdd] = useState(false);
  const items = [
    ...evidence
      .filter((e) => showRemoved || !e.removed)
      .map((e) => ({
        ...e,
        key: "evidence:" + e.id,
        kind: "evidence",
        label: e.record.name,
      })),
    ...project.papers.map((p) => ({
      ...p,
      key: "paper:" + p.id,
      kind: "paper",
      label: p.title,
    })),
    ...project.claims.map((c) => ({
      ...c,
      key: "claim:" + c.id,
      kind: "claim",
      label: c.id + " · " + c.statement,
    })),
    ...(project.graphNodes || []).map((n) => ({
      ...n,
      key: "idea:" + n.id,
      label: n.title,
    })),
  ];
  const item =
    items.find(
      (x) =>
        x.key === selected || x.aliases?.some((a) => "paper:" + a === selected),
    ) || items[0];
  const filteredItems = items.filter(
    (x) =>
      (sourceFilter === "all" ||
        (sourceFilter === "pdf" &&
          x.kind === "paper" &&
          x.sourceType !== "web") ||
        (sourceFilter === "web" && x.sourceType === "web") ||
        (sourceFilter === "unread" && x.kind === "paper" && !x.read) ||
        x.kind === sourceFilter) &&
      [x.label, x.arxivId, x.sourceUrl, ...(x.authors || [])]
        .join(" ")
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const manualLinks = project.links || [];
  const links = [
    ...manualLinks,
    ...evidence
      .filter((e) => !e.removed && project.evidenceNotes?.[e.id]?.claimId)
      .map((e) => {
        const n = project.evidenceNotes[e.id],
          c = project.claims.find((c) => c.id === n.claimId);
        return {
          id: "association-" + e.id,
          from: "evidence:" + e.id,
          to: "claim:" + n.claimId,
          type:
            c?.revision !== n.claimRevision
              ? "connection needs review"
              : n.kind === "counterexample"
                ? "tests"
                : n.kind === "witness"
                  ? "candidate witness for"
                  : "informs",
          evidenceId: e.id,
        };
      }),
  ];
  const left = (
    <Panel
      title="Research library"
      label="LIBRARY"
      className="fill"
      action={
        <button onClick={onBibliography}>
          <BookOpen size={13} />
          BibTeX
        </button>
      }
    >
      <div className="panelBody">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^https?:/i.test(filter)) void importLink(null, filter);
            else
              try {
                arxivId(filter);
                void importArxiv(null, filter);
              } catch {}
          }}
        >
          <Search size={14} />
          <input
            aria-label="Search library"
            placeholder="Search or paste a link / arXiv ID…"
            value={filter}
            disabled={importing}
            onChange={(e) => setFilter(e.target.value)}
            onPaste={(e) => {
              const value = e.clipboardData.getData("text").trim();
              let link = /^https?:\/\//i.test(value);
              try {
                arxivId(value);
                link = true;
              } catch {}
              if (link) {
                e.preventDefault();
                setFilter("");
                void importLink(null, value);
              }
            }}
          />
          {importing && <span role="status">Importing…</span>}
        </form>
        <select
          aria-label="Filter library"
          className="libraryFilter"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          {[
            ["all", "All sources & ideas"],
            ["pdf", "Papers & PDFs"],
            ["web", "Web pages"],
            ["unread", "Unread sources"],
            ["evidence", "Experiments"],
            ["claim", "Claims"],
            ["theorem", "Theorems"],
            ["lemma", "Lemmas"],
            ["proof", "Proofs"],
          ].map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {importStatus && (
          <p className="importStatus" role="status">
            {importStatus}
            <button
              className="icon"
              aria-label="Dismiss import message"
              onClick={() => setImportStatus("")}
            >
              ×
            </button>
          </p>
        )}
        {removedId && (
          <p className="hint">
            Experiment removed.{" "}
            <button onClick={() => removeEvidence(removedId, false)}>
              Undo
            </button>
          </p>
        )}
        {evidence.some((e) => e.removed) && (
          <label className="removedEvidence">
            <input
              type="checkbox"
              checked={showRemoved}
              onChange={(e) => setShowRemoved(e.target.checked)}
            />{" "}
            Show removed experiments
          </label>
        )}
        {bridgeError && (
          <p role="alert" className="inlineError">
            {bridgeError}
          </p>
        )}
        <div className="row libraryActions">
          <label className="button">
            <Upload size={13} />
            Import PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={onImport}
              disabled={busy}
              hidden
            />
          </label>
          <button onClick={() => setAdd(!add)}>
            <Plus size={13} />
            Claim
          </button>
        </div>
        {add && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const id =
                "C" +
                (Math.max(
                  0,
                  ...project.claims.map((c) => Number(c.id.slice(1)) || 0),
                ) +
                  1);
              update((p) => ({
                claims: [
                  ...p.claims,
                  {
                    id,
                    statement: newClaim,
                    revision: 1,
                    status: "conjecture",
                    reviewer: "",
                    reviewNote: "",
                  },
                ],
              }));
              setSelected("claim:" + id);
              setNewClaim("");
              setAdd(false);
            }}
          >
            <p className="hint">
              Optional: record a precise statement so sources and evidence can
              refer to the same revision.
            </p>
            <label>
              New claim
              <textarea
                value={newClaim}
                onChange={(e) => setNewClaim(e.target.value)}
                required
              />
            </label>
            <button type="submit">Add claim</button>
          </form>
        )}
      </div>
      <div className="libraryList">
        {["paper", "evidence", "claim", "theorem", "lemma", "proof"]
          .filter((kind) => filteredItems.some((x) => x.kind === kind))
          .map((kind) => (
            <div key={kind}>
              <h3>
                {kind === "paper"
                  ? "Sources"
                  : kind === "evidence"
                    ? "Experiments"
                    : kind === "theorem"
                      ? "Theorems"
                      : kind === "lemma"
                        ? "Lemmas"
                        : kind === "proof"
                          ? "Proofs"
                          : "Claims"}
              </h3>
              {filteredItems
                .filter((x) => x.kind === kind)
                .map((x) => (
                  <div className="libraryItem" key={x.key}>
                    {kind === "paper" && (
                      <label className="readToggle" title="Read by you">
                        <input
                          type="checkbox"
                          aria-label={"Mark " + x.title + " as read"}
                          checked={!!x.read}
                          onChange={(e) =>
                            update((p) => ({
                              papers: p.papers.map((paper) =>
                                paper.id === x.id
                                  ? { ...paper, read: e.target.checked }
                                  : paper,
                              ),
                            }))
                          }
                        />
                      </label>
                    )}
                    <button
                      className={item?.key === x.key ? "chosen" : ""}
                      onClick={() => setSelected(x.key)}
                    >
                      {kind === "paper" ? (
                        <BookOpen size={15} />
                      ) : (
                        <FileText size={15} />
                      )}
                      <span>
                        {x.label}
                        <small className="sourceMeta">
                          <span>
                            {kind === "paper"
                              ? (x.sourceType === "web" ? "Web page" : "PDF") +
                                " · " +
                                (x.read ? "Read" : "Unread")
                              : kind === "evidence"
                                ? x.sourceName +
                                  (x.removed
                                    ? " · removed"
                                    : " · " +
                                      new Date(x.capturedAt).toLocaleString(
                                        [],
                                        {
                                          month: "short",
                                          day: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                        },
                                      ))
                                : (x.status || "unverified").replaceAll(
                                    "-",
                                    " ",
                                  )}
                          </span>
                          {kind === "paper" && x.discovered && (
                            <span
                              className="sourceAiAttribution"
                              title="Added by the Math Assistant"
                              aria-label="AI-added source"
                            >
                              AI added source
                            </span>
                          )}
                        </small>
                      </span>
                    </button>
                  </div>
                ))}
            </div>
          ))}
        {!filteredItems.length && (
          <p className="empty">
            No matching sources. Import your first source or record a claim.
            Their connections will grow with the argument.
          </p>
        )}
      </div>
    </Panel>
  );
  const middle = (
    <Panel
      expandable
      expandLabel="paper reader"
      title={
        view === "web"
          ? "How the ideas connect"
          : item?.kind === "paper"
            ? item.title
            : item?.kind === "evidence"
              ? item.record.name
              : item?.label || "Reading workspace"
      }
      label={
        view === "web"
          ? "EXPLICIT RELATIONSHIPS"
          : item?.kind === "claim"
            ? "MATHEMATICAL CLAIM"
            : item?.kind === "evidence"
              ? "SAVED EXPERIMENT"
              : "PAPER READER"
      }
      className="fill libraryReaderPanel"
      action={
        <>
          <div className="formatSwitch">
            <button
              className={view === "reader" ? "selected" : ""}
              onClick={() => setView("reader")}
            >
              Read
            </button>
            <button
              className={view === "web" ? "selected" : ""}
              onClick={() => setView("web")}
            >
              <Network size={13} />
              Connections
            </button>
          </div>
          {view === "reader" && item?.sourceUrl && (
            <a
              className="readerOriginal"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open original
            </a>
          )}
        </>
      }
    >
      {view === "web" ? (
        <ConnectionsGraph
          items={filteredItems}
          links={links.filter(
            (l) =>
              filteredItems.some((x) => x.key === l.from) &&
              filteredItems.some((x) => x.key === l.to),
          )}
          selected={item?.key}
          onSelect={setSelected}
          onAsk={() =>
            libraryChat.current?.addPrompt(
              "Update research/connections.json: examine the library sources, develop justified claim/theorem/lemma/proof nodes, and connect them to exact source statements with page numbers and hypotheses. Preserve existing notes. " +
                (item
                  ? "Focus first on " + item.label + " (" + item.key + ")."
                  : ""),
            )
          }
          context={
            <>
              <h3>{item?.label}</h3>
              <Preview
                prose
                source={
                  item?.text && item?.kind !== "paper"
                    ? item.text
                    : item?.statement || ""
                }
              />
              <Preview
                prose
                source={[
                  item?.notes,
                  project.sourceNotes?.[item?.key],
                  item?.reviewNote,
                  item?.kind === "evidence"
                    ? project.evidenceNotes?.[item.id]?.note
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              />
              {item?.citationKey && (
                <p className="hint">Citation key: {item.citationKey}</p>
              )}
              <p className="hint">
                AI interpretations require checking against the source and exact
                hypotheses. Node shapes describe document roles, not proof
                certification.
              </p>
            </>
          }
        />
      ) : item?.kind === "evidence" ? (
        <EvidenceReader
          key={item.id}
          item={item}
          project={project}
          onRemove={removeEvidence}
        />
      ) : item?.kind === "paper" ? (
        <>
          <div className="sourceOrigin">
            {item.attachmentError && (
              <span title={item.attachmentError}>
                Article snapshot · PDF unavailable{" "}
                <button
                  disabled={importing}
                  onClick={() => importLink(null, item.sourceUrl)}
                >
                  Retry PDF
                </button>
              </span>
            )}
            {item.sourceType === "web" && !item.text && (
              <span>
                {item.previewError
                  ? "Preview unavailable. " + item.previewError
                  : "Fetching readable content…"}
                {item.previewError && (
                  <button
                    disabled={importing}
                    onClick={() => importLink(null, item.sourceUrl)}
                  >
                    Retry import
                  </button>
                )}
              </span>
            )}
          </div>
          <ManuscriptReview
            key={item.id}
            project={project}
            format={item.sourceType === "web" ? "markdown" : "pdf"}
            target={{ kind: "paper", id: item.id }}
            pdf={
              item.sourceType !== "web"
                ? { url: `/api/papers/${item.pdfId || item.id}.pdf` }
                : null
            }
            update={update}
            annotating
            editRequest={editAnnotation}
            onQueue={(id) => libraryChat.current?.queueAnnotation(id)}
          />
        </>
      ) : item ? (
        <div className="scrollBody">
          <Preview
            source={`## ${item.id}\n\n${item.statement || item.text || ""}\n\n### Argument and obligations\n\n${item.reviewNote || "No proof or supporting evidence has been recorded."}`}
          />
          <div className="panelBody">
            <span className="badge">
              Revision {item.revision} ·{" "}
              {(item.status || "unverified").replaceAll("-", " ")}
            </span>
          </div>
        </div>
      ) : (
        <div className="empty largeEmpty">
          Your sources and arguments belong together. Choose a paper or claim to
          inspect it here.
        </div>
      )}
    </Panel>
  );
  const right = active ? (
    <ChatPanel
      key={project.id + "research"}
      project={project}
      role="research"
      workspace="library"
      reviewRef={libraryChat}
      onEditAnnotation={(note) => {
        if (note.target?.kind === "paper") {
          setSelected("paper:" + note.target.id);
          setView("reader");
          setEditAnnotation({ id: note.id, at: Date.now() });
        } else
          window.dispatchEvent(
            new CustomEvent("math-edit-proof-note", { detail: note.id }),
          );
      }}
      beforeSend={beforeSend}
      onArtifact={onArtifact}
      context={
        item
          ? {
              kind: item.key.startsWith("idea:") ? "idea" : item.kind,
              id: item.id,
            }
          : null
      }
      contextLabel={
        item?.kind === "paper"
          ? item.title
          : item?.kind === "evidence"
            ? item.record.name
            : item?.label || "No source selected"
      }
    />
  ) : null;
  return (
    <>
      <Resizable
        key={resetKey}
        resetKey={resetKey}
        id="library"
        defaults={[23, 43, 34]}
      >
        {[left, middle, right]}
      </Resizable>
      {importOpen && (
        <ExperimentBridge
          existing={evidence}
          project={project}
          beforeImport={beforeSend}
          onImported={imported}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}
