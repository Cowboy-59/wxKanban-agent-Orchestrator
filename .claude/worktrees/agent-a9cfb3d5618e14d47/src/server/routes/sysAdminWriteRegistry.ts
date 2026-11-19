/**
 * SysAdmin write registry (SPEC-147, FR-002).
 *
 * One entry per SysAdmin route that uses POST / PUT / PATCH / DELETE, keyed
 * "METHOD /full/path" exactly as mounted in app.ts. Consumed by the
 * sysAdminAudit middleware (src/server/middleware/sysAdminAudit.ts), which writes
 * one companyauditlogs row per successful registered write. A route that stores
 * nothing is declared `readOnly` with its reason, so an unlisted route is always
 * a gap rather than a silent decision.
 *
 * Each classification below was taken from the handler (and the service it
 * calls), not from the route name.
 */
import type { SysAdminWriteRegistry } from "../middleware/sysAdminAudit.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { companies } from "~/db/schema/company.js";
import { systemSettings } from "~/db/schema/systemSettings.js";
import { feedbacksubmissions } from "~/db/schema/feedbacksubmissions.js";
import { wxkanbanhelp } from "~/db/schema/wxkanbanhelp.js";
import { signupinvitations } from "~/db/schema/signupinvitation.js";
import { newsletterissues } from "~/db/schema/newsletterissues.js";
import { marketingbanners } from "~/db/schema/marketingbanners.js";
import { marketinglinks } from "~/db/schema/marketinglinks.js";
import { marketingassets } from "~/db/schema/marketingassets.js";
import { marketingleads } from "~/db/schema/marketingleads.js";
import { campaigns } from "~/db/schema/campaigns.js";
import { campaignposts } from "~/db/schema/campaignposts.js";
import { marketingfeaturesnippets } from "~/db/schema/marketingfeaturesnippets.js";

// [SCOPE 147 / T004] BEGIN — sysadmin.ts writes (mounted at /api/sysadmin)
const SA = "/api/sysadmin";

export const SYSADMIN_CORE_WRITES: SysAdminWriteRegistry = {
  // Runs the health sweep, which upserts many infrahealthchecks rows; no single row to diff.
  [`POST ${SA}/infra-health/refresh`]: {
    action: "sysadmin_infrahealth_refreshed",
    kind: "action",
    targetType: "infrahealth",
  },
  [`PATCH ${SA}/companies/:id`]: {
    action: "sysadmin_company_updated",
    kind: "update",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  [`PATCH ${SA}/companies/:id/status`]: {
    action: "sysadmin_company_status_changed",
    kind: "update",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // Emails a Stripe billing-portal link to the company contact; no local row is written,
  // but a customer-facing email on the operator's say-so is recorded against the company.
  [`POST ${SA}/companies/:id/restart-link`]: {
    action: "sysadmin_company_restart_link_sent",
    kind: "action",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // Reconciles companies / companysubscriptions from Stripe and writes status history.
  [`POST ${SA}/companies/:id/resync-subscription`]: {
    action: "sysadmin_company_subscription_resynced",
    kind: "action",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // Stripe cancel_at_period_end AND companies.cancelrequestedat stamped locally.
  [`POST ${SA}/companies/:id/cancel-subscription`]: {
    action: "sysadmin_company_subscription_cancelled",
    kind: "action",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // Stripe un-cancel AND companies.cancelrequestedat cleared locally.
  [`POST ${SA}/companies/:id/resume-subscription`]: {
    action: "sysadmin_company_subscription_resumed",
    kind: "action",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // Bulk reconcile from Stripe; the body's dryRun flag (recorded) says whether it wrote.
  [`POST ${SA}/subscriptions/resync`]: {
    action: "sysadmin_subscriptions_resynced",
    kind: "action",
    targetType: "subscription",
  },
  // Purges the in-memory kit archive cache only; nothing is persisted, but it changes what
  // every consumer is served, so it is recorded rather than declared readOnly.
  [`POST ${SA}/kit/reset-cache`]: {
    action: "sysadmin_kit_cache_reset",
    kind: "action",
    targetType: "kit",
  },
  [`PATCH ${SA}/users/:id/status`]: {
    action: "sysadmin_user_status_changed",
    kind: "update",
    targetType: "user",
    lookup: { table: userprofiles, column: userprofiles.id, nameColumn: "emailaddr" },
  },
  [`PATCH ${SA}/users/:id/usertype`]: {
    action: "sysadmin_user_usertype_changed",
    kind: "update",
    targetType: "user",
    lookup: { table: userprofiles, column: userprofiles.id, nameColumn: "emailaddr" },
  },
  // Currently a stub (TODO in the handler): it generates a temp password and writes nothing.
  // Recorded anyway: a password reset is a security action and the attempt must be traceable.
  [`POST ${SA}/users/:id/reset-password`]: {
    action: "sysadmin_user_password_reset",
    kind: "action",
    targetType: "user",
    lookup: { table: userprofiles, column: userprofiles.id, nameColumn: "emailaddr" },
  },
  // Inserts a userprofiles row; the response is { success, message, user } (no `data`).
  [`POST ${SA}/users/create`]: {
    action: "sysadmin_user_created",
    kind: "create",
    targetType: "user",
  },
  // Response is the created company itself ({ id, name, ... }).
  [`POST ${SA}/companies`]: {
    action: "sysadmin_company_created",
    kind: "create",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // Soft delete (activeflag=false, CANCELLED) with a retention window after which the data
  // goes; kind "delete" keeps the full row as it stood before.
  [`DELETE ${SA}/companies/:id`]: {
    action: "sysadmin_company_deleted",
    kind: "delete",
    targetType: "company",
    lookup: { table: companies, column: companies.id, nameColumn: "name" },
  },
  // The user id and target company arrive in the body (recorded), not as a route param.
  [`POST ${SA}/users/transfer`]: {
    action: "sysadmin_user_transferred",
    kind: "action",
    targetType: "user",
  },
  // Updates the systemsettings row, or inserts it when the key is new.
  [`PUT ${SA}/settings/:key`]: {
    action: "sysadmin_setting_changed",
    kind: "update",
    targetType: "setting",
    lookup: { table: systemSettings, column: systemSettings.key, param: "key", nameColumn: "key" },
  },
  [`PATCH ${SA}/feedback/:id/status`]: {
    action: "sysadmin_feedback_status_changed",
    kind: "update",
    targetType: "feedback",
    lookup: { table: feedbacksubmissions, column: feedbacksubmissions.id, nameColumn: "title" },
  },
  // Appends to feedbacksubmissions internal notes.
  [`POST ${SA}/feedback/:id/note`]: {
    action: "sysadmin_feedback_note_added",
    kind: "update",
    targetType: "feedback",
    lookup: { table: feedbacksubmissions, column: feedbacksubmissions.id, nameColumn: "title" },
  },
  // Sends the clarifying question to the submitter and updates the row.
  [`POST ${SA}/feedback/:id/clarify`]: {
    action: "sysadmin_feedback_clarification_sent",
    kind: "action",
    targetType: "feedback",
    lookup: { table: feedbacksubmissions, column: feedbacksubmissions.id, nameColumn: "title" },
  },
  // Re-sends the notification (inserts a notifications row, updates notifystatus).
  [`POST ${SA}/feedback/:id/retry-notification`]: {
    action: "sysadmin_feedback_notification_retried",
    kind: "action",
    targetType: "feedback",
    lookup: { table: feedbacksubmissions, column: feedbacksubmissions.id, nameColumn: "title" },
  },
  [`POST ${SA}/feedback/dismiss`]: {
    action: "sysadmin_feedback_dismissed",
    kind: "bulk",
    targetType: "feedback",
    idsField: "ids",
  },
  [`POST ${SA}/feedback/undismiss`]: {
    action: "sysadmin_feedback_undismissed",
    kind: "bulk",
    targetType: "feedback",
    idsField: "ids",
  },
  // Hard delete of the selected feedbacksubmissions rows.
  [`POST ${SA}/feedback/purge`]: {
    action: "sysadmin_feedback_purged",
    kind: "bulk",
    targetType: "feedback",
    idsField: "ids",
  },
  [`PATCH ${SA}/feedback/:id/disposition`]: {
    action: "sysadmin_feedback_disposition_changed",
    kind: "update",
    targetType: "feedback",
    lookup: { table: feedbacksubmissions, column: feedbacksubmissions.id, nameColumn: "title" },
  },
  // Writes disposition=scope and the scope seed onto the feedback row.
  [`POST ${SA}/feedback/:id/accept-to-scope`]: {
    action: "sysadmin_feedback_accepted_to_scope",
    kind: "update",
    targetType: "feedback",
    lookup: { table: feedbacksubmissions, column: feedbacksubmissions.id, nameColumn: "title" },
  },
  // Inserts a wxkanbanhelp row (category docs); the response is { doc }.
  [`POST ${SA}/docs`]: {
    action: "sysadmin_doc_created",
    kind: "create",
    targetType: "doc",
    lookup: { table: wxkanbanhelp, column: wxkanbanhelp.id, nameColumn: "title" },
  },
  [`PUT ${SA}/docs/:id`]: {
    action: "sysadmin_doc_updated",
    kind: "update",
    targetType: "doc",
    lookup: { table: wxkanbanhelp, column: wxkanbanhelp.id, nameColumn: "title" },
  },
  // Hard delete.
  [`DELETE ${SA}/docs/:id`]: {
    action: "sysadmin_doc_deleted",
    kind: "delete",
    targetType: "doc",
    lookup: { table: wxkanbanhelp, column: wxkanbanhelp.id, nameColumn: "title" },
  },
  [`POST ${SA}/signup-invitations/translate`]: {
    readOnly: "Machine-translates the admin's message and returns it for review; stores nothing.",
  },
  // Inserts a signupinvitations row. Deliberately "action", not "create": a create entry
  // records the response body, which carries the one-time rawToken and a registerLink that
  // embeds it. "action" records the request (email, plan, promo days) instead.
  [`POST ${SA}/signup-invitations`]: {
    action: "sysadmin_invitation_created",
    kind: "action",
    targetType: "invitation",
  },
  [`POST ${SA}/signup-invitations/preview`]: {
    readOnly: "Renders the invitation email for preview without sending it; stores nothing.",
  },
  // Sends the invitation email; no row changes. NOTE: the request body carries `rawToken`,
  // which REDACTED_KEYS does not cover ("rawtoken" != "token") — see the T004 report.
  [`POST ${SA}/signup-invitations/send`]: {
    action: "sysadmin_invitation_sent",
    kind: "action",
    targetType: "invitation",
  },
  // Revokes: sets status 'revoked' on a row that remains, so the change is diffed.
  [`DELETE ${SA}/signup-invitations/:id`]: {
    action: "sysadmin_invitation_revoked",
    kind: "update",
    targetType: "invitation",
    lookup: { table: signupinvitations, column: signupinvitations.id, nameColumn: "email" },
  },
};
// [SCOPE 147 / T004] END

// [SCOPE 147 / T005] BEGIN — marketing router writes (mounted under /api/sysadmin/marketing)
const MK = "/api/sysadmin/marketing";
const NL = `${MK}/newsletter`;
const WM = `${MK}/welcome`;
const AI = `${MK}/ai`;
const BN = `${MK}/banners`;
const LK = `${MK}/links`;
const BIO = `${MK}/bio`;
const FS = `${MK}/feature-snippets`;

const AI_DRAFT_ONLY = "AI generation that returns draft text for review; stores nothing (FR-013).";

export const SYSADMIN_MARKETING_WRITES: SysAdminWriteRegistry = {
  // newsletter.ts
  // Inserts a draft newsletterissues row; the response is { issue }.
  [`POST ${NL}/issues`]: {
    action: "sysadmin_newsletter_issue_created",
    kind: "create",
    targetType: "newsletter",
    lookup: { table: newsletterissues, column: newsletterissues.id, nameColumn: "subject" },
  },
  [`PATCH ${NL}/issues/:id`]: {
    action: "sysadmin_newsletter_issue_updated",
    kind: "update",
    targetType: "newsletter",
    lookup: { table: newsletterissues, column: newsletterissues.id, nameColumn: "subject" },
  },
  [`POST ${NL}/test`]: {
    readOnly: "Sends one [TEST] review copy to the fixed review inbox; persists no state.",
  },
  // Claims draft -> sending, then the background job sends to the whole audience.
  [`POST ${NL}/issues/:id/send`]: {
    action: "sysadmin_newsletter_issue_sent",
    kind: "action",
    targetType: "newsletter",
    lookup: { table: newsletterissues, column: newsletterissues.id, nameColumn: "subject" },
  },
  // Moves a sent/failed issue back to draft and zeroes its roll-up counts.
  [`POST ${NL}/issues/:id/revert`]: {
    action: "sysadmin_newsletter_issue_reverted",
    kind: "action",
    targetType: "newsletter",
    lookup: { table: newsletterissues, column: newsletterissues.id, nameColumn: "subject" },
  },

  // welcome.ts — a single standing welcomemessages row with no route param to look it up
  // by, so these record the request (body) rather than a before/after diff.
  [`PATCH ${WM}`]: {
    action: "sysadmin_welcome_message_updated",
    kind: "action",
    targetType: "welcome",
  },
  [`POST ${WM}/publish`]: {
    action: "sysadmin_welcome_message_published",
    kind: "action",
    targetType: "welcome",
  },
  // getWelcomeMessage() may lazily seed the singleton row on a first-ever call; nothing else.
  [`POST ${WM}/test`]: {
    readOnly: "Sends the welcome message to the review inbox; no capacity spent, no record kept (FR-003).",
  },
  // Starts the background catch-up run that sends to every eligible user (welcomesends rows).
  [`POST ${WM}/backfill`]: {
    action: "sysadmin_welcome_backfill_started",
    kind: "action",
    targetType: "welcome",
  },
  // `ids` is optional (absent = retry every failed send), so "action" records the body as
  // sent instead of a bulk entry that would report count 0 for a retry-all.
  [`POST ${WM}/retry`]: {
    action: "sysadmin_welcome_sends_retried",
    kind: "action",
    targetType: "welcome",
  },

  // marketingAi.ts — every route returns a draft; only the in-memory throttle changes.
  [`POST ${AI}/newsletter/draft`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/newsletter/improve`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/newsletter/variants`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/social`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/seo/generate`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/seo/audit`]: {
    readOnly: "Fetches a windev.wxperts.com page (or takes HTML) and returns an AI SEO audit; stores nothing.",
  },
  [`POST ${AI}/translate`]: { readOnly: "AI translation returned for review; stores nothing." },
  [`POST ${AI}/repurpose`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/overview/analyze`]: {
    readOnly: "Reads the marketing overview and returns an AI analysis; stores nothing.",
  },
  [`POST ${AI}/campaign/goal`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/post/content`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/layout`]: { readOnly: AI_DRAFT_ONLY },
  [`POST ${AI}/bio`]: {
    readOnly: "Returns a revised bio draft; never writes marketingassets (applied client-side on Accept).",
  },

  // marketingBanners.ts
  // Inserts a marketingbanners row plus its tracked marketinglinks row; response { banner, link }.
  [`POST ${BN}`]: {
    action: "sysadmin_banner_created",
    kind: "create",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  // Also updates the banner's tracked link when the destination changes.
  [`PATCH ${BN}/:id`]: {
    action: "sysadmin_banner_updated",
    kind: "update",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  [`DELETE ${BN}/:id`]: {
    action: "sysadmin_banner_deleted",
    kind: "delete",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  // AI image generation stored to S3 and written onto the banner row.
  [`POST ${BN}/:id/generate-bg`]: {
    action: "sysadmin_banner_background_generated",
    kind: "action",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  // Renders the banner image to S3 and records it on the row.
  [`POST ${BN}/:id/render`]: {
    action: "sysadmin_banner_rendered",
    kind: "action",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  // AI edit of the current background, stored as a new version on the row.
  [`POST ${BN}/:id/edit-bg`]: {
    action: "sysadmin_banner_background_edited",
    kind: "action",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  [`POST ${BN}/:id/background/select`]: {
    action: "sysadmin_banner_background_selected",
    kind: "update",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },
  [`POST ${BN}/:id/background/upload-url`]: {
    readOnly: "Presigns an S3 PUT for a custom background; writes no row (upload-complete records it).",
  },
  [`POST ${BN}/:id/background/upload-complete`]: {
    action: "sysadmin_banner_background_uploaded",
    kind: "update",
    targetType: "banner",
    lookup: { table: marketingbanners, column: marketingbanners.id, nameColumn: "title" },
  },

  // marketingLinks.ts — marketinglinks has no human-readable name column.
  // Response is { link }.
  [`POST ${LK}`]: {
    action: "sysadmin_marketing_link_created",
    kind: "create",
    targetType: "marketinglink",
  },
  [`PATCH ${LK}/:id`]: {
    action: "sysadmin_marketing_link_updated",
    kind: "update",
    targetType: "marketinglink",
    lookup: { table: marketinglinks, column: marketinglinks.id },
  },
  // Archives (status='archived'); the row remains, so the change is diffed.
  [`DELETE ${LK}/:id`]: {
    action: "sysadmin_marketing_link_archived",
    kind: "update",
    targetType: "marketinglink",
    lookup: { table: marketinglinks, column: marketinglinks.id },
  },

  // bioAdmin.ts
  [`POST ${BIO}/photo/upload-url`]: {
    readOnly: "Presigns an S3 PUT for the founder portrait; writes no row (PATCH /photo records it).",
  },
  // Sets fileurl on every bio-assetkey marketingassets row; no route param, body recorded.
  [`PATCH ${BIO}/photo`]: {
    action: "sysadmin_bio_photo_updated",
    kind: "action",
    targetType: "bio",
  },
  // LLM fan-out that upserts the five non-English bio marketingassets rows.
  [`POST ${BIO}/translate`]: {
    action: "sysadmin_bio_translated",
    kind: "action",
    targetType: "bio",
  },
  // Updates/inserts the translation-provider systemsettings row (key is fixed in code, not
  // a route param), so the body ({ provider }) is recorded.
  [`PUT ${BIO}/provider`]: {
    action: "sysadmin_bio_provider_changed",
    kind: "action",
    targetType: "setting",
  },

  // marketingFeatureSnippets.ts (adminRouter) — mounted at /api/sysadmin/marketing/feature-snippets.
  // Not in the T004/T005 brief's 84-route list; found by the re-count.
  // Updates the sidecar row and/or toggles the en-US synopsis marketingassets status (`on`,
  // recorded from the body — the lookup diffs the sidecar only).
  [`PATCH ${FS}/:assetkey`]: {
    action: "sysadmin_feature_snippet_updated",
    kind: "action",
    targetType: "featuresnippet",
    lookup: {
      table: marketingfeaturesnippets,
      column: marketingfeaturesnippets.assetkey,
      param: "assetkey",
      nameColumn: "assetkey",
    },
  },
  // Edits one locale's synopsis copy in marketingassets (locale in the body, recorded).
  [`POST ${FS}/:assetkey`]: {
    action: "sysadmin_feature_snippet_copy_edited",
    kind: "action",
    targetType: "featuresnippet",
    lookup: {
      table: marketingfeaturesnippets,
      column: marketingfeaturesnippets.assetkey,
      param: "assetkey",
      nameColumn: "assetkey",
    },
  },
  // AI-drafts a snippet and upserts the marketingassets + sidecar rows; response carries assetkey.
  [`POST ${FS}/from-scope`]: {
    action: "sysadmin_feature_snippet_created",
    kind: "create",
    targetType: "featuresnippet",
    lookup: {
      table: marketingfeaturesnippets,
      column: marketingfeaturesnippets.assetkey,
      param: "assetkey",
      nameColumn: "assetkey",
    },
  },

  // marketingAdmin.ts
  [`PATCH ${MK}/leads/:id/status`]: {
    action: "sysadmin_marketing_lead_status_changed",
    kind: "update",
    targetType: "lead",
    lookup: { table: marketingleads, column: marketingleads.id, nameColumn: "email" },
  },
  // Appends a timestamped line to marketingleads.notes.
  [`POST ${MK}/leads/:id/note`]: {
    action: "sysadmin_marketing_lead_note_added",
    kind: "update",
    targetType: "lead",
    lookup: { table: marketingleads, column: marketingleads.id, nameColumn: "email" },
  },
  // Response is { campaign }.
  [`POST ${MK}/campaigns`]: {
    action: "sysadmin_campaign_created",
    kind: "create",
    targetType: "campaign",
    lookup: { table: campaigns, column: campaigns.id, nameColumn: "name" },
  },
  [`PATCH ${MK}/campaigns/:id`]: {
    action: "sysadmin_campaign_updated",
    kind: "update",
    targetType: "campaign",
    lookup: { table: campaigns, column: campaigns.id, nameColumn: "name" },
  },
  // Response is { asset }.
  [`POST ${MK}/assets`]: {
    action: "sysadmin_marketing_asset_created",
    kind: "create",
    targetType: "asset",
    lookup: { table: marketingassets, column: marketingassets.id, nameColumn: "title" },
  },
  // AI-generates FAQs and inserts each as a draft marketingassets row; the response
  // ({ created, assets }) is what a create entry records, so the new rows are captured.
  [`POST ${MK}/assets/faq/generate`]: {
    action: "sysadmin_marketing_faq_generated",
    kind: "create",
    targetType: "asset",
  },
  [`PATCH ${MK}/assets/:id`]: {
    action: "sysadmin_marketing_asset_updated",
    kind: "update",
    targetType: "asset",
    lookup: { table: marketingassets, column: marketingassets.id, nameColumn: "title" },
  },
  // Hard delete.
  [`DELETE ${MK}/assets/:id`]: {
    action: "sysadmin_marketing_asset_deleted",
    kind: "delete",
    targetType: "asset",
    lookup: { table: marketingassets, column: marketingassets.id, nameColumn: "title" },
  },
  [`POST ${MK}/assets/:id/upload-url`]: {
    readOnly: "Presigns an S3 PUT for an asset file; writes no row (the client PATCHes fileurl after).",
  },
  // Response is { post }; campaignposts has no human-readable name column.
  [`POST ${MK}/posts`]: {
    action: "sysadmin_campaign_post_created",
    kind: "create",
    targetType: "post",
  },
  // Stamps publishedat when status flips to published.
  [`PATCH ${MK}/posts/:id`]: {
    action: "sysadmin_campaign_post_updated",
    kind: "update",
    targetType: "post",
    lookup: { table: campaignposts, column: campaignposts.id },
  },
};
// [SCOPE 147 / T005] END

// [SCOPE 147 / T004] BEGIN — the full SysAdmin write registry consumed by sysAdminAudit()
export const SYSADMIN_WRITE_REGISTRY: SysAdminWriteRegistry = Object.freeze({
  ...SYSADMIN_CORE_WRITES,
  ...SYSADMIN_MARKETING_WRITES,
});
// [SCOPE 147 / T004] END
