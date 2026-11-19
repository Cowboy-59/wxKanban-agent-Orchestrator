# wxKanban MCP Connection Issue — Support Transcript

**Date:** 2026-07-04
**Project:** wxkanban-project.json (project ID `6e3d128c-658f-4b21-818f-653d026bc734`)
**Reported by:** al@jca-aust.com
**MCP server:** `wxkanban-hub` → `https://mcp.wxperts.com/mcp`

---

## Summary

User could not connect to the `wxkanban-hub` MCP server (`https://mcp.wxperts.com/mcp`) from Claude Code. Two independent, unrelated root causes were found and fixed:

1. **Local TLS revocation-check failure** — Windows Schannel could not complete an OCSP/CRL revocation check during the TLS handshake to `mcp.wxperts.com`, likely due to AV/SSL-inspection software on the user's machine intercepting HTTPS traffic. Turning off the interfering security software resolved this.
2. **Unresolved environment variable in `.mcp.json`** — The project's `.mcp.json` uses `"Authorization": "Bearer ${WXKANBAN_API_TOKEN}"`, but `WXKANBAN_API_TOKEN` only existed in the project's `.env` file. Claude Code does **not** auto-load `.env` files for `.mcp.json` variable expansion — it only resolves `${VAR}` from the real process environment or from a `.claude/settings.json` / `.claude/settings.local.json` `env` block. This meant the Authorization header was going out empty/unresolved. Fixed by adding the token to `.claude/settings.local.json` under an `env` key.

---

## Configuration on disk

`.mcp.json`:
```json
{
  "mcpServers": {
    "wxkanban-hub": {
      "type": "http",
      "url": "https://mcp.wxperts.com/mcp",
      "headers": {
        "Authorization": "Bearer ${WXKANBAN_API_TOKEN}"
      }
    }
  }
}
```

`.env`:
```
# wxKanban Project Environment (hosted MCP, spec 028)
WXKANBAN_MCP_BASE_URL=https://mcp.wxperts.com
WXKANBAN_API_TOKEN=9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0
WXKANBAN_PROJECT_ID=6e3d128c-658f-4b21-818f-653d026bc734
```

---

## Diagnostic steps and findings

### 1. Initial connection test (failed)

```
curl -sS -i -m 15 -X POST https://mcp.wxperts.com/mcp \
  -H "Authorization: Bearer 9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize", ...}'
```

Result:
```
curl: (35) schannel: next InitializeSecurityContext failed: CRYPT_E_NO_REVOCATION_CHECK (0x80092012) - The revocation function was unable to check revocation for the certificate.
```

### 2. Confirmed server/token were fine (with revocation check disabled)

```
curl ... --ssl-no-revoke ...
```

Result: `HTTP/1.1 200 OK`
```json
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"mcp-project-hub","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
```

This confirmed the server, TLS cert, and bearer token were all valid — the failure was purely local (Windows revocation check).

### 3. Investigated network path

- No proxy environment variables set.
- DNS resolved fine for `mcp.wxperts.com` (aliases to AWS App Runner: `dj6u5hgm7v.us-east-2.awsapprunner.com`).
- Certificate's Authority Information Access showed:
  - OCSP: `http://ocsp.r2m04.amazontrust.com`
  - CA Issuers: `http://crt.r2m04.amazontrust.com/r2m04.cer`
- Both of those hosts resolved via DNS and responded `200 OK` to plain HTTP GET — ruling out a blanket firewall block.
- Conclusion: something machine-local (AV/EDR doing SSL/TLS inspection) was interfering specifically with Schannel's revocation-check request during the handshake to this one domain, not blocking the hosts outright.

### 4. User disabled AV/SSL-inspection software and retested

```
curl -sS -i -m 15 -X POST https://mcp.wxperts.com/mcp -H "Authorization: Bearer ..." ...
```

Result: `HTTP/1.1 200 OK` — same valid `initialize` response as above, this time **without** the `--ssl-no-revoke` workaround. Confirms AV/SSL-inspection was the cause of issue #1.

### 5. Claude Code still could not connect

Even with curl succeeding, the user reported Claude Code itself still couldn't connect. Investigated further:

- Checked whether `WXKANBAN_API_TOKEN` was present in the actual shell/process environment: **it was not** — it only existed inside `.env`.
- Verified via Claude Code documentation (`https://code.claude.com/docs/en/mcp-configuration.md`, "Environment variable expansion in `.mcp.json`" section) that Claude Code does **not** auto-load `.env` files. `${VAR}` placeholders in `.mcp.json` are resolved only from:
  - the real process/shell environment at launch time, or
  - the `env` key in `.claude/settings.json` / `.claude/settings.local.json`.
- If the variable isn't set anywhere, Claude Code fails to parse/resolve the config for that server.

### 6. Fix applied

Added the token to `.claude/settings.local.json` (project-local, user-specific settings file):

```json
{
  "permissions": {
    "allow": [
      "Bash(cd \"/c/wxkanban-project.json\" && ls -la .vscode 2>&1; echo \"---\"; ls -la .claude 2>&1; echo \"---home claude---\"; ls -la ~/.claude 2>&1 | head -30; echo \"---claude.json---\"; find ~ -maxdepth 1 -iname \".claude.json\" 2>/dev/null)",
      "Read(//c/Users/AL/.claude/**)",
      "Read(//c/Users/AL/**)"
    ]
  },
  "env": {
    "WXKANBAN_API_TOKEN": "9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0"
  }
}
```

User was instructed to reload the VS Code window (or restart Claude Code) so it re-reads settings and re-resolves `${WXKANBAN_API_TOKEN}` in `.mcp.json`.

---

## Status at time of writing

- Root cause #1 (TLS revocation check / AV interference): **Resolved**, confirmed via curl.
- Root cause #2 (missing env var for Claude Code's own MCP client): **Fix applied**, pending user confirmation after a VS Code reload that the `wxkanban-hub` MCP server now connects inside Claude Code itself.

## Suggestion for wxperts/wxkanban-agent tooling

Consider documenting (or having the kit scaffold) that `.mcp.json` variables must be duplicated into `.claude/settings.json`'s `env` block (or exported in the shell) — relying solely on a project `.env` file is a common trap, since `wxkanban-agent` CLI commands presumably do read `.env` directly while Claude Code's own MCP client does not.

---

## Second issue found in the same session: Dev Cockpit `.vsix` missing from kit download

While investigating the above, also found that `scripts/install-cockpit-extension.mjs` (spec 042 FR-009/FR-010) silently no-ops with result `no-vsix` on this kit.

**Root cause:** the downloaded kit archive (`wxkanban-kit-6e3d128c-658f-4b21-818f-653d026bc734-v1.7.21(2).zip`, 500 files) contains **no `vscode-extension/` directory at all** — neither a pre-built `.vsix` nor the extension source needed to build one locally. Per `scripts/build-release.mjs` (lines 280–305), the release process is supposed to:
1. Build the `.vsix` from a `vscode-extension/` source tree at the kit root (`npm run package` inside it), then
2. Add only the resulting `wxkanban-dev-cockpit-<version>.vsix` into the shipped archive.

If `vscode-extension/` doesn't exist on the machine that ran `build-release.mjs`, step 1 is silently skipped (`if (existsSync(vscodeExtDir))`, no error/warning), so the release ships without the extension. That appears to be what happened for this download — this looks like the same class of issue as `CHANGELOG.md`'s "packaging gaps" fix noted in `BUG-REPORT-kit-dbpush-tls-and-packaging.md`, but for the Dev Cockpit `.vsix` specifically rather than `shared/preflight`.

**Confirmed via:**
- `find` for any `*.vsix` under the extracted project: none found.
- `unzip -l` on the kit zip itself: no `vscode-extension/` entries, no `.vsix` entries.
- Manually running `code --install-extension "<kit root>/vscode-extension/wxkanban-dev-cockpit-0.2.16.vsix"`:
  ```
  Error: ENOENT: no such file or directory, open '...\vscode-extension\wxkanban-dev-cockpit-0.2.16.vsix'
  ```
- `code --list-extensions --show-versions`: `wxperts.wxkanban-dev-cockpit` is not installed on this machine at any version.

**Ask:** please re-cut/re-publish the v1.7.21 kit archive with `vscode-extension/*.vsix` included (or send the `.vsix` directly so it can be dropped into `vscode-extension/` and installed manually with `code --install-extension`).
