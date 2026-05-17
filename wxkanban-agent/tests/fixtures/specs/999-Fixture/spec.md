# Spec 999: Fixture — Minimal Spec for Batch-Mode Integration Tests

**Spec Number**: 999
**Status**: `fixture` — not a real scope; used by integration tests
**Created**: 2026-05-16

---

## Overview

This is a fixture spec used by [batch-mode integration tests](../../../integration/) for the wxkanban-agent kit. It exists only so `loadSpecBundle('999')` returns a parseable bundle. None of its tasks ever run against real code; they exist as fixtures with known IDs.

The fixture is deliberately minimal: three tasks (T901, T902, T903) with simple titles. Task IDs use the `T<digits>` form required by the spec-loader's row regex. Real-world specs are much richer.

## Functional Requirements

### FR-001 — Fixture parses cleanly
`loadSpecBundle('999', specsRoot)` returns a `SpecBundle` with three tasks (T901, T902, T903), all initially `todo`.
