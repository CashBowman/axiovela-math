import React, { useEffect, useRef } from "react";
import { changedPassage } from "../shared/annotations.mjs";
export default function RevisionReview({
  proposal,
  current,
  onApply,
  onClose,
}) {
  const dialog = useRef();
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const stale =
    current[proposal.format] !== proposal.source ||
    current.bibliography !== proposal.bibliography;
  const difference = changedPassage(proposal.source, proposal.proposed);
  return (
    <dialog
      ref={dialog}
      className="proposalDialog"
      onCancel={onClose}
      aria-labelledby="revision-review-title"
    >
      <div className="dialogHead">
        <h2 id="revision-review-title">Review proposed revision</h2>
        <button aria-label="Close revision review" onClick={onClose}>
          ×
        </button>
      </div>
      <p>
        The assistant’s proposal is shown below. Your manuscript stays in place
        until you apply it.
      </p>
      {stale && (
        <p role="alert" className="inlineError">
          The manuscript or bibliography changed after this review was
          requested. Send feedback again for the current draft.
        </p>
      )}
      <p className="hint">
        Changed passage with surrounding context, starting at line{" "}
        {difference.line}.
      </p>
      <div className="proposalComparison">
        <section>
          <h3>Current draft</h3>
          <pre>{difference.before || "(Empty)"}</pre>
        </section>
        <section>
          <h3>Proposed draft</h3>
          <pre>{difference.after || "(Empty)"}</pre>
        </section>
      </div>
      <div className="row">
        <button onClick={onClose}>Keep current draft</button>
        <button
          className="primary"
          disabled={stale || proposal.source === proposal.proposed}
          onClick={onApply}
        >
          Apply revision
        </button>
      </div>
    </dialog>
  );
}
