export function readLedger() {
  return [
    {
      id: "D-0001",
      scope: "SCOPE-010",
      question: "Should invoices round to the cent?",
      decision: "Yes, round half up to the cent.",
      rationale: "matches existing billing behavior",
      kind: "Agreed",
      evidence: "confirmed",
      approved_by: "owner",
    },
    {
      id: "D-0002",
      scope: "SCOPE-010",
      question: "Ineligible because evidence is unknown",
      decision: "Would answer this, but it's not eligible.",
      kind: "Agreed",
      evidence: "unknown",
      approved_by: "owner",
    },
  ];
}

export function isAnswerEligible(entry) {
  return entry.evidence !== "unknown";
}
