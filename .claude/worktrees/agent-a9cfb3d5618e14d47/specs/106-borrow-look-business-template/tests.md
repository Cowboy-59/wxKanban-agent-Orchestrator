# Tests: SPEC-106 — Borrow-a-Look Business Template

Vitest for unit/integration, Playwright for E2E. Every test maps to a Functional Requirement.

## Unit (Vitest)

- **Chrome renderers** (T001/T016): `renderHeaderComponent`/`renderFooterComponent` emit valid component source; logo + appName + footerLine appear; output references theme tokens, not hard-coded colors. *(FR-005/006)*
- **Capture → token mapping** (T006/T016): given a fixture raw capture, the mapper returns a complete 19-token light+dark set + fonts + radius that validates against `projectThemeSchema`. *(FR-002)*
- **AA-clamp** (T016): a low-contrast mapped result is clamped so `themePassesAA` returns true on the critical pairs. *(FR-003)*
- **Fail-open** (T016): capture throw, AI-unset, and invalid-AI-JSON each return `WXKANBAN_DEFAULT_THEME` (complete, AA-passing), never throw. *(FR-003)*

## Integration (Vitest + supertest)

- **POST /api/themes/derive/url** (T007): valid URL → 200 with `source:"url"` + sourceRef + complete theme; forced capture failure → 200 with default theme + message, no 5xx. *(FR-001/002/003)*
- **execute with chrome** (T008): execute materializes header + footer artifacts beside `theme.css`; artifact content matches the saved chrome + tokens. *(FR-006)*
- **themeTemplates CRUD** (T009/T018): member can POST save; non-admin PATCH/DELETE rejected (403); admin PATCH/DELETE succeed; a second company cannot read the first's templates (tenant isolation). *(FR-007)*
- **apply-template** (T010): applying a template writes `projectthemes` + chrome; a themeless, template-less project resolves to the wxKanban default. *(FR-008)*

## E2E (Playwright)

- **Full flow** (T017): open Theme → From-a-website → paste URL → gallery renders in the extracted look → add logo + name + footer (preview updates) → Save as template → new project → pick template → inherits tokens + chrome. *(FR-001/004/005/007/008)*
- **Failure path** (T017): unreachable URL → friendly "couldn't fully read that site" message, editable default theme, entered chrome preserved. *(FR-003)*

## Coverage gate

Each FR (FR-001..FR-008) has at least one passing test; the three fail-open paths and the member/admin permission split are each explicitly asserted.
