# Quickstart: buildscope Carries the Author's Real Requirements

## Create a scope with real requirements

```jsonc
project.buildscope({
  projectId: "<uuid>",
  featureDescription: "Equipment catalogue curation",
  title: "Equipment Catalogue",                       // optional: H1 and slug
  primaryActor: "Catalogue curator",
  secondaryActors: ["Tenant administrator"],
  businessProblem: "...",
  scopeBoundary: "...",
  outOfScope: "...",
  successMetrics: ["95% of ...", "Under 2 minutes ...", "0 duplicate ..."],
  functionalRequirements: [
    { title: "Stage imported records", requirement: "The system MUST ...", acceptanceCriteria: ["...", "..."] }
  ],
  userScenarios: [
    { title: "Curator publishes a batch", actor: "Catalogue curator", steps: ["...", "..."], expectedOutcome: "..." }
  ],
  dataRequirements: "| Table | Change |\n|---|---|\n| equipmentcategories | new |",
  apiRoutes: "None — no HTTP changes",
  frontendComponents: "None",
  keyEntities: "Category, Make, Model",
  localSpecNumbers: ["001", "002", "018", "019", "020"]  // numbers in specs/ and specs/Project-Scope/
})
```

The draft comes back in `scopeContent`; write it to `suggestedFilePath`. Nothing is stored until
`create_specs` or `dbpush` runs.

## Edit your local scope file

```jsonc
project.buildscope({
  projectId: "<uuid>",
  editSpecNumber: "010",
  featureDescription: "Correct the actors",          // describes the change; does not retitle
  primaryActor: "Permission administrator",
  currentScopeContent: "<text of specs/Project-Scope/010-*.md>"
})
```

Write the returned `scopeContent` back to the same local file. The kit CLI
(`wxkanban-agent buildscope --edit-spec-number 010 ...`) does all of this for you.
