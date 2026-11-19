# SCOPE-086: Kit Cockpit Delivery — Release-Asset Integrity + Install UX

**Scope Number**: SCOPE-086
**Status**: `draft` (rewritten 2026-07-04 after the original premise was disproven by investigation)
**Created**: 2026-07-04
**Depends On**: SCOPE-019 R14 (`KitProxyService` — the live download path), SCOPE-042 (Dev Cockpit `.vsix` + `install-cockpit-extension.mjs` + `ensureCockpitUpToDate`).
**Related Scopes**: SCOPE-080 (kit field-defect hardening) — the release-asset-integrity item below is a natural fit there.
**Source**: `specs/Project-Scope/086-app-kit-cockpit-delivery.md`

---

## ⚠️ Corrected root cause (read first)

The original draft blamed `KitGenerationService` for omitting the cockpit `.vsix`. **That was wrong.** Investigation (2026-07-04) established:

- Prod serves kit downloads via **`KitProxyService.serve()`** (branch taken because `apprunner.yaml` sets `KIT_DOWNLOAD_SOURCE=orchestrator`). It fetches the orchestrator GitHub-release archive, injects per-project files, and **repacks the entire tree** — it does **not** strip `vscode-extension/`. `KitGenerationService` (the DB-`projectkitfiles` assembler) is the **disabled legacy path**; editing it fixes nothing in prod.
- The orchestrator release kit already ships the full install chain: `vscode-extension/<vsix>` + `scripts/install-cockpit-extension.mjs` + a `.vscode/tasks.json` "Install wxKanban Dev Cockpit" folderOpen task.
- **The actual cause of "customer kit had no cockpit":** the published v1.7.21 GitHub asset was **stale** — a 498-file build missing the `.vsix` — while the correct local build (583 files, with vsix) never replaced it during the `--release` sync. `KitProxyService` faithfully served what the release actually contained: no vsix.
- **Immediate fix already applied (out-of-band):** re-uploaded the correct assets to v1.7.21 (`gh release upload --clobber`); the published asset is now 583 files including the vsix, verified. New downloads carry the full cockpit chain.

So the customer-facing problem is **resolved**. What remains is hardening so it can't recur, plus the pre-existing install-UX gap.

## Amendment A (2026-07-05) — Marketplace becomes the primary install/update channel

The original draft put "Marketplace publishing" **out of scope** and treated the bundled-`.vsix` sideload as the only delivery mechanism. That premise is now superseded: the cockpit was **published to the public VS Code Marketplace out-of-band on 2026-07-05** as `wxperts.wxkanban-dev-cockpit` (publisher account andy@wxperts.com). Manifest/LICENSE/README prep committed as `8093dbef`. See memory `project_cockpit_marketplace_published`.

**Why this matters for delivery:** a `.vsix` installed via `code --install-extension <file>` (what `install-cockpit-extension.mjs` and `ensureCockpitUpToDate` do today) is a **sideload** — VS Code does **not** auto-update it from the gallery. So publishing to the Marketplace only delivers native auto-update if the kit installs the extension **by Marketplace ID** (`code --install-extension wxperts.wxkanban-dev-cockpit`). Otherwise customers appear "on the Marketplace" but remain on the manual-update treadmill this scope exists to end.

This makes FR-004 (below) the highest-leverage item in the scope; FR-001–FR-003 remain valid but become **fallback-path** hardening (offline / air-gapped / `code`-missing machines that still use the bundled vsix).

**Boundary correction:** Marketplace publishing / Marketplace-primary delivery is now **IN** scope (was OUT on the two lines below — those refer to the original premise and are superseded by this amendment).

### FR-004 — Kit installs + updates the cockpit via the Marketplace, VSIX as fallback
The kit's fresh-install path (`install-cockpit-extension.mjs`, the `.vscode/tasks.json` folderOpen task) and the self-update path (`ensureCockpitUpToDate` in `wxkanban-agent/core/orchestrator/cockpit-refresh.ts`) MUST prefer installing by **Marketplace extension ID** (`wxperts.wxkanban-dev-cockpit`) so the customer's copy is gallery-managed and auto-updates. The bundled `.vsix` is used **only** when the gallery install cannot run (offline / air-gapped / gallery unreachable). Never downgrade a gallery copy to an older bundled vsix.
**Acceptance:**
- [ ] On a machine with `code` + network, a fresh kit init results in a **gallery-installed** cockpit (`code --list-extensions --show-versions` shows it; VS Code reports an available update when a newer version is published — i.e. NOT a sideload)
- [ ] With the gallery unreachable, install falls back to the bundled `.vsix` and still succeeds
- [ ] A customer already on a gallery copy is never force-downgraded to an older bundled vsix
- [ ] Fenced spec-042 code (`ensureCockpitUpToDate`, `[SCOPE 042 / T038]`) is modified through the orchestrator (`implement`), not hand-edited, so the MODIFIED-BY line is recorded

### US4 — Fresh kit init yields an auto-updating cockpit
A new customer with `code` on PATH and internet opens their kit. The cockpit installs **from the Marketplace** and thereafter auto-updates with zero action on the next publish.
**Expected:** no manual reinstall, no dependence on the kit shipping a fresh vsix for the customer to get cockpit updates.

## Overview

Two genuine, smaller gaps remain after the immediate re-upload:

1. **Release-asset integrity.** The release process can publish a GitHub asset that doesn't match the freshly-built local archive (the `gh release create` during `sync-to-orchestrator … --release` didn't land the new file), with no verification — so a stale kit ships silently. `KitProxyService` verifies SHA against the release's *own* sidecar, so a self-consistent-but-stale pair passes.
2. **Cockpit install UX.** `install-cockpit-extension.mjs` is best-effort and no-ops (with one easily-missed log line) when the `code` CLI isn't on PATH (common on macOS) — so even a correct kit can leave a customer with no cockpit and no obvious next step.

There is also a **transient cache** consideration: `KitProxyService` caches a verified archive for 1 hour per (tag, format); after a re-upload, a cached stale copy can serve until TTL/restart.

## Business Problem

The cockpit is a headline surface, and both failure modes make it silently absent for a new customer: a stale release asset ships no vsix, or a correct kit can't auto-install where `code` isn't on PATH — in both cases with no clear signal. The immediate incident is fixed; the point of this scope is that neither should be able to happen quietly again.

### Core Design

| Element | Kit Cockpit Delivery — Release-Asset Integrity + Install UX |
| --- | --- |
| **Primary Actor** | The kit release author (release-integrity half) and a new customer opening their kit (install-UX half) |
| **Secondary Actors** | `sync-to-orchestrator.mjs` / `build-release.mjs` (produce + upload assets); `KitProxyService` (serves + SHA-verifies); `install-cockpit-extension.mjs` (installs the cockpit); the `code` CLI |
| **Key Value** | A published kit is provably the build that was made (no silent stale asset), and when auto-install can't run the customer gets a clear, visible manual path — the cockpit is never silently missing |
| **Boundary — IN** | Post-release verification that the uploaded GitHub asset's SHA matches the freshly-built local sidecar (fail loud); a prominent, visible "install cockpit manually / add `code` to PATH" signal when `install-cockpit-extension.mjs` returns `no-code`/`no-vsix`; a documented cache-bust step after a re-upload |
| **Boundary — OUT** | `KitGenerationService` / the legacy DB-assembled path (disabled); cockpit features (SCOPE-042); Marketplace publishing; changing `KIT_DOWNLOAD_SOURCE` back to legacy |

---

## User Scenarios

### US1 — Release can't silently ship a stale asset
The release author runs the sync/release. If the uploaded GitHub `kit.tar.gz` SHA doesn't match the just-built local `kit.tar.gz.sha256`, the release step **fails loudly** with the mismatch.
**Expected:** a stale/failed upload is caught at release time, not by a customer weeks later.

### US2 — Correct kit, no `code` on PATH
A customer opens a correct kit in VS Code but `code` isn't on PATH.
**Expected:** a prominent, visible instruction (README/init summary, not a swallowed log line) names the vsix path and the exact `--install-extension` command + how to add `code` to PATH.

### US3 — After a re-upload, no stale cache
An asset is re-uploaded to an existing tag.
**Expected:** a documented/automated cache-bust (or restart) so `KitProxyService` stops serving the cached stale archive within the hour.

---

## Functional Requirements

### FR-001 — Verify the published asset matches the build
The release flow (`sync-to-orchestrator.mjs --release` and/or `build-release.mjs`) MUST, after upload, re-download the published `kit.tar.gz` and assert its SHA-256 equals the freshly-built local sidecar; a mismatch MUST fail the release non-zero.
**Acceptance:**
- [ ] A stale/failed upload (published SHA ≠ local build SHA) fails the release with a clear message
- [ ] A correct upload passes; the check also confirms `vscode-extension/*.vsix` is present in the published archive

### FR-002 — Visible install fallback
When `install-cockpit-extension.mjs` returns `no-code` or `no-vsix`, the kit MUST surface a prominent instruction (README-KIT / init summary), not only a swallowed log line, naming the vsix path + the manual command + the "add `code` to PATH" hint.
**Acceptance:**
- [ ] A `no-code` outcome yields a visible, actionable message a non-technical customer can follow
- [ ] The message includes the exact `code --install-extension "<path>"` and the PATH-setup hint

### FR-003 — Cache-bust after re-upload
There MUST be a documented (or automated) way to invalidate `KitProxyService`'s 1-hour archive cache after a same-tag asset re-upload.
**Acceptance:**
- [ ] After a re-upload, a documented step (restart or a `_resetCache` hook) ensures fresh archives are served promptly

---

## Technical Sections

### Release-asset integrity (FR-001)
`KitProxyService.fetchAndVerify()` verifies the archive against the release's OWN sidecar — so a self-consistent stale pair (both old) passes. The gap is *release-time*: after `gh release create/upload`, re-download the published `kit.tar.gz` and compare its SHA to the local `releases/<v>/kit.tar.gz.sha256`, and assert the archive lists `vscode-extension/*.vsix`. Add to `sync-to-orchestrator.mjs`'s release step (and/or as a standalone `verify-release.mjs`). This is the defect that caused the incident.

### Install UX (FR-002)
Improve `install-cockpit-extension.mjs` (orchestrator-owned) so the `no-code`/`no-vsix` branches also write a visible marker the kit's README/init surfaces — reuse its existing return codes (`no-code | no-vsix | unchanged | installed | install-failed`). No new install mechanism.

### Cache (FR-003)
`KitProxyService` already exposes `_resetCache()`; document its use post-re-upload, or add a tiny admin route / release-hook to call it. A deploy/restart (which the normal push triggers) already clears it.

### Conventions
Orchestrator-owned scripts edited in the orchestrator repo (mirrored per the two-allowlist rule); app changes via `index.ts → app.ts`; 100% TS; Pino; nothing pushed until the user says push.

---

## Success Criteria

1. **No silent stale release.** A release whose published asset SHA ≠ the local build fails at release time — **0** stale kits reach customers undetected. *(FR-001)*
2. **No silent missing cockpit.** A `no-code`/`no-vsix` outcome always yields a visible manual-install instruction — **0** silent omissions. *(FR-002)*
3. **No stale-cache window.** After a same-tag re-upload, fresh archives serve within the documented bust step. *(FR-003)*

---

## Constraints & Notes

### Constraints
- **The live path is `KitProxyService` + the orchestrator release** — do not "fix" the disabled `KitGenerationService`.
- **Reuse SCOPE-042's installer + return codes**; don't reinvent install.
- **Best-effort + visible** — never break the kit; never fail silently.
- **Orchestrator-first**: implement via `createSpecs` → `implement`. Nothing pushed until the user says push.

### Out of Scope
- `KitGenerationService` / legacy DB-assembled kit (disabled via `KIT_DOWNLOAD_SOURCE=orchestrator`).
- Cockpit feature changes (SCOPE-042); Marketplace publishing.

### Dependencies
- The orchestrator release must carry the current `.vsix` (fixed 2026-07-04 by re-upload).

### Notes
- **Immediate incident: RESOLVED out-of-band** — v1.7.21 assets re-uploaded (498→583 files, vsix present, sha verified); `KitProxyService.serve()` passes the full install chain through. This scope is the *don't-recur* hardening, not the customer fix.
- **Root cause of the incident:** silent stale GitHub asset from a `--release` sync whose `gh` upload didn't land the fresh file; `KitProxyService` served exactly what the release contained.
- **Process note:** original premise (KitGenerationService) disproven by tracing `KIT_DOWNLOAD_SOURCE=orchestrator` → `KitProxyService`; rewritten in-conversation.
