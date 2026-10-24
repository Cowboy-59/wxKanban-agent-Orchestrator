# OmniRoute local service (SPEC-143, FR-008 and FR-009)

OmniRoute is a local router that lets an agent reach other model providers through one OpenAI-compatible
address. It is **MIT licensed**, runs as a **separate service**, and is **never bundled** into the kit: these
scripts only install, start and check it. Use it only for projects whose `allowedProviders` policy allows a
provider other than Anthropic.

**The Claude subscription is never routed through OmniRoute.** Claude-tier runs always use the official Claude
Code client (FR-009). Do not run `omniroute run claude`, `omniroute setup-claude` or `omniroute launch` for
Claude, and never set `ANTHROPIC_BASE_URL` to the gateway. `features-check.mjs` fails if it finds that.

## Scripts

| Script | What it does |
|---|---|
| `install.mjs` | Dry run by default: prints the exact commands. `--yes` acts. `--method docker\|npm`. Refuses if the needed tool is missing. |
| `start.mjs` | Starts the installed service detached (stdio ignored, unref). `--dry-run` prints only. |
| `status.mjs` | `omniroute: up (N ms)` or `down`; exit 1 when down. Uses the anonymous `/healthz` endpoint. |
| `features-check.mjs` | Confirms the four features are off, the bind is localhost, and OmniRoute's MCP server is not registered. Exit 0 safe, 1 a feature is on, 2 could not verify. |

## Install on Windows

Docker Desktop (preferred, loopback-only publish):

```
node _wxAI/routing/omniroute/install.mjs            # review
node _wxAI/routing/omniroute/install.mjs --yes      # act
node _wxAI/routing/omniroute/start.mjs
node _wxAI/routing/omniroute/status.mjs
```

This runs the pinned image `diegosouzapw/omniroute:3.8.53` with `-p 127.0.0.1:20128:20128`
(OmniRoute README.md:1092). Without Docker, `--method npm` runs
`npm install -g --allow-scripts=... omniroute@3.8.53` (README.md:1026-1034); npm 11 blocks install
scripts unless allowed. Node must satisfy `>=22.22.2 <23 || >=24.0.0 <27` (package.json:73). If
`omniroute` is not recognised afterward, add `npm config get prefix` to PATH (docs/guides/TROUBLESHOOTING.md:31).

Secrets live in `~/.wxai/` and never in a repository, and are never printed:
`omniroute.env` (JWT secret, key-encryption secret, dashboard password, safety flags) and `omniroute.key`
(the dashboard password). Windows ignores the 0600 file mode, so rely on your user-profile permissions.

## Scoped token

After the first start, open `http://127.0.0.1:20128`, sign in with the password in `omniroute.key`, add an
eligible non-Anthropic provider, then create **one** API key (Dashboard, Endpoints) with restricted model
access, an allowed-models list, a usage limit and an expiry (`POST /api/keys` fields: `modelAccessMode`,
`allowedModels`, `dailyUsageLimitUsd`, `expiresAt`; src/shared/validation/schemas/keys.ts:53-68). Save it to
`~/.wxai/omniroute.token`. `REQUIRE_API_KEY=true` is set so no call works without a key. For CLI management,
`omniroute tokens create --name N --scope read` makes a read-only access token (bin/cli/commands/tokens.mjs:28-32).

## The four features are OFF

| Feature | How it is off | Source |
|---|---|---|
| Stealth / client fingerprinting | `ENABLE_TLS_FINGERPRINT=false` (default false); `CLI_COMPAT_ALL=0` and no `CLI_COMPAT_<X>=1` (the code reads only `1` or `true`) | docs/reference/ENVIRONMENT.md:421; docs/security/STEALTH_GUIDE.md:261-273; open-sse/config/cliFingerprints.ts:402-407; open-sse/utils/proxyFetch.ts:94 |
| Quota sharing across keys | No master switch exists. It acts only through quota pools that give two or more API keys an allocation on one connection. Create no such pool; use one key. | docs/routing/QUOTA_SHARE.md:14-27; src/lib/db/quotaPools.ts:84; src/app/api/quota/pools/route.ts:23-34 |
| MITM / transparent proxy | Off unless started: `GET /api/settings/mitm` must show `running=false`, `dnsConfigured=false`. Never start it; never run the Antigravity MITM. | docs/security/STEALTH_GUIDE.md:192-222; src/app/api/settings/mitm/route.ts:146-163 |
| Token compression | Default `enabled=false`, `defaultMode="off"`. Leave it. `PUT /api/settings/compression` or `omniroute compression` only change it. | open-sse/services/compression/types.ts:421-423; src/app/api/settings/compression/route.ts:8-12; bin/cli/commands/compression.mjs:20,41 |
| MCP server unregistered | `mcpEnabled` defaults to false; we never run `claude mcp add-server omniroute` (README.md:919). `omniroute mcp disable` turns it off. | src/lib/db/settings.ts:185; docs/frameworks/MCP-SERVER.md:29-39; bin/cli/commands/mcp.mjs:360-363 |

Bind: the container publishes to loopback; the npm process gets `OMNIROUTE_SERVER_HOST=127.0.0.1`
(docs/reference/ENVIRONMENT.md:166,192,194 - the default is `0.0.0.0`, so this setting matters).

## Checking

`features-check.mjs` reads three layers: the env file we wrote, the live settings endpoints (needs a management
credential in `OMNIROUTE_CHECK_TOKEN`; without it those lines say `unverified` and the exit code is 2), and the
agent config (`~/.claude.json`, `.mcp.json`, `~/.claude/settings.json`) for an OmniRoute MCP entry or a gateway
`ANTHROPIC_BASE_URL`.

## Unverified until run

Nothing here was installed or run against a real OmniRoute at write time. See the report for the list:
the exact auth that the settings endpoints accept, the `/app/data` volume path and the in-container env names,
`docker create` plus `docker start` behavior, and whether any quota-sharing default pool appears on first start.
