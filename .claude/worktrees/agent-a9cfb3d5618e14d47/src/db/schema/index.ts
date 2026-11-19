export * from "./userprofiles.js";

export * from "./session.js";
export * from "./pmSystemConnection.js";
export * from "./companyproject.js";
export * from "./customer.js"; // [SCOPE 119 / T002]
// [SCOPE 017 / T005-T008] External PM connection layer — unblocked by SCOPE-119.
// NOTE: these are DECLARED but the DDL (0060_scope017_connections.sql) is NOT yet
// applied. Declaring ahead of the DDL is safe for NEW tables — nothing selects
// from a table it does not query — but any query against them will fail with
// 42P01 until the migration is applied by hand.
export * from "./externalconnection.js";
export * from "./credentialauditlog.js";
export * from "./synchistory.js";
export * from "./connectionhealth.js";

export * from "./projecttask.js";

export * from "./projecttimeentry.js";

export * from "./projectinvoice.js";

export * from "./projectphase.js";
export * from "./specificationphase.js";
export * from "./projectspecification.js";

export * from "./testPlan.js";
// [SCOPE 111 / T002..T008] Test Suite Lifecycle — items, subjects, cycles, runs,
// results, signoffs, retest marks. Order matters: testplanitems before the
// tables whose foreign keys target it.
export * from "./testplanitems.js";
export * from "./testitemsubjects.js";
export * from "./testcycles.js";
export * from "./testruns.js";
export * from "./testrunresults.js";
export * from "./testsignoffs.js";
export * from "./testretests.js";
export * from "./feedback.js";
export * from "./feedbacksubmissions.js";
export * from "./note.js";
export * from "./company.js";
export * from "./userinvitation.js";
export * from "./companyauditlog.js";
export * from "./projectuser.js";
export * from "./invitationbatch.js";
export * from "./invitationdlq.js";
export * from "./emailverificationtoken.js";
export * from "./passwordresettoken.js";
export * from "./companysubscription.js";
export * from "./signupinvitation.js";
export * from "./subscriptionbillingevent.js";
export * from "./subscriptionbillinghistory.js";
export * from "./projectdocuments.js";
export * from "./taskdependency.js";
export * from "./scopeconversation.js";
export * from "./notification.js";
export * from "./appauditconfiguration.js";
export * from "./wxkanbandocuments.js";
export * from "./complianceaudittasks.js";
export * from "./auditexecutions.js";
export * from "./auditresults.js";
export * from "./auditreportmetadata.js";
export * from "./phasetransitionlog.js";
export * from "./aiproposal.js";
export * from "./wxkanbanhelp.js";
export * from "./systemSettings.js";
export * from "./companyStatus.js";
export * from "./projectkit.js";
export * from "./projectkitfile.js";
// apitoken schema removed per spec 028 Phase 11 (2026-05-23) — mcpapitokens
// (exported below) is the single token store.

export * from "./complianceoverride.js";
export * from "./complianceflag.js";
export * from "./aispecsession.js";
export * from "./taskstateoverride.js";
export * from "./tasksyncrecord.js";
export * from "./teamprojectduty.js";
export * from "./dutyassignment.js";
export * from "./notificationsettings.js";
export * from "./subscriptiondutytype.js";

export * from "./mcpdriftevents.js";
export * from "./mcpupdateadoptions.js";
export * from "./mcpparityconfig.js";

export * from "./projectproposal.js";

export * from "./overviewdrafts.js";
export * from "./overviewtranscripts.js";
export * from "./importcache.js";

export * from "./taskfences.js";
export * from "./taskfencemodifications.js";
export * from "./taskfencehistory.js";
export * from "./taskfenceslegacy.js";

export * from "./mcpapitokens.js";
// [SCOPE 134 / T026] Company-level agent admission tickets. Separate from mcpapitokens
// because they carry no project and cannot reach project data — see the file header.
export * from "./companyagenttoken.js";
// [SCOPE 134 / T027] Per-project agent grants — what bounds a company token's reach.
export * from "./projectagentgrant.js";
// [SCOPE 134 / T004] Project → YappChatt room, per agent (migration 0068).
export * from "./projectroom.js";
export * from "./projectagentconnection.js"; // [SCOPE 151 / T002] applied by hand and verified 2026-10-28
export * from "./agentdevicetoken.js"; // [SCOPE 152 / T003] applied by hand and verified 2026-10-28
export * from "./mcprequestaudit.js";

// Spec 046 — Marketing: Lead Capture & Funnel (campaigns minimal, extended in 048)
export * from "./campaigns.js";
export * from "./marketingleads.js";
// Spec 048 — Marketing: In-App Module (assets + posts/calendar)
export * from "./marketingassets.js";
export * from "./campaignposts.js";
// SCOPE-096 — Marketing Feature Snippets manager (per-feature config sidecar)
export * from "./marketingfeaturesnippets.js";

// SCOPE-070 — Banner Studio (tracked links + AI-composited banners + click events)
export * from "./marketinglinks.js";
export * from "./marketingbanners.js";
export * from "./marketinglinkclicks.js";

// SCOPE-078 — Infrastructure Health Monitor (RDS/App Runner capacity warnings + solutions)
export * from "./infrahealthchecks.js";

// SPEC-057 (SCOPE-047 stack-style) — Company-Wide Stack Profiles
export * from "./companystackprofile.js";

// SCOPE-062 — Project Theme (per-project + company-wide visual theme)
export * from "./projecttheme.js";
export * from "./companythemeprofile.js";

// SCOPE-106 — Borrow-a-Look Business Template (named reusable look+chrome templates)
export * from "./themetemplate.js";

// SCOPE-107 — Block Composer (the Block Library: named reusable block trees)
export * from "./themeblock.js";

// SCOPE-114 (SPEC-115) — Design System Catalog (global curated catalog; NO companyid)
export * from "./designsystem.js";

// Spec 037 — Consultants Management (Engagement Core)
export * from "./engagementinvitation.js";
export * from "./engagement.js";
export * from "./engagementassignment.js";
export * from "./subassignment.js";
export * from "./engagementmodification.js";

// Keep exports limited to schemas actively used by the application.
// No legacy compatibility aliases for unused tables.

// [SCOPE 109 / T001] Customer welcome message (standing record + per-recipient sends)
export * from "./welcomemessages.js";
export * from "./welcomesends.js";

// [SCOPE 117 / T005] Declare the live marketingcontacts table so reconcile-to-declared
// tooling cannot target it. Mirrors the deployed structure; creates nothing.
export * from "./marketingcontact.js";

// [SCOPE 143 / T024] agentruns — applied by hand (agentruns.sql, 0075) and verified 2026-11-02.
export * from "./agentrun.js";
