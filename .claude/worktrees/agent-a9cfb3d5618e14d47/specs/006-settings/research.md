# Research: Company Application Settings

**Feature**: 006-settings
**Date**: 2026-02-20

---

## Decision 1: Storage location — inline JSON vs. separate table

**Decision**: Store settings as encrypted JSON in `companies.settings text` column.

**Rationale**:
- Spec explicitly states "stored in the companies record as json encrypted"
- Settings count per company is small (< 100 expected)
- Inline storage simplifies loading at login (one query fetches company record + settings simultaneously)
- No need for joins, no additional migration complexity beyond one column add

**Alternatives considered**:
- Separate `companysettings` table: Better for queryability; overkill for current scale; requires new table + migration; rejected in favour of spec literal requirement
- `companies.settings jsonb`: Cannot use jsonb if storing ciphertext — jsonb must be valid JSON. Text column is correct for opaque ciphertext.

---

## Decision 2: Encryption implementation

**Decision**: Reuse `encryptToken` / `decryptToken` from `src/server/lib/crypto.ts` (AES-256-GCM).

**Rationale**:
- Already in the codebase, tested, uses AES-256-GCM with random IV and auth tag
- Consistent encryption mechanism across the system
- Key sourced from `process.env.SETTINGS_ENCRYPTION_KEY` (32 UTF-8 chars required)

**Key requirement**: `SETTINGS_ENCRYPTION_KEY` must be exactly 32 characters in `.env`. Document in `.env.example`.

**Alternatives considered**:
- argon2 / bcrypt: Hash functions — irreversible; wrong tool for settings that need to be read back
- New encryption lib: No justification; existing implementation sufficient
- No encryption: Rejected — spec explicitly requires encryption at rest

---

## Decision 3: Session delivery of settings

**Decision**: Include decrypted `settings: Setting[]` in `POST /api/auth/signin` and `GET /api/auth/me` response bodies. Store in `AuthContext.User.settings`.

**Rationale**:
- FR-009 requires settings loaded into session at login — no separate request
- Response body is the correct place (not JWT claims — avoids bloat and prevents settings from being exposed in token)
- `AuthContext` already holds user + company state; extending it with `settings` is consistent
- All components already use `useAuth()` — zero new infrastructure needed

**Alternatives considered**:
- Separate `SettingsContext`: Extra provider, extra fetch; rejected — settings are loaded with login
- Settings in JWT payload: JWT bloat, settings visible to anyone who decodes the token; rejected
- `GET /api/settings` called on mount: Extra round-trip on every page load; rejected

---

## Decision 4: Image type handling

**Decision**: `image` type setting stores a URL string as its value. The URL may reference any uploaded asset.

**Rationale**:
- Embedding raw binary in encrypted JSON would be impractical for large files
- File upload is a cross-cutting concern (not unique to settings)
- Admin enters or pastes a URL, or uploads via a separate upload endpoint that returns a URL
- Future: a dedicated file upload endpoint can be added; `image` settings just store whatever URL is provided

**Out of scope for this spec**: multipart file upload endpoint. Admin can supply any accessible URL.

---

## Decision 5: Name uniqueness enforcement

**Decision**: Enforced at service layer before write. No DB-level unique constraint (settings are inside a JSON blob, not individual rows).

**Rationale**:
- Since settings are stored as a JSON array inside one column, DB constraints cannot enforce per-name uniqueness
- Service layer reads current settings, checks for duplicate name, rejects or replaces atomically
- For concurrent updates: last-write-wins at the company level (acceptable per spec edge case definition)

---

## Decision 6: `default` type semantics

**Decision**: `default` type accepts any string or numeric value. Value is stored as a string; consumers cast as needed.

**Rationale**:
- Spec defines `default` as "catch-all for any text or numeric value"
- Storing as string is safe and type-flexible; consumers interpret the value in their context

---

## Summary of `Setting` interface

```typescript
export interface Setting {
  name: string;          // Unique per company, snake_case recommended
  type: 'boolean' | 'default' | 'report_header' | 'image';
  value: string;         // All values stored as string; boolean as "true"/"false"
  description?: string;  // Optional human-readable label
}
```

Boolean toggle: `value = "true" | "false"` (string, cast to boolean on read).
All values are strings to keep the encrypted JSON schema uniform.
