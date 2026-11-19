# Spec 086: Kit Cockpit Delivery — Marketplace-Primary Install + Release Integrity

**Spec Number**: 086
**Scope**: SCOPE-086 (`specs/Project-Scope/086-app-kit-cockpit-delivery.md`, incl. Amendment A)
**Status**: implementing
**Priority**: high

## Amendment B (2026-07-10) — Marketplace-ONLY; bundled `.vsix` removed

**Supersedes the "VSIX-as-fallback" design throughout this spec.** The Dev Cockpit
is now delivered *exclusively* through the VS Code Marketplace
(`wxperts.wxkanban-dev-cockpit`). The kit **no longer bundles, ships, rebuilds, or
falls back to a `.vsix`**. Rationale: the sideload fallback was the source of the
"frozen on an old version" failures this scope set out to end, and maintaining a
bundle + release-integrity check for an artifact customers should never receive is
complexity with no upside (KISS). Concretely, the following are **removed**:

- The bundled-`.vsix` fallback in `ensureCockpitUpToDate` and the consumer
  `install-cockpit-extension.mjs`; both now install by Marketplace ID only. When
  the extension is already present they no-op (VS Code auto-updates a gallery copy).
- `findBundledVsix` / `compareVersions` / `readInstalledCockpitVersion` and the
  `WXKANBAN_COCKPIT_SOURCE=auto|gallery|vsix` escape hatch (there is no non-gallery
  source to choose anymore).
- Mirroring `vscode-extension/` into the orchestrator kit (`KIT_DIRS`), the
  orchestrator `build-release.mjs` `.vsix` pre-build/pack step, and the published
  `kit.tar.gz` `.vsix`-presence check in `verifyPublishedRelease` (the SHA-256
  byte-match integrity check is retained).

The cockpit `.vsix` is still built locally and `vsce publish`ed to the Marketplace
— that is the *only* place it lives. When `code` is missing/offline, the paths emit
a **visible manual-install instruction pointing at the Marketplace** (FR-002 intent
preserved; the offline-`.vsix` line is dropped). The two Open Questions below are
resolved: no `.vsix` fallback path, and no `WXKANBAN_COCKPIT_SOURCE` flag — a
policy-blocked-gallery customer installs the extension by hand from the banner.

## Overview

Deliver the Dev Cockpit VS Code extension to customers primarily through the public VS Code Marketplace — published 2026-07-05 as `wxperts.wxkanban-dev-cockpit` — so installs and updates are native and automatic, and harden the bundled-`.vsix` fallback so a correct kit is never silently without a cockpit. The kit's fresh-install and self-update paths must install by Marketplace **extension ID** (not by sideloading a `.vsix` file), because a sideloaded extension never receives gallery auto-updates. The bundled `.vsix` remains the offline / air-gapped fallback. Alongside this, close the pre-existing hardening gaps: verify the published release asset matches the local build, surface a visible manual-install path when auto-install can't run, and provide a cache-bust after a same-tag re-upload.

## Business Problem

Customers repeatedly failed to get the cockpit installed, updated, or both. Two mechanisms caused it: a stale GitHub release asset once shipped no `.vsix` at all, and the bundled-`.vsix` install path is a **sideload** — VS Code does not auto-update sideloaded extensions from the gallery, so even a correctly-installed customer stayed frozen on whatever version their last kit shipped. Publishing to the Marketplace fixes install and update at the root, but only if the kit installs by Marketplace ID; otherwise customers are "on the Marketplace" in name only and remain on the manual-update treadmill this scope exists to end. Because the cockpit is a headline surface, every one of these failures is silent and costs a new customer their first impression.

## Actors

- Primary: A new wxKanban customer opening their kit in VS Code, who needs the cockpit installed and kept current with zero manual steps.
- Secondary: The kit release author running `sync-to-orchestrator.mjs --release`; `KitProxyService` (serves + SHA-verifies kit downloads); the `code` CLI and the VS Code Marketplace gallery; the kit installers `install-cockpit-extension.mjs` and `ensureCockpitUpToDate`.

## Success Metrics

- On a machine with `code` on PATH and network access, a fresh kit init produces a **gallery-managed** cockpit in 100% of runs (verified via `code --list-extensions --show-versions` and an available-update signal in VS Code), receiving Marketplace auto-updates within 24 hours of a new publish with 0 manual steps.
- 0 stale release assets reach customers: 100% of `--release` runs re-verify the published `kit.tar.gz` SHA-256 against the freshly-built local sidecar and fail non-zero on any mismatch or missing `vscode-extension/*.vsix`.
- When gallery install cannot run (offline or `code` missing), the kit falls back to the bundled `.vsix` or emits a visible manual-install instruction in ≥ 99% of runs — 0 silent omissions.
- After a same-tag asset re-upload, fresh archives serve within the 1-hour cache TTL via a documented bust step, targeting < 5 minutes when the `_resetCache` hook is used.

## Scope Boundary

IN: switching the kit fresh-install path (`install-cockpit-extension.mjs`, the `.vscode/tasks.json` folderOpen task) and the self-update path (`ensureCockpitUpToDate`) to install by Marketplace ID with `.vsix` fallback and no downgrade; a `WXKANBAN_COCKPIT_SOURCE` escape hatch for policy-locked environments; post-release SHA verification of the published asset; a visible install-fallback message when auto-install returns `no-code`/`no-vsix`; and a documented or automated cache-bust after a same-tag re-upload.

## Out of Scope

- Cockpit feature changes (owned by SCOPE-042).
- The disabled legacy `KitGenerationService` DB-assembled kit path (prod uses `KIT_DOWNLOAD_SOURCE=orchestrator` → `KitProxyService`).
- Marketplace listing content/marketing beyond the functional README already committed.
- Changing `KIT_DOWNLOAD_SOURCE` back to the legacy assembler.

## Open Questions

- Should the self-update path block briefly (`spawnSync`) on the rare not-installed/stale case to detect a gallery-install failure and fall back to the `.vsix`, or stay fully detached and skip fallback detection? Leaning: block only on the rare install path, keep the steady-state no-op path spawn-free.
- Do any locked-down customer environments have the Marketplace gallery blocked by policy, requiring the `.vsix` as the default? If so the `WXKANBAN_COCKPIT_SOURCE=vsix` flag covers it — confirm whether any current customer needs it at launch.

## Functional Requirements

### FR-004 — Kit installs + updates the cockpit via the Marketplace, VSIX as fallback
> **Amended by Amendment B:** the `.vsix` fallback and `WXKANBAN_COCKPIT_SOURCE` are removed — install is by Marketplace ID only; an already-present copy is a no-op (VS Code auto-updates it). The paragraph below is retained for history.
The fresh-install path (`install-cockpit-extension.mjs`, the folderOpen task) and the self-update path (`ensureCockpitUpToDate` in `wxkanban-agent/core/orchestrator/cockpit-refresh.ts`) MUST prefer installing by Marketplace extension ID (`code --install-extension wxperts.wxkanban-dev-cockpit`) so the customer's copy is gallery-managed and auto-updates. The bundled `.vsix` is used only when the gallery install cannot run (offline / `code` missing / gallery unreachable / `WXKANBAN_COCKPIT_SOURCE=vsix`). Never downgrade a gallery copy to an older bundled `.vsix`.
Acceptance:
- [ ] Fresh init on a networked machine with `code` yields a gallery-installed cockpit (not a sideload); VS Code reports an available update when a newer version is published.
- [ ] With the gallery unreachable, install falls back to the bundled `.vsix` and still succeeds.
- [ ] A customer already on a gallery copy is never force-downgraded to an older bundled `.vsix`.
- [ ] The fenced spec-042 block (`ensureCockpitUpToDate`, `[SCOPE 042 / T038]`) is modified through the orchestrator (`implement`), recording the MODIFIED-BY line — not hand-edited.

### FR-001 — Verify the published asset matches the build
> **Amended by Amendment B:** the published-archive `.vsix`-presence assertion is removed (the kit no longer ships a `.vsix`); the SHA-256 byte-match check is retained.
The release flow (`sync-to-orchestrator.mjs --release` and/or a standalone `verify-release.mjs`) MUST, after upload, re-download the published `kit.tar.gz` and assert its SHA-256 equals the freshly-built local sidecar, and assert the archive contains `vscode-extension/*.vsix`; any mismatch MUST fail the release non-zero.
Acceptance:
- [ ] A stale/failed upload (published SHA ≠ local build SHA) fails the release with a clear message.
- [ ] A correct upload passes and confirms the `.vsix` is present in the published archive.

### FR-002 — Visible install fallback
When `install-cockpit-extension.mjs` returns `no-code` or `no-vsix`, the kit MUST surface a prominent instruction (README-KIT / init summary), not only a swallowed log line, naming the bundled `.vsix` path, the exact `code --install-extension` command, and how to add `code` to PATH.
Acceptance:
- [ ] A `no-code` outcome yields a visible, actionable message a non-technical customer can follow.
- [ ] The message includes the exact command and the PATH-setup hint.

### FR-003 — Cache-bust after re-upload
There MUST be a documented (or automated) way to invalidate `KitProxyService`'s 1-hour archive cache after a same-tag asset re-upload.
Acceptance:
- [ ] After a re-upload, a documented step (restart or a `_resetCache` hook) ensures fresh archives serve promptly.
