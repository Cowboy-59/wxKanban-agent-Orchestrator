# Data Model: Company Application Settings

**Feature**: 006-settings
**Date**: 2026-02-20

---

## Schema Changes

### Existing Table: `companies`

Add one column:

```sql
ALTER TABLE companies ADD COLUMN settings TEXT;
-- Stores AES-256-GCM encrypted JSON (ciphertext string)
-- NULL = no settings defined yet (treated as empty array on read)
```

Drizzle ORM change in `src/db/schema/company.ts`:

```typescript
settings: text("settings"),  // nullable, encrypted ciphertext
```

No other schema changes. No new tables.

---

## TypeScript Interface

```typescript
// src/server/services/SettingsService.ts

export type SettingType = 'boolean' | 'default' | 'report_header' | 'image';

export interface Setting {
  name: string;          // Unique per company; snake_case; 1-64 chars; [a-z0-9_]
  type: SettingType;
  value: string;         // Always string: booleans as "true"/"false", URLs for image
  description?: string;  // Optional; max 255 chars
}

// Shape of the decrypted payload stored in companies.settings
type SettingsPayload = Setting[];
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| `name` | Required; 1–64 chars; pattern `[a-z0-9_]`; unique per company |
| `type` | Required; one of: `boolean`, `default`, `report_header`, `image` |
| `value` | Required; if type=`boolean`, must be `"true"` or `"false"`; if type=`image`, must be non-empty string (URL); max 2048 chars |
| `description` | Optional; max 255 chars |

---

## Encryption Model

```
Write path:
  Setting[] → JSON.stringify → encryptToken(json, SETTINGS_ENCRYPTION_KEY)
                            → companies.settings (ciphertext text column)

Read path:
  companies.settings (ciphertext) → decryptToken(ciphertext, SETTINGS_ENCRYPTION_KEY)
                                  → JSON.parse → Setting[]

Null/empty handling:
  companies.settings IS NULL → return []
  decryptToken throws → log error, return [] (graceful degradation per spec edge case)
```

Environment variable: `SETTINGS_ENCRYPTION_KEY` — exactly 32 UTF-8 characters.

---

## State Transitions

Settings do not have a lifecycle state (active/inactive). The collection is an ordered array. Operations:

| Operation | Precondition | Postcondition |
|-----------|-------------|---------------|
| Create | `name` not in current collection | Setting added to array; array re-encrypted and saved |
| Update | `name` exists in current collection | Setting value updated in array; array re-encrypted and saved |
| Delete | `name` exists in current collection | Setting removed from array; array re-encrypted and saved |
| Read | Always | Returns current decrypted array (empty if null or error) |

---

## Session Data Extension

Login response and `/api/auth/me` response include:

```typescript
{
  userid: string;
  email: string;
  usertype: string;
  companyid: string;
  billingplan: string;
  subscriptionstatus: string;
  seatslimit: number;
  seatsused: number;
  settings: Setting[];   // ← NEW field
}
```

`AuthContext.User` interface extended with `settings?: Setting[]`.

---

## Index / Performance

No new indexes needed. Settings are fetched as part of the company row. Company is always fetched by primary key (`id` UUID) — O(1) lookup.
