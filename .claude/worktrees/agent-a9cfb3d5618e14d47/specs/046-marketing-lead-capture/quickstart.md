# Quickstart: Marketing — Lead Capture & Funnel

**Spec**: 046 | **Created**: 2026-06-08

Integration scenarios that demonstrate the launch-critical funnel end-to-end.

---

## Scenario 1 — Capture a WinDev signup

1. From an allowlisted site origin (windev.wxperts.com), `POST /api/marketing/leads` with `{ email, name?, sourceproperty: "windev", campaign: "<july5>", locale: "en-US" }`.
2. **Expect:** 200 with a locale-keyed confirmation + reference id within 3s; a `marketingleads` row with `segment="windev"`, `status="new"`, `notifystatus` reconciled; an in-app inbox entry + email to the wxperts recipient.

## Scenario 2 — Capture a broad/educational signup (wxperts.com)

1. `POST /api/marketing/leads` with `{ email, sourceproperty: "wxperts", locale: "en-US" }` (no campaign).
2. **Expect:** lead persists with `segment="careerchanger"` (Phase-1 default for the wxperts property); confirmation returned.

## Scenario 3 — Bad input + abuse

1. POST with an invalid email → **400**, locale-keyed error, nothing persisted.
2. POST with the honeypot field filled → rejected, nothing persisted.
3. POST from a non-allowlisted origin → rejected (CORS).
4. Burst beyond the per-IP limit → rate-limited; a legitimate request under the limit still succeeds.

## Scenario 4 — Work the funnel (SysAdmin)

1. As an admin, open SysAdmin → **Marketing** → leads pipeline.
2. Filter by `segment="windev"`; open the Scenario-1 lead.
3. Transition `new → contacted → qualified`; add a note.
4. On a second lead, transition to `declined` **without** a reason → rejected; supply a `declinedreason` → succeeds.
5. **Expect:** all transitions + the note persist and show on refresh; filters slice by segment/source/campaign.

## Scenario 5 — i18n fallback

1. `POST /api/marketing/leads` with `locale: "fr-FR"` before French strings exist.
2. **Expect:** request succeeds; confirmation served in **en-US** (fallback), `locale="fr-FR"` recorded on the lead; no error.

## Scenario 6 — Notification resilience

1. With the email service forced to fail, submit a valid lead.
2. **Expect:** lead still persists, response still returns success, `notifystatus="failed"` recorded, lead is not lost or rolled back.
