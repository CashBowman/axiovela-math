// Shared provider-independent guidance; never caps substantive answers or reasoning.
export const efficientDeliveryInstructions = `Efficient task delivery:
- Keep work proportional to the latest request. For questions, explain the answer directly; do not refresh unchanged project artifacts merely because a panel exists.
- When editing existing files, read the current target and prefer a focused edit/patch tool over emitting the entire unchanged document. API connections offer edit_file for a unique exact-text replacement. Use complete writes for new files or when a complete rewrite is actually needed. Preserve unrelated content and concurrent changes; reread after a stale or ambiguous edit.
- Save each changed fact in its existing authoritative record. Panels derive from saved artifacts; do not create parallel copies or extra reports to populate them. Maintain all required research summaries, result connections, citations, provenance and verifier records when the underlying evidence changes. Do not defer required updates or claim an unchanged panel contains new results.
- For an edited-file deliverable, finish with a brief description of the changes, relevant validation and unresolved issues, without reproducing the saved document. For questions, reviews and proofs, give the substantive requested answer with necessary assumptions, equations, evidence and citations. Honor requests for detail or full text. Concision must not remove scientific qualifications or skip verification.
- Reuse existing measured results for presentation changes. Run only checks relevant to changed behavior and unresolved concerns; never repeat an unchanged successful check without a reason. Keep the chosen model, reasoning settings, access permissions and requested research scope.`;

// Preserve complete selected content up to the existing context budget. The
// inactive manuscript remains on disk, rather than consuming that same budget.
export function draftContext(project, role, format) {
  return JSON.stringify(role === 'writing'
    ? {[format === 'latex' ? 'latex' : 'markdown']: project[format === 'latex' ? 'latex' : 'markdown'] || '', bibliography: project.bibliography,
       otherFormat: `Available on request at writeups/main.${format === 'latex' ? 'md' : 'tex'}; preserve unless explicitly requested.`}
    : {summary: project.summary || '', proof: project.proof || ''}).slice(0, 32000);
}

export function workspaceEvidence(project, context) {
  return JSON.stringify({notes: project.notes, claims: project.claims,
    resultOutline: (project.graphNodes || []).map(({id, kind, title, mainResult}) => ({id, kind, title, mainResult})),
    evidenceAssociations: project.evidenceNotes || {},
    papers: project.papers.map(({id, title, notes, citationKey, sourceType, sourceUrl, text, aliases}) => ({id, title, notes, citationKey, sourceUrl,
      ...(sourceType === 'web'
        ? context?.kind === 'paper' && (context.id === id || aliases?.includes(context.id))
          ? {excerptLocation: 'Full saved excerpt is in the selected Library context above.'}
          : {excerpt: text?.slice(0, 8000)}
        : {path: `papers/${id}.pdf`})}))}).slice(0, 16000);
}
