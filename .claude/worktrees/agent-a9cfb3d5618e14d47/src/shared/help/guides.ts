// [SCOPE 084 / T006] BEGIN — Per-feature "how to use it / what to do" guides
//
// Keyed by HelpFeature.id. The in-app feature detail page (/help/:id) renders
// these as numbered steps. Kept separate from catalog.ts so the step content is
// easy to edit without touching the availability model. A feature with no entry
// falls back to its one-line `howTo`.

export const HELP_GUIDES: Record<string, string[]> = {
  dashboard: [
    "Open Dashboard from the left sidebar.",
    "Each project card shows its current lifecycle phase and a progress bar.",
    "Use the document links on a card — Overview, Lifecycle, Audit — to open the generated reports.",
    "ADMINs: click New to create a project inline.",
  ],
  projects: [
    "Create a project from the Dashboard New button or the Projects nav.",
    "Open a project to see its tabs: overview, lifecycle, and tasks.",
    "Projects are unlimited on every paid plan — organize work into as many as you need.",
  ],
  tasks: [
    "Open My Tasks from the nav.",
    "Cards are grouped into status columns; drag a card to change its status.",
    "Click a card to open its detail, comments, and the spec/task it links to.",
  ],
  settings: [
    "Open Settings from the nav.",
    "Update your profile and preferences; switch language with the language selector.",
    "Company ADMINs manage company-wide settings from here.",
  ],
  faq: [
    "Open FAQ from the nav.",
    "Browse or search common questions.",
    "Follow the linked docs for deeper guidance.",
  ],
  lifecycle: [
    "Install the wxKanban kit and the Dev Cockpit in VS Code.",
    "Run /buildscope to define a scope, then /createSpecs to generate the spec, plan, and tasks.",
    "Run /implement to build tasks, then advance the phases (QA → Human Testing → Beta → Release) as each gate passes.",
    "The Cockpit shows which command is available at the current phase.",
  ],
  specs: [
    "Author a scope with /buildscope — it interviews you section by section.",
    "Generate the spec, plan, and tasks with /createSpecs.",
    "Track progress in the Dev Cockpit; each task links back to its spec.",
  ],
  audit: [
    "Open the Audit Report link on a project card, or regenerate it from the Admin dashboard.",
    "Review what was built, tested, and code-fenced for the release.",
    "Keep it as your compliance and traceability record.",
  ],
  cockpit: [
    "Install the “wxKanban Dev Cockpit” VS Code extension (from the VSIX).",
    "Open the wxKanban icon in the activity bar.",
    "Your active scope is pinned and incomplete tasks are listed live as you build.",
  ],
  pmIntegrations: [
    "Open PM Integrations from the nav.",
    "Connect a provider — Jira, Monday.com, Asana, or Trello — via OAuth.",
    "Tasks sync on a background schedule; conflicts resolve last-write-wins (wxKanban wins).",
    "Single User and Small Business get one connection; Consultant and up get multiple.",
  ],
  team: [
    "Open Team from the nav (Small Business plan or higher).",
    "Invite a teammate by email and assign their role.",
    "Manage access and remove members as needed.",
    "Seat limits: 5 (Small Business), unlimited (Consultant), 25+ (Enterprise).",
  ],
  timeTracking: [
    "On the Consultant plan or higher, open a task and start the timer.",
    "Mark entries billable so they flow into invoicing.",
    "Review and edit time entries; the timer prompts you if it runs past 8 hours.",
  ],
  invoices: [
    "On the Consultant plan or higher, open Invoices from the nav.",
    "Pick a project and a date range of billable time.",
    "Generate the PDF; invoiced entries are marked to prevent duplicate billing.",
  ],
  reports: [
    "On the Consultant plan or higher, open Reports from the nav.",
    "Choose a report and its filters (time, project, outcomes).",
    "Review or export the results.",
  ],
  workHub: [
    "On the Consultant plan or higher, open Work Hub from the nav.",
    "See your client engagements and their status.",
    "Open an engagement to manage its work and billing.",
  ],
  clientPortal: [
    "On the Consultant plan or higher, enable the portal for a project.",
    "Share the client link; clients get a scoped, read-only view.",
  ],
  customWorkflows: [
    "On the Consultant plan or higher, open project settings.",
    "Configure workflow stages to match your team's process.",
  ],
  apiAccess: [
    "On the Consultant plan or higher, open Settings and create an API token.",
    "Call the documented endpoints with the token as a Bearer header.",
    "Revoke any tokens you no longer need.",
  ],
  stackProfiles: [
    "As an ADMIN, open Stack Profiles from the admin nav.",
    "Define or edit a target stack and style — it's applied when a project is created.",
  ],
  themeProfiles: [
    "As an ADMIN, open Theme Profiles from the admin nav.",
    "Define or edit a look-and-feel theme for generated output.",
  ],
  encryption: [
    "Nothing to do — secrets are encrypted at rest with AES-256-GCM automatically.",
  ],
  soc2: [
    "On the Small Business plan or higher, add your company's SDLC documents for compliance analysis.",
    "Assign controls to team members.",
    "Use the AI compliance checks to confirm you meet audit requirements.",
  ],
  sso: [
    "On Enterprise, contact your wxKanban representative to configure your identity provider.",
    "Once set up, your team signs in through SSO.",
  ],
  advancedSecurity: [
    "Configured during Enterprise onboarding — there's no self-serve setup.",
  ],
  emailSupport: [
    "Email admin@wxperts.com with your question.",
    "Include your account or company name for faster help.",
  ],
  dedicatedSupport: [
    "On Enterprise, your dedicated contact is assigned during onboarding — reach out to them directly.",
  ],
  customIntegrations: [
    "On Enterprise, scope the integration with your wxKanban representative.",
  ],
  sla: [
    "On Enterprise, your uptime and response-time SLA is part of your agreement — see your contract.",
  ],
};
// [SCOPE 084 / T006] END
