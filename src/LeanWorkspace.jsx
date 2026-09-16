import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Play } from "lucide-react";
import { Panel, Preview, request } from "./ui.jsx";
import Resizable from "./Resizable.jsx";
import ChatPanel from "./ChatPanel.jsx";
import {
  certificateResults,
  certificateOutline,
  resultCheckState,
  certificateProgress,
  leanCheckLabel,
  leanItemLabel,
  leanItemStatus,
} from "../shared/certificate-results.mjs";
export default function LeanWorkspace({
  project,
  resetKey,
  manuscriptFormat = "markdown",
  renderedManuscript,
  beforeSend,
  onArtifact,
}) {
  const [data, setData] = useState({ records: [], files: [] }),
    [selectedRef, setSelectedRef] = useState(""),
    [checking, setChecking] = useState(false),
    [error, setError] = useState(""),
    [setupMessage, setSetupMessage] = useState("");
  const api = "/api/lean?project=" + project.id;
  useEffect(() => {
    let canceled = false,
      timer;
    async function poll() {
      try {
        const result = await request(api);
        if (!canceled) setData(result);
      } catch (e) {
        if (!canceled) setError(e.message);
      }
      if (!canceled) timer = setTimeout(poll, 1400);
    }
    poll();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [project.id]);
  async function refresh() {
    setData(await request(api));
  }
  async function run(build) {
    setChecking(true);
    setError("");
    try {
      await request(api, {
        method: "POST",
        body: JSON.stringify({ run: build }),
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }
  async function setup() {
    setError("");
    try {
      const result = await request("/api/lean/setup?project=" + project.id, {
        method: "POST",
        body: "{}",
      });
      setSetupMessage(result.message);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  async function copySetup() {
    try {
      await navigator.clipboard.writeText(data.setup.command);
      setSetupMessage(
        "Setup command copied. Paste it into a terminal; downloads and the test run automatically.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  const busy = checking || data.running || data.setup?.busy,
    current = data.records[0],
    plan = data.plan;

  const [compiled, setCompiled] = useState({});
  useEffect(() => {
    let canceled = false;
    if (manuscriptFormat === "latex")
      request("/api/manuscript-labels?project=" + project.id)
        .then((value) => {
          if (!canceled) setCompiled(value);
        })
        .catch(() => {
          if (!canceled) setCompiled({});
        });
    return () => {
      canceled = true;
    };
  }, [project.id, project.latex, manuscriptFormat, data.sourceHash]);
  const results = certificateOutline(
      certificateResults(project, data),
      project.links,
      {
        source: project[manuscriptFormat],
        format: manuscriptFormat,
        compiled: renderedManuscript || compiled,
      },
    ),
    selected =
      results.find((r) => r.ref === selectedRef) ||
      results.find((r) => r.mainResult) ||
      results[0],
    state = selected ? resultCheckState(selected, { ...data, running: checking || data.running }) : null,
    progress = certificateProgress(results, data),
    related = (project.links || []).filter(
      (l) => l.from === selected?.ref || l.to === selected?.ref,
    );
  const label = (ref) =>
    results.find((r) => r.ref === ref)?.label ||
    project.papers.find((p) => "paper:" + p.id === ref)?.title ||
    ref;
  const left = (
    <Panel
      title="Results"
      label="CLAIMS & FORMALIZATION"
      className="fill resultNavigator"
    >
      <div className="scrollBody panelBody">
        <div className="resultProgress" aria-label="Formalization progress">
          <strong>
            {progress.total} results · {progress.main} main
          </strong>
          <span>{progress.linked} linked to formal source</span>
          <small>
            Lean checks the saved proofs and their axioms. Matching the formal
            statements to your claims is assessed separately by the assistant.
          </small>
        </div>
        {!results.length && (
          <p className="hint">
            Ask the Math Assistant to develop your question. Proposed claims,
            theorems and lemmas appear here automatically.
          </p>
        )}
        {!!results.length && (
          <p className="resultOutlineHint">
            {manuscriptFormat === "latex"
              ? "LaTeX manuscript order"
              : "Markdown manuscript order"}
          </p>
        )}
        <div className="resultCards" aria-label="Research results">
          {results.map((r, index) => {
            const status = resultCheckState(r, { ...data, running: checking || data.running });
            return (
              <React.Fragment key={r.ref}>
                {(index === 0 || results[index - 1].section !== r.section) && (
                  <h3 className="resultSection">{r.section}</h3>
                )}
                <button
                  key={r.ref}
                  className="resultCard"
                  aria-pressed={selected?.ref === r.ref}
                  onClick={() => setSelectedRef(r.ref)}
                >
                  <span className="resultCardMeta">
                    <span>{r.label}</span>
                    {r.mainResult && (
                      <span className="mainResultTag">Main result</span>
                    )}
                  </span>
                  <strong>{r.displayTitle}</strong>
                  {!!r.prerequisites.length && (
                    <span className="resultPrerequisites">
                      Builds on {r.prerequisites.map(label).join(", ")}
                    </span>
                  )}
                  {r.circular && (
                    <span className="resultPrerequisites">
                      Circular dependencies
                    </span>
                  )}
                  <span className={"resultState " + status.tone}>
                    {status.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {data.planError && <p className="inlineError">{data.planError}</p>}
      </div>
    </Panel>
  );
  const middle = (
    <Panel
      title="Certificate status"
      label="SAVED FORMAL WORK"
      className="fill"
      action={
        <button onClick={() => refresh().catch((e) => setError(e.message))}>
          <RefreshCw size={13} />
          Refresh
        </button>
      }
    >
      <div className="scrollBody panelBody">
        {selected && (
          <section className="selectedResult" aria-label="Selected result">
            <div className="resultCardMeta">
              <span>{selected.label}</span>
              {selected.mainResult && (
                <span className="mainResultTag">Main result</span>
              )}
            </div>
            <h3>{selected.displayTitle}</h3>
            {!!selected.prerequisites.length && (
              <div
                className="resultOutlineLinks"
                aria-label="Supporting results"
              >
                <span>Builds on</span>
                {selected.prerequisites.map((ref) => (
                  <button key={ref} onClick={() => setSelectedRef(ref)}>
                    {label(ref)}
                  </button>
                ))}
              </div>
            )}
            {selected.circular && (
              <p className="hint">
                A circular connection prevents a complete dependency order.
                Review the proposed links below.
              </p>
            )}
            <Preview source={selected.statement} lean />
            <p className={"resultState " + state.tone}>{state.label}</p>
            <p className="hint">{state.detail}</p>
            {selected.formal?.declarations?.length > 0 && (
              <>
                <h4>Linked Lean theorems and definitions</h4>
                {selected.formal.declarations.map((n) => (
                  <p className="declarationName" key={n}>
                    {n}
                  </p>
                ))}
              </>
            )}
            {!data.stale && current?.status === 'build-passed' && current.declarationChecks?.filter(c => selected.formal?.declarations?.includes(c.name)).map(c => (
              <div className="checkRow" key={c.name}>
                {c.status === 'checked' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <div><strong>{c.name}</strong><p>{({checked: 'Proof verified; only standard Lean axioms used.', incomplete: 'An unfinished proof (sorry) occurs in this theorem or a dependency.', 'extra-axioms': 'Additional axioms are used: ' + (c.axioms || []).join(', '), missing: 'This declaration was not found in the saved entry file.', 'not-a-theorem': 'This declaration is not a theorem.', 'invalid-name': 'The saved declaration name cannot be checked.'})[c.status] || c.detail || 'Declaration check unavailable.'}</p></div>
              </div>
            ))}
            {selected.formal?.scopeNotes && (
              <>
                <h4>Assistant assessment of statement matching</h4>
                <Preview source={selected.formal.scopeNotes} lean />
              </>
            )}
            {["assumptions", "obligations"].map(
              (field) =>
                selected.formal?.[field]?.length > 0 && (
                  <div key={field}>
                    <h4>
                      {field === "assumptions"
                        ? "Assumptions"
                        : "What still needs to be checked"}
                    </h4>
                    {selected.formal[field].map((x, i) => (
                      <Preview key={i} source={x} lean />
                    ))}
                  </div>
                ),
            )}
            {!!related.length && (
              <details className="resultDependencies">
                <summary>Argument connections ({related.length})</summary>
                {related.map((l) => (
                  <div key={l.id}>
                    <p>
                      <strong>{label(l.from)}</strong> {l.type}{" "}
                      <strong>{label(l.to)}</strong>
                    </p>
                    <Preview
                      prose
                      source={l.reason || "No explanation recorded."}
                    />
                    {results.some(
                      (r) =>
                        r.ref === (l.from === selected.ref ? l.to : l.from),
                    ) && (
                      <button
                        onClick={() =>
                          setSelectedRef(
                            l.from === selected.ref ? l.to : l.from,
                          )
                        }
                      >
                        View connected result
                      </button>
                    )}
                  </div>
                ))}
                <p className="hint">
                  Proposed dependencies require mathematical review.
                </p>
              </details>
            )}
          </section>
        )}
        <details
          className="projectCertificateChecks"
          key={selected?.ref || "empty"}
          open={!selected || !!selected.formal}
        >
          <summary>Project checks & setup</summary>
          <p className="hint">
            Checks below apply to the saved project entry file. They are not
            individual result certificates.
          </p>

          <div className="certificateSaved">
            <h3>
              {data.sourceHash
                ? "Formal source saved"
                : "No formal source saved yet"}
            </h3>
            <p>
              {data.sourceHash
                ? "The Lean project is saved on disk. Its readable notes and check results update here automatically."
                : "A chat explanation is not a saved Lean proof. Ask the assistant to save the formalization, or use Save Lean draft on an earlier reply."}
            </p>
            {data.files.length > 0 && (
              <p className="hint">
                {data.files.filter((f) => f.path.endsWith(".lean")).length} Lean
                source files · {data.toolchain || "Toolchain not pinned"} ·{" "}
                {data.hasManifest
                  ? "Dependency lockfile present"
                  : "Dependencies not locked"}
              </p>
            )}
            {plan?.declarations?.length > 0 && (
              <>
                <h3>Target declarations</h3>
                {plan.declarations.map((name) => (
                  <p key={name} className="declarationName">
                    {name}
                  </p>
                ))}
              </>
            )}
          </div>
          {data.setup && !(current?.status === "build-passed" && !data.stale && data.lakeAvailable) && (
            <div className="notice leanSetup">
              {data.setup.state === "ready" ? (
                <CheckCircle2 size={17} />
              ) : (
                <AlertCircle size={17} />
              )}
              <div>
                <strong>
                  {data.setup.state === "ready"
                    ? "Lean setup test passed"
                    : data.setup.busy
                      ? "Setting up Lean"
                      : data.lakeAvailable === false
                        ? "Lean checker is not installed"
                        : "Prepare Lean for this project"}
                </strong>
                <p>
                  {data.setup.state === "ready"
                    ? `The compiler and project imports passed a small theorem test (${data.setup.toolchain}). Your research proof is checked separately below.`
                    : data.setup.message ||
                      "Install the compiler and project libraries, then test setup. Requires internet and several GB for mathlib."}
                </p>
                {data.setup.state !== "ready" &&
                  data.setup.automaticSetup !== false && (
                    <button disabled={busy} onClick={setup}>
                      {data.setup.busy
                        ? "Setup in progress…"
                        : ["failed", "interrupted", "needs-setup"].includes(
                              data.setup.state,
                            )
                          ? "Retry Lean setup"
                          : "Set up Lean"}
                    </button>
                  )}
                {setupMessage && <p role="status">{setupMessage}</p>}
                {data.setup.automaticSetup === false && (
                  <a
                    href="https://lean-lang.org/install/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Lean installation guide
                  </a>
                )}
                {data.setup.command && (
                  <details>
                    <summary>Setup details and terminal command</summary>
                    <p>
                      Existing formal source and dependency versions are
                      preserved. Setup may run the project’s Lake configuration
                      to fetch and check its libraries. Close the setup terminal
                      to stop; retry resumes installed downloads.
                    </p>
                    <button onClick={copySetup}>Copy setup command</button>
                    <code>{data.setup.command}</code>
                    {data.setup.log && (
                      <pre className="setupLog">{data.setup.log}</pre>
                    )}
                  </details>
                )}
              </div>
            </div>
          )}

          <div className="row">
            <button disabled={busy} onClick={() => run(false)}>
              Inspect project
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => run(true)}
            >
              <Play size={13} />
              {busy ? "Checking…" : "Run Lean check"}
            </button>
          </div>
          <p className="hint">
            Saved proofs are checked automatically after assistant edits when
            Lean is available. Read-only chats do not run checks.
          </p>
          {error && (
            <p className="inlineError" role="alert">
              {error}
            </p>
          )}
          {data.stale && current?.sourceHash && (
            <p role="status" className="inlineError">
              The formalization changed since this check. These results describe
              an earlier version.
            </p>
          )}
          {current &&
          (data.sourceHash || current.status !== "not-configured") ? (
            <>
              <h3 className="checkHeading">
                {leanCheckLabel(current.status)}
              </h3>
              <p>{current.message}</p>
              {current.checks.map((c, i) => (
                <div className="checkRow" key={i}>
                  {["present", "clear"].includes(c.status) ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <AlertCircle size={18} />
                  )}
                  <div>
                    <strong>{leanItemLabel(c.label)}</strong>
                    <p>{c.label === "Statement correspondence" ? "The assistant compares the formal statement with your claim. Lean checks the encoded statement; it cannot guarantee the natural-language translation." : c.detail}</p>
                  </div>
                  <span className="badge">{leanItemStatus(c.status)}</span>
                </div>
              ))}
              <p className="hint">
                Checked {new Date(current.checkedAt).toLocaleString()}.{" "}
                {current.sourceHash
                  ? "Source snapshot: " + current.sourceHash.slice(0, 12)
                  : ""}
              </p>
            </>
          ) : null}
          <details className="checkHistory">
            <summary>Check history ({data.records.length})</summary>
            {data.records.map((r) => (
              <div className="historyRow" key={r.id}>
                <span>{new Date(r.checkedAt).toLocaleString()}</span>
                <span>{leanCheckLabel(r.status)}</span>
              </div>
            ))}
          </details>
          {data.summary && (
            <details className="formalNotes">
              <summary>Formalization notes</summary>
              <Preview source={data.summary} lean />
            </details>
          )}
        </details>
      </div>
    </Panel>
  );
  return (
    <Resizable
      key={resetKey}
      resetKey={resetKey}
      id="lean"
      defaults={[27, 43, 30]}
    >
      {[
        left,
        middle,
        <ChatPanel
          key={project.id + "research"}
          project={project}
          role="research"
          workspace="lean"
          contextLabel={selected?.title || "Lean Certificates"}
          context={
            selected && selected.ref !== "formal:main"
              ? {
                  kind: selected.ref.split(":")[0],
                  id: selected.ref.split(":")[1],
                }
              : null
          }
          beforeSend={beforeSend}
          onArtifact={onArtifact}
        />,
      ]}
    </Resizable>
  );
}
