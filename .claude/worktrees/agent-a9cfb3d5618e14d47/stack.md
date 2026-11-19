# Project Stack & Style

**Application types:** Web, Desktop, Mobile

## Target Stack — Web

| Dimension | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Ubiquitous, well-documented, large hiring pool. |
| Frontend | React + Vite | Component model + fast dev server; the most common SPA stack. |
| Database | PostgreSQL | Reliable relational default with strong tooling. |
| Styling / Components | Tailwind CSS + shadcn/ui | Utility-first speed with accessible, ownable components. |
| Testing | Vitest + Playwright | Fast unit tests plus real-browser E2E coverage. |
| Hosting / Deploy | Containerized (AWS / Vercel) | Portable deploy target; swap providers without code change. |

## Target Stack — Desktop

| Dimension | Choice | Why |
|---|---|---|
| Backend | Rust (Tauri core) or Node sidecar | Tauri ships a tiny native binary; Node sidecar only if needed. |
| Frontend | React (Tauri webview) | Reuse web UI skills inside a lightweight native shell. |
| Database | SQLite (embedded) | Zero-config local persistence that ships with the app. |
| Styling / Components | Tailwind CSS | Same styling model as web; no component-library lock-in required. |
| Testing | Vitest | Unit-tests the webview logic; native shell tested manually in v1. |
| Hosting / Deploy | Signed installers (per-OS) | Distribute via native installers / auto-update, not a server. |

## Target Stack — Mobile

| Dimension | Choice | Why |
|---|---|---|
| Backend | Node.js + Express API | Shared API backend the mobile client calls over HTTPS. |
| Frontend | React Native (Expo) | One codebase for iOS + Android; reuses React skills. |
| Database | SQLite (on-device) + Postgres (server) | Local-first storage syncing to a server DB. |
| Styling / Components | NativeWind (Tailwind for RN) | Tailwind syntax mapped to React Native styles. |
| Testing | Jest + Detox | Unit tests plus on-device end-to-end flows. |
| Hosting / Deploy | App stores + EAS / managed API | Ship the app via stores; host the API as a managed service. |

## Look & Feel

- Default style (no reference cited).

### Design Tokens

- **Colors** — primary #4f46e5, secondary #0ea5e9, neutral #64748b, background #ffffff, foreground #0f172a
- **Typography** — system-ui, -apple-system, sans-serif; 16px base, 1.25 modular scale
- **Spacing** — base 4px (Tailwind spacing scale); radius 0.5rem (rounded-lg)
