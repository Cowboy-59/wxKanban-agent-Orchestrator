# Tasks: 999-Fixture (batch-mode integration fixture)

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T901: Create fixture file A | high | todo |
| 2 | T902: Create fixture file B that depends on A | high | todo |
| 3 | T903: Create fixture file C that depends on A and B | high | todo |

## Dependencies (prose — not parsed today)

- T901: no dependencies
- T902: depends on T901
- T903: depends on T901, T902

Batch mode walks file order (per spec 031 deviation from FR-006); since the file order matches dependency order here, mid-batch state visibility tests using this fixture work correctly without formal dependency parsing.
