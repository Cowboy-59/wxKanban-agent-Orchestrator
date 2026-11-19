// Spec 029 / T001 — default scope content used to detect template placeholders.
// Extracted byte-for-byte from mcp-server/src/utils/project-kit.ts.

// [SCOPE 029 / T001] BEGIN — DEFAULT_SCOPE_CONTENT (template strings that should be replaced)
export const DEFAULT_SCOPE_CONTENT = {
  businessProblem: [
    'Define the business value and outcome for this scope.',
    'TODO: Define the business problem this feature solves',
  ],
  primaryActor: [
    'Primary user',
    'TODO: Define primary actor',
  ],
  secondaryActors: [
    'Stakeholders, supporting users',
    'TODO: Define secondary actors',
  ],
  scopeBoundary: [
    'In scope and out-of-scope details to be refined during scope review.',
    'TODO: Define what is in scope for this feature',
  ],
  outOfScope: [
    'TODO: Define what is explicitly out of scope',
  ],
  integrationContext: [
    'Existing systems, workflows, and documents that this scope must align with.',
  ],
  constraintsAndRisks: [
    'Known delivery constraints, assumptions, and risks that should be reviewed before implementation.',
  ],
};
// [SCOPE 029 / T001] END
