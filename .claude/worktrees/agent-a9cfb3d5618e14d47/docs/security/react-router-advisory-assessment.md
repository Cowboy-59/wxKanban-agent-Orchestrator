# Security Assessment — react-router advisories (GHSA-49rj / GHSA-2j2x / GHSA-8x6r)

**Date:** 2026-07-24
**Package:** `react-router` / `react-router-dom` 7.18.1 (latest published)
**Advisory range:** 7.12.0 – 8.2.0 (no forward-fixed release exists; npm's only offered remedy is a downgrade to 7.11.0)
**Decision:** **Accept + monitor.** Stay on 7.18.1; no downgrade. The app is not exposed to any of the three advisories. Revisit when react-router publishes a fixed release above 8.2.0.

## Why the app is not exposed

The app uses react-router in **declarative SPA mode only** — `<BrowserRouter>` + `<Routes>`/`<Route>`, `useNavigate`/`useParams`/`useSearchParams`/`<Navigate>`. It does **not** use the data router (`createBrowserRouter`, `RouterProvider`, loaders/actions, `useLoaderData`) and it is a client-only **Vite SPA** (no SSR / framework mode).

| Advisory | Requires | This app |
|---|---|---|
| **GHSA-49rj-9fvp-4h2h** — turbo-stream RCE via `TYPE_ERROR` deserialization | Data router + loaders/actions (turbo-stream is the data-router serialization format) | ❌ not used — declarative router, no loaders |
| **GHSA-8x6r-g9mw-2r78** — DoS via unbounded path expansion in the `__manifest` endpoint | SSR / framework mode (the `__manifest` endpoint is server-rendered) | ❌ not used — client-only Vite SPA |
| **GHSA-2j2x-hqr9-3h42** — same-origin open-redirect via protocol-relative `//` path | A redirect target sourced from user-controlled input | ✅ already mitigated (see below) |

## Open-redirect mitigation (already in place)

The only redirect whose target comes from user-controlled input is the post-login return path. It is validated at `src/client/pages/auth/Login.tsx`:

```ts
const raw = searchParams.get("return");
if (!raw) return null;
if (!raw.startsWith("/") || raw.startsWith("//")) return null; // rejects protocol-relative //
return raw;
```

Only same-origin absolute paths (`/foo`) are honored; `//evil.com`, `http://…`, and non-`/` values are rejected. Every other `navigate(...)`/`<Navigate to=...>` in the client uses literal or internal-config targets (nav hrefs, CTA paths, `SUBSCRIPTION_WALL_PATH`), never user input.

## Monitoring

- Re-check on each `npm audit`; upgrade to the first react-router release **> 8.2.0** that clears the advisory.
- If the app ever adopts the data router (`createBrowserRouter` + loaders) or SSR, this assessment must be revisited immediately — the RCE and DoS become reachable at that point.
