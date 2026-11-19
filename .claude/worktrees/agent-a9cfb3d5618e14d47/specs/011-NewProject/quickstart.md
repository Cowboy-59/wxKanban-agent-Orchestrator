# Quickstart: New Project — AI-Ready Project Provisioning (Spec 011)

**Feature**: Spec 011 — New Project AI-Ready Provisioning
**Date**: 2026-02-22
**Prerequisites**: wxKanban server running, PostgreSQL reachable, `archiver` npm package installed, ADMIN user account available

---

## Scenario 1: New Project — Generate and Download Kit

**Goal**: Verify that creating a new project with `generateKit: true` produces a downloadable ZIP containing all 7 kit components.

```bash
# Step 1: Create project via UI
# Open /projects → click "New Project"
# Fill in: Name = "Test AI Project", Description = "Testing kit generation"
# AI Tooling section: toggle ON, Primary AI = "BLACKBOXAI"
# Submit

# Step 2: Verify kit status immediately after creation
GET /api/projects/:id/kit
# Expected: { "status": "generating" }

# Step 3: Wait ~5 seconds, poll again
GET /api/projects/:id/kit
# Expected: { "status": "ready", "primaryAI": "blackboxai", "kitVersion": "1.0.0", "downloadUrl": "/api/projects/:id/kit/download" }

# Step 4: Download kit
GET /api/projects/:id/kit/download
# Expected: ZIP file download, filename = "test-ai-project-kit.zip"

# Step 5: Extract and verify ZIP contents
unzip test-ai-project-kit.zip -d kit-test/
ls kit-test/
# Expected files:
#   AI.md
#   CLAUDE.md
#   ai-settings.json
#   .wxkanban-project.json
#   .env
#   .gitignore
#   ProjectOverview.md
#   _wxAI-commands/task-push.md
#   _wxAI-commands/task-done.md
#   _wxAI-commands/wxAI-pipeline.md
#   _wxAI-commands/autofix-tests.md
#   _wxAI-commands/autofix-translation.md
#   _wxAI-commands/sync-cpl.md
#   _wxAI-commands/sync-starter-kit.md
#   tools/wxkanban-mcp.mjs

# Step 6: Verify variable substitution in AI.md
cat kit-test/AI.md
# Expected: project UUID, project name "Test AI Project", wxKanban URL — all substituted (no {{placeholders}})

# Step 7: Verify encrypted DB URL
cat kit-test/.env
# Expected: DATABASE_URL_ENCRYPTED=<base64 string>
# Expected: WXKANBAN_API_TOKEN=wxk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (placeholder)
# Expected: NO plain DATABASE_URL line

# Step 8: Verify .gitignore
cat kit-test/.gitignore
# Expected: .env is listed

# Step 9: Verify download count incremented
GET /api/projects/:id/kit
# Expected: { "downloadCount": 1 }
```

**Pass criteria**: ZIP contains all 15+ files. No `{{placeholders}}` in rendered files. No plain `DATABASE_URL`. `downloadCount` = 1.

---

## Scenario 2: Kit Status Polling

**Goal**: Verify the kit status API transitions correctly from `generating` → `ready`.

```bash
# Step 1: Create project (generateKit: true)
POST /api/projects
Body: { "name": "Poll Test", "generateKit": true, "primaryAI": "cursor" }

# Step 2: Immediately check kit status
GET /api/projects/:id/kit
# Expected: { "status": "generating" } OR { "status": "ready" } (if very fast)

# Step 3: Check response shape when ready
GET /api/projects/:id/kit
# Expected shape:
# {
#   "status": "ready",
#   "primaryAI": "cursor",
#   "kitVersion": "1.0.0",
#   "downloadUrl": "/api/projects/:id/kit/download",
#   "generatedAt": "2026-02-22T...",
#   "downloadCount": 0
# }

# Step 4: Check project with no kit
GET /api/projects/:other-id/kit  (project created with generateKit: false)
# Expected: { "status": "not_generated" }
```

**Pass criteria**: Status transitions correctly. `not_generated` returned for projects without kits. Response shape matches FR-006.

---

## Scenario 3: Encrypted DATABASE_URL — Security Verification

**Goal**: Verify that plain text DATABASE_URL never appears in the kit, and that decryption works correctly with the API token.

```bash
# Step 1: Download kit for a project
GET /api/projects/:id/kit/download
# Save as kit.zip

# Step 2: Search entire ZIP for plain DATABASE_URL
unzip -p kit.zip | grep -i "DATABASE_URL=" | grep -v "ENCRYPTED"
# Expected: NO matches (plain DATABASE_URL not present)

# Step 3: Verify encrypted format
unzip -p kit.zip .env | grep DATABASE_URL_ENCRYPTED
# Expected: DATABASE_URL_ENCRYPTED=<iv_b64>.<ciphertext_b64>.<tag_b64>

# Step 4: Test decryption (manual verification)
# In Node.js REPL:
import { createDecipheriv, createHash } from 'crypto';
const apiToken = 'wxk_live_<your_token>';
const encryptedStr = '<value from .env>';
const key = createHash('sha256').update(apiToken).digest();
const [ivB64, ciphertextB64, tagB64] = encryptedStr.split('.');
const iv = Buffer.from(ivB64, 'base64');
const ciphertext = Buffer.from(ciphertextB64, 'base64');
const tag = Buffer.from(tagB64, 'base64');
const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
console.log(decrypted);
# Expected: postgresql://user:password@pgkanban.wxperts.com:5432/wxkanban

# Step 5: Verify wrong token fails
# Use a different API token → decryption should throw "Unsupported state or unable to authenticate data"

# Step 6: Start MCP server with correct token
echo "WXKANBAN_API_TOKEN=wxk_live_<your_token>" >> .env
echo "DATABASE_URL_ENCRYPTED=<encrypted_value>" >> .env
node tools/wxkanban-mcp.mjs
# Expected: MCP server starts, connects to DB, no errors

# Step 7: Start MCP server with missing token
# Remove WXKANBAN_API_TOKEN from .env
node tools/wxkanban-mcp.mjs
# Expected: "ERROR: WXKANBAN_API_TOKEN and DATABASE_URL_ENCRYPTED required in .env"
# Expected: process exits with code 1
```

**Pass criteria**: No plain DATABASE_URL in ZIP. Decryption succeeds with correct token. Fails with wrong token. MCP server exits cleanly on missing env vars.

---

## Scenario 4: CLI Init — New Directory

**Goal**: Verify `--init` scaffolds a fresh local directory with all kit files.

```bash
# Step 1: Create empty test directory
mkdir /tmp/test-project && cd /tmp/test-project

# Step 2: Run init
node /path/to/tools/wxkanban-mcp.mjs --init <project_id>
# Expected output:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WXKANBAN PROJECT INIT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Project: Test AI Project
#  Project ID: <uuid>
#  Primary AI: blackboxai
#
#  Added:
#   + AI.md
#   + CLAUDE.md
#   + ai-settings.json
#   + .wxkanban-project.json
#   + .env (template — add WXKANBAN_API_TOKEN)
#   + .gitignore
#   + ProjectOverview.md
#   + _wxAI-commands/task-push.md
#   + ... (all 7 commands)
#   + tools/wxkanban-mcp.mjs
#
#  Next Steps:
#   1. Add WXKANBAN_API_TOKEN to .env
#   2. Copy mcpServers block from ai-settings.json to your AI settings
#   3. Run /task-push <spec_number> to push your first spec to wxKanban DB
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Step 3: Verify files created
ls -la /tmp/test-project/
# Expected: all kit files present

# Step 4: Re-run init (idempotency)
node /path/to/tools/wxkanban-mcp.mjs --init <project_id>
# Expected: "Skipped: AI.md (already exists)", etc. for all files
# Expected: 0 files overwritten
```

**Pass criteria**: All kit files created in empty directory. Re-run skips all existing files. Detection report accurate.

---

## Scenario 5: Import Existing Project — Non-Destructive Injection

**Goal**: Verify that importing an existing project with AI tooling already set up does not overwrite existing files.

```bash
# Step 1: Create a simulated existing project directory
mkdir /tmp/existing-project && cd /tmp/existing-project
mkdir -p .claude/commands tools
echo "# My existing CLAUDE.md" > CLAUDE.md
echo "# Existing command" > .claude/commands/speckit.specify.md
echo "# Legacy agents" > AGENTS.md
mkdir AIRules
echo "# Legacy rule" > AIRules/rule1.md

# Step 2: Import via UI
# Open /projects → click "Import Existing Project"
# Fill in: Name = "Existing Project", Primary AI = "Claude Code"
# Submit → project created, kit generated with importMode: true

# Step 3: Run init in existing directory
node /path/to/tools/wxkanban-mcp.mjs --init <project_id>

# Expected detection report:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WXKANBAN PROJECT IMPORT — Detection Report
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Detected:
#   ✓ .claude/commands/  — 1 existing command (kept, not modified)
#   ✓ CLAUDE.md          — existing (wxKanban section appended)
#   ⚠ AGENTS.md          — legacy file (flagged for migration)
#   ⚠ AIRules/           — legacy directory (flagged for migration)
#
#  Added:
#   + AI.md
#   + ai-settings.json   (mcpServers.wxkanban block)
#   + .wxkanban-project.json
#   + .env (template)
#   + _wxAI-commands/task-push.md
#   + _wxAI-commands/task-done.md
#   + _wxAI-commands/wxAI-pipeline.md
#   + tools/wxkanban-mcp.mjs
#
#  Migration Suggestions:
#   → AGENTS.md: Consider deleting (deprecated)
#   → AIRules/: Consider migrating to _wxAI-commands/
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Step 4: Verify existing files untouched
cat /tmp/existing-project/CLAUDE.md
# Expected: original content PLUS wxKanban section appended at bottom

cat /tmp/existing-project/.claude/commands/speckit.specify.md
# Expected: "# Existing command" (unchanged)

cat /tmp/existing-project/AGENTS.md
# Expected: "# Legacy agents" (unchanged — flagged but not deleted)

# Step 5: Verify NO ProjectOverview.md (import mode)
ls /tmp/existing-project/ProjectOverview.md
# Expected: No such file (import kits do not include ProjectOverview.md)
```

**Pass criteria**: Existing files untouched. Kit files injected. CLAUDE.md appended (not replaced). `ProjectOverview.md` absent. Detection report accurate.

---

## Scenario 6: Kit Regeneration

**Goal**: Verify that regenerating a kit produces a new version with incremented `kitversion` and reset `downloadCount`.

```bash
# Step 1: Verify current kit state
GET /api/projects/:id/kit
# Expected: { "status": "ready", "kitVersion": "1.0.0", "downloadCount": 3 }

# Step 2: Trigger regeneration (ADMIN only)
POST /api/projects/:id/kit/regenerate
# Expected: { "status": "generating", "message": "Kit regeneration started" }

# Step 3: Poll until ready
GET /api/projects/:id/kit
# Expected: { "status": "ready", "kitVersion": "1.0.1", "downloadCount": 0 }

# Step 4: Verify new kit has fresh encrypted URL
GET /api/projects/:id/kit/download
# Save as new-kit.zip
# Extract .env → DATABASE_URL_ENCRYPTED should be different from previous kit
# (new IV = new ciphertext even for same plaintext)

# Step 5: Verify non-ADMIN cannot regenerate
POST /api/projects/:id/kit/regenerate  (as TEAM_MEMBER)
# Expected: 403 Forbidden
```

**Pass criteria**: `kitVersion` incremented. `downloadCount` reset to 0. New encrypted URL differs from old. Non-ADMIN blocked.

---

## Scenario 7: API Token Management

**Goal**: Verify API token creation, display, and revocation flow.

```bash
# Step 1: Create API token (via Settings → API Tokens)
POST /api/settings/api-tokens
# Expected: { "token": "wxk_live_<32 hex chars>", "prefix": "wxk_live_xxxxxxxx" }
# Note: full token shown ONCE — copy it now

# Step 2: Verify token stored hashed (not plain)
# Check DB: SELECT tokenprefix, tokenhash FROM apitokens WHERE userid = :userid
# Expected: tokenprefix = "wxk_live_xxxxxxxx", tokenhash = SHA-256 hash (not plain token)

# Step 3: List tokens
GET /api/settings/api-tokens
# Expected: [{ "id": "...", "prefix": "wxk_live_xxxxxxxx", "createdat": "...", "revokedat": null }]
# Note: full token NOT returned in list

# Step 4: Revoke token
DELETE /api/settings/api-tokens/:tokenid
# Expected: 204 No Content

# Step 5: Verify revoked token cannot decrypt kit
# Try to download kit with revoked token's encrypted URL
# Expected: decryption fails (token hash no longer matches)
```

**Pass criteria**: Token shown once on creation. Stored hashed. List shows prefix only. Revocation works. Revoked token cannot decrypt.

---

## Scenario 8: generateKit: false — No Kit Generated

**Goal**: Verify that opting out of kit generation works correctly.

```bash
# Step 1: Create project with generateKit: false
POST /api/projects
Body: { "name": "No Kit Project", "generateKit": false }

# Step 2: Check kit status
GET /api/projects/:id/kit
# Expected: { "status": "not_generated" }

# Step 3: Attempt download
GET /api/projects/:id/kit/download
# Expected: 404 Not Found — "Kit not available for this project"
```

**Pass criteria**: No kit record created. Status returns `not_generated`. Download returns 404.
