# Feature Specification: Company Application Settings

**Feature Branch**: `006-settings`
**Created**: 2026-02-20
**Status**: Draft
**Input**: `specs/006-settings/scope.md`

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

A company Admin opens the Settings section of the admin panel and sees the full list of current company-wide settings. They can add new settings (choosing a unique name, a type, and a value), edit existing settings, and delete settings they no longer need. Settings are stored encrypted so no one can tamper with them outside the admin panel. When any user logs in, the system automatically loads the company settings and the user's profile into their session — no extra steps required.

### Acceptance Scenarios

1. **Given** an Admin is on the Settings page, **When** they create a new setting named `maintenance_mode` of type `boolean` with value `false`, **Then** the setting appears in the list, and all future sessions include it.

2. **Given** a setting named `report_logo` already exists, **When** an Admin attempts to create another setting with the same name, **Then** the system rejects the request with a clear "name already in use" error and does not create a duplicate.

3. **Given** an Admin changes the `report_logo` setting from one image to another, **When** the change is saved, **Then** all report-generating operations subsequently use the new image.

4. **Given** a non-Admin user is authenticated, **When** they attempt to create, update, or delete any setting, **Then** the system denies the action and the settings remain unchanged.

5. **Given** any user logs in successfully, **When** their session is established, **Then** all current company settings and their own profile are available in session memory for the duration of that session without any additional request.

6. **Given** an Admin deletes a setting, **When** the deletion is confirmed, **Then** the setting no longer appears in the list and is removed from subsequent session loads.

### Edge Cases

- If `SETTINGS_ENCRYPTION_KEY` is absent or not exactly 32 UTF-8 characters at server startup, the server MUST fail to start with a clear error message identifying the misconfiguration. This prevents silently running without encryption.
- If the stored settings data is unreadable at runtime (e.g., corruption or key rotation mismatch), the system treats the company as having zero settings, logs an error for investigation, and continues to allow login.
- If an image setting upload exceeds the allowed size or is not a supported image format, the system rejects it with a specific error before saving.
- If an expected setting is missing (e.g., deleted by another Admin), other parts of the application handle the absence gracefully with a sensible default.
- If two Admins save changes to settings simultaneously, the system applies the last-write-wins policy and the resulting state reflects one save fully (no partial corruption).

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Admins MUST be able to create a new setting by providing a unique name, selecting a type, and entering a value appropriate for that type.
- **FR-002**: The system MUST support four setting types: `boolean` (on/off toggle), `default` (free-form text or number used as a default value elsewhere), `report_header` (text consumed by the header area of generated reports and invoices), and `image` (a company image asset such as a logo — the admin may either paste a direct URL or upload an image file to S3; in both cases the stored value is a URL string pointing to the image).
- **FR-002a**: The following reserved setting names are recognized by report and invoice generation. Admins create these as ordinary settings; downstream renderers look them up by exact name: `report_company_name` (type `report_header` — company name text displayed in document header) and `report_logo` (type `image` — logo URL displayed in document header). No report-title reserved name is defined; document titles are generated dynamically.
- **FR-003**: Setting names MUST be unique within a company. The system MUST reject creation of a setting whose name already exists for that company.
- **FR-004**: Settings MUST be scoped to the company — every company has its own independent set of settings; no setting is shared across companies.
- **FR-005**: Admins MUST be able to view a list of all current company settings showing name, type, and current value.
- **FR-006**: Admins MUST be able to update the value of any existing setting.
- **FR-007**: Admins MUST be able to delete any existing setting after confirming the action.
- **FR-008**: All settings data MUST be stored in encrypted form within the company record so that it cannot be read or modified by direct database access without the application's encryption key.
- **FR-009**: The system MUST load all company settings into the authenticated user's session upon every successful login.
- **FR-010**: The system MUST load the full company record into session upon login.
- **FR-011**: The system MUST load the authenticated user's profile into session upon login.
- **FR-012**: Only users with the Admin role MUST be permitted to create, update, or delete settings. Attempts by non-Admin users MUST be denied.
- **FR-013**: The value supplied when creating or updating a setting MUST be validated to conform to the declared type (e.g., boolean values must be `"true"` or `"false"`, image values must be a well-formed URL string — either a direct URL pasted by the admin or an S3 URL returned after a file upload).
- **FR-014**: Settings changes MUST take effect for all subsequent logins immediately after the save is confirmed — no restart or cache flush required.

### Key Entities

- **Setting**: A single configurable item for the company. Attributes: name (unique per company), type (boolean | default | report_header | image), value (varies by type), optional description.
- **Company Settings Collection**: The complete ordered set of all Settings belonging to one company. Stored encrypted as part of the company record. Loaded in full at login.

---

## Success Criteria _(mandatory)_

1. Admins can complete any single CRUD operation on a setting (create, read, update, delete) within 3 seconds under normal load.
2. Company settings are present in every authenticated session immediately after login, with no additional user action required — verified by testing that session contains settings data for 100% of successful logins.
3. Settings stored in the database are unreadable without the application's encryption key — verified through direct database inspection showing only ciphertext.
4. All four setting types (boolean, default, report_header, image) can be created, displayed, updated, and deleted end-to-end without error.
5. Duplicate setting names are rejected 100% of the time — no duplicate can be saved under any timing or concurrency condition.
6. Non-Admin users are blocked from modifying settings in 100% of attempts — both via the UI and direct API calls.

---

## Assumptions

- Admin-role users have full control; TEAM_MANAGER and TEAM_MEMBER roles have read-only access to settings via their session (they do not have a settings UI page).
- Image settings store a URL string — either a direct URL pasted by the admin or an S3 URL returned after a file upload. Raw binary is never embedded in the settings JSON.
- The "default" setting type is a catch-all for any text or numeric value that does not fit the other named types.
- No per-setting read permissions are required — all settings are either visible to all session users (via session load) or restricted to Admin for modification.
- Settings do not have audit-trail requirements beyond the existing company audit log infrastructure.

---

## Clarifications

### Session 2026-02-20

- Q: Does the `image` setting type require server-side file upload or just a URL string? → A: Both — admin may paste a direct URL or upload to S3; the stored value is always a URL string.
- Q: How does report generation consume `report_header` settings — and is automated report integration in scope? → A: Reserved names approach — two reserved setting names are defined (`report_company_name` type `report_header`, `report_logo` type `image`); report and invoice renderers look them up by exact name. No dynamic document-title reserved name is defined.
- Q: If `SETTINGS_ENCRYPTION_KEY` is missing or invalid at server startup, what happens? → A: Server fails to start — exits with a clear error identifying the misconfiguration. Running without the key is not permitted.
