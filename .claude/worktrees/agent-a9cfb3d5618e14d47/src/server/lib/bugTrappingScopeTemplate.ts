// [SCOPE 063 / T005] BEGIN — customer-facing bug-trapping scope template
// Renders the scope markdown seeded into a CUSTOMER's project by the install
// action. It is a customer-facing adaptation of SCOPE-061: it instructs the
// customer's AI to build runtime error-capture into THEIR OWN application,
// posting trapped errors back to THEIR wxKanban project's ingest endpoint.
//
// The ingest TOKEN is never embedded here (secrets must not live in a persisted
// scope row) — only the endpoint. The marker line makes the install idempotent.

export const BUG_TRAPPING_SEED_MARKER = "<!-- wxkanban:bug-trapping-seed -->";
export const BUG_TRAPPING_SEED_TITLE = "Automatic Bug-Trapping & Reporting";

export interface BugTrappingScopeParams {
  projectName: string;
  ingestEndpoint: string; // e.g. https://app.wxperts.com/api/projects/<id>/errors
}

export function renderBugTrappingScope(params: BugTrappingScopeParams): string {
  const { projectName, ingestEndpoint } = params;
  return `# Automatic Bug-Trapping & Reporting

${BUG_TRAPPING_SEED_MARKER}

**Status**: \`draft\`
**Installed into**: ${projectName}

## Overview

Add an always-on, **fail-open** error-capture layer to this application — client
and server — that traps runtime failures, attaches enough context to act on them,
and reports each one to this project's wxKanban Bug Reports tab. Capture must never
break the running app: a failure inside the capture path is swallowed.

## Business Problem

Right now when something breaks in this app, the failure is invisible — a server
exception is one log line no one is watching; a browser crash reaches only
\`console.error\`. There is no aggregation and no triage. This scope closes that
gap by trapping failures where they happen and routing them to a place a human
will see them, grouped and de-duplicated.

## What to build (instructions for your AI)

1. **Client capture** — register global \`error\` + \`unhandledrejection\` listeners,
   wrap your top-level error boundary, and capture failed API calls. Each capture
   is fire-and-forget and must never throw into the app.
2. **Server capture** — capture unhandled exceptions / rejections and 5xx
   responses in your error-handling middleware. Fail-open.
3. **Report** — POST each trapped error as JSON to this project's ingest endpoint:

   \`\`\`
   POST ${ingestEndpoint}
   Authorization: Bearer <WXKANBAN_ERROR_INGEST_TOKEN>
   Content-Type: application/json

   {
     "source": "client" | "server",
     "kind": "windowError" | "unhandledRejection" | "errorBoundary" | "apiFetch" | "serverHandler" | "uncaughtException" | "unhandledRejectionServer",
     "name": "<error class>",
     "message": "<error message>",
     "stack": "<stack trace>",
     "route": "<url or route where it happened>",
     "appVersion": "<your app version>"
   }
   \`\`\`

   Source \`WXKANBAN_ERROR_INGEST_TOKEN\` from your app's \`.env\` — it is the
   project ingest token issued when you installed bug-trapping (shown once;
   re-issue from the Bug Reports tab if lost). **Never commit the token.**
   The endpoint is fail-open and rate-limited; it returns 202 on success.

## Functional Requirements

- **FR-001 — Client capture**: global error + unhandledrejection + error-boundary
  + failed-fetch capture, all fail-open (a capture failure never affects the app).
- **FR-002 — Server capture**: uncaught exception / unhandled rejection / 5xx
  capture, fail-open.
- **FR-003 — Report**: each trapped error is POSTed to the ingest endpoint above
  with the bearer token sourced from the environment.
- **FR-004 — No secret in source**: the ingest token is read from the environment,
  never hard-coded or committed.

## Success Criteria

1. A thrown error in the running app appears in this project's Bug Reports tab
   within a few seconds.
2. The app keeps working even when the ingest endpoint is unreachable (fail-open).
3. Repeated identical errors are grouped (the tab shows an occurrence count).

## Constraints & Notes

- Build the capture into THIS application's own codebase; wxKanban only receives
  and triages the reports.
- Reports are visible to this project's members in the wxKanban **Bug Reports** tab,
  where each can be triaged and turned into a task with an AI-suggested fix.
`;
}
// [SCOPE 063 / T005] END
