# Quickstart: Company Application Settings

**Feature**: 006-settings
**Date**: 2026-02-20
**Prerequisites**: Dev server running (`npm run dev:server`), a registered company with Admin credentials

---

## Integration Test Scenarios

These scenarios validate the complete settings feature end-to-end. Run in order.

### Setup

```bash
# Environment (add to .env if not present)
SETTINGS_ENCRYPTION_KEY="your-32-character-key-here-abcdef"   # exactly 32 chars
```

```bash
# Base URL
BASE="http://localhost:3001/api"

# Login as Admin and capture token cookie
curl -s -c cookies.txt -X POST "$BASE/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wxperts.com","$ccsCowboy007":"$ccsCowboy007"}' | jq .
```

Expected: Response contains `settings: []` (or existing settings) alongside user fields.

---

### Scenario 1: Settings load at login (FR-009)

**What to verify**: `settings` key is present in signin response.

```bash
RESPONSE=$(curl -s -c cookies.txt -X POST "$BASE/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wxperts.com","$ccsCowboy007":"$ccsCowboy007"}')

echo "$RESPONSE" | jq '.settings'
```

**Expected**: `[]` (empty array for new company) or existing settings array — not null, not missing.

---

### Scenario 2: Create a boolean setting (FR-001, FR-002)

```bash
curl -s -b cookies.txt -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "maintenance_mode",
    "type": "boolean",
    "value": "false",
    "description": "Disable access for non-admins"
  }' | jq .
```

**Expected**: `{ "success": true, "setting": { "name": "maintenance_mode", "type": "boolean", "value": "false" } }`

---

### Scenario 3: Duplicate name rejected (FR-003)

```bash
curl -s -b cookies.txt -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"name": "maintenance_mode", "type": "boolean", "value": "true"}' | jq .
```

**Expected**: HTTP 409 — `{ "code": "SETTING_NAME_CONFLICT", "error": "A setting named 'maintenance_mode' already exists." }`

---

### Scenario 4: Create remaining types (FR-002)

```bash
# report_header
curl -s -b cookies.txt -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"name": "report_company_name", "type": "report_header", "value": "Acme Corp"}' | jq .

# default
curl -s -b cookies.txt -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"name": "default_timezone", "type": "default", "value": "America/Chicago"}' | jq .

# image
curl -s -b cookies.txt -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"name": "company_logo", "type": "image", "value": "https://example.com/logo.png"}' | jq .
```

**Expected**: Each returns 201 with the created setting.

---

### Scenario 5: List all settings (FR-005)

```bash
curl -s -b cookies.txt "$BASE/settings" | jq '.settings | length'
```

**Expected**: `4` (the four settings created above).

---

### Scenario 6: Update a setting value (FR-006)

```bash
curl -s -b cookies.txt -X PATCH "$BASE/settings/maintenance_mode" \
  -H "Content-Type: application/json" \
  -d '{"value": "true"}' | jq .
```

**Expected**: `{ "success": true, "setting": { "name": "maintenance_mode", "value": "true" } }`

Then verify the list reflects the update:
```bash
curl -s -b cookies.txt "$BASE/settings" | jq '.settings[] | select(.name == "maintenance_mode")'
```

---

### Scenario 7: Non-Admin blocked from writing (FR-012)

```bash
# Login as a non-Admin user
curl -s -c cookies_member.txt -X POST "$BASE/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"member@example.com","password":"member-password"}' > /dev/null

# Attempt to create a setting
curl -s -b cookies_member.txt -X POST "$BASE/settings" \
  -H "Content-Type: application/json" \
  -d '{"name": "bad_setting", "type": "boolean", "value": "true"}' | jq .
```

**Expected**: HTTP 403 — `{ "error": "This action requires Administrator access." }`

---

### Scenario 8: Settings in /me response (FR-009)

```bash
curl -s -b cookies.txt "$BASE/auth/me" | jq '.settings | length'
```

**Expected**: `4` — settings are present in the /me response after login.

---

### Scenario 9: Delete a setting (FR-007)

```bash
curl -s -b cookies.txt -X DELETE "$BASE/settings/default_timezone" | jq .
```

**Expected**: `{ "success": true, "message": "Setting 'default_timezone' deleted." }`

Verify it's gone:
```bash
curl -s -b cookies.txt "$BASE/settings" | jq '[.settings[].name]'
```

**Expected**: `["maintenance_mode", "report_company_name", "company_logo"]`

---

### Scenario 10: Encryption at rest (FR-008)

```bash
# Query the companies table directly — settings column should show ciphertext
DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- | cut -d'#' -f1 | xargs)
psql "$DATABASE_URL" -c "SELECT id, name, LEFT(settings, 60) AS settings_preview FROM companies LIMIT 1;"
```

**Expected**: `settings_preview` column shows a hex/colon-delimited ciphertext string, NOT readable JSON.

---

## Cleanup

```bash
rm -f cookies.txt cookies_member.txt
```
