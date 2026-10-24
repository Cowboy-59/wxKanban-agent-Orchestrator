# OpenViking service (optional) for Decision Memory

Plainly:

- OpenViking is licensed AGPLv3. It runs here as a **separate service**. It is **never bundled**
  in the kit, and **nothing from OpenViking is copied** into this repo. The kit only calls its
  HTTP API from `../openviking.mjs`.
- Install is **Docker-first**. Native Windows install is **unconfirmed**.
- It is optional. If it is down or slower than 2 seconds, the gate searches the ledger file
  instead and says so.
- Only ledger entries and approved patterns are indexed. Never code, never contact details.
- One namespace per repo plus one `global` namespace.
- The API key lives in `~/.wxai/openviking.key` (outside every repo) and is never printed.

Scripts (nothing here runs by itself):

| Script | What it does |
|---|---|
| `install-openviking.mjs` | Dry run by default: prints the exact `docker` commands. `--yes` performs them. Refuses without Docker. |
| `start-openviking.mjs` | Starts the container through a detached launcher. `--dry-run` prints only. |
| `status.mjs` | Prints up or down and the latency in ms. |

Several details of the OpenViking API are unverified (auth header, namespace field, inline text,
hit shape). They are isolated in the `ADAPTER` table at the top of `../openviking.mjs`.

## Image and storage

- Default image is the pinned `ghcr.io/volcengine/openviking:v0.4.18` (never :latest or :main).
  That tag came from a Sealos template and **must be confirmed**. Override with `--image` or
  `OPENVIKING_IMAGE`.
- The add call takes a path or URL, not inline text. Each entry is written as a small .md file
  (title = id) under `~/.wxai/openviking-staging/<namespace>/`, mounted read-only at `/staging`
  in the container, and added by path.
- Auth is `Authorization: Bearer <key>` plus an optional `X-OpenViking-Agent`.

## Still unverified

The search response shape, namespace creation and the `namespace` request field, the in-container
data path and key variable name, and the whole add-by-path flow against a running service.
