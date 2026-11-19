# Quickstart: Landing-Page Docs

**Spec Number**: 044

## Setup

1. Review the spec: `specs/044-landing-docs/spec.md`
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

## Development

1. Pick a task from `tasks.md` (start with T001 — schema/migration)
2. Implement the feature
3. Write tests per `tests.md`
4. Run tests: `npm run test`
5. Mark task done via the orchestrator

## Verification

1. Run `/scope-validate 044` to check spec quality
2. Run tests to verify implementation
3. Review test coverage against `tests.md` requirements
4. Confirm the `wxkanban` S3 bucket objects are public-read + CORS-correct before validating US1 end-to-end
