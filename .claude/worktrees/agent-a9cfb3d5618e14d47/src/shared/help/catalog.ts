// [SCOPE 084 / T001] BEGIN — Subscription-aware Help catalog (single source of truth)
//
// The authoritative, code-side catalog of every documented app area/feature and
// its availability across the four PUBLIC plans. Shared by the server Help
// generator + API, the in-app Help page, and the standalone help.html build.
//
// Authoritative mapping decision (SCOPE-084): Small/Medium Business is the
// baseline, and Time Tracking & Billing / Invoices / Reports are Consultant+
// (explicitly NOT in Single User or Small Business). Where this disagrees with
// TierEnforcementService feature flags, THIS file is the customer-facing source
// of record; the code-flag divergence is a separate reconciliation bug (T002).

/** The four public plans, lowest → highest. Internal FREE tier is not shown. */
export type PlanId = "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

export interface Plan {
  id: PlanId;
  /** Order rank, 1 (lowest) … 4 (highest). */
  order: number;
  label: string;
  price: string;
  userLimit: string;
  tagline: string;
}

/** A documented app area/feature. `minPlan` is the lowest plan that includes it. */
export interface HelpFeature {
  id: string;
  category: string;
  title: string;
  /** What it does. */
  description: string;
  /** How to use it. */
  howTo: string;
  minPlan: PlanId;
  /** Optional per-plan qualifier text (e.g. "One connection" vs "Multiple"). */
  planNotes?: Partial<Record<PlanId, string>>;
  /** True when the feature is limited to company ADMINs (role gate, not tier). */
  adminOnly?: boolean;
}

export type Availability = "included" | "not_included" | "upgrade_required";

export interface FeatureAvailability {
  status: Availability;
  /** Set when status is upgrade_required: the plan that unlocks the feature. */
  unlockingPlan?: PlanId;
  /** Per-plan qualifier text when present. */
  note?: string;
}
// [SCOPE 084 / T001] END

// [SCOPE 084 / T001] BEGIN — PLANS (four public plans, ordered)
export const PLANS: Plan[] = [
  { id: "SINGLE_USER", order: 1, label: "Single User", price: "$19.95/mo", userLimit: "1 user", tagline: "Solo, entry-level" },
  { id: "SMALL_BUSINESS", order: 2, label: "Small/Medium Business", price: "$29.95/mo", userLimit: "Up to 5 users", tagline: "Small teams, compliance-ready" },
  { id: "CONSULTANT", order: 3, label: "Consultant", price: "$39.95/mo", userLimit: "Unlimited team", tagline: "Billable client work" },
  { id: "ENTERPRISE", order: 4, label: "Enterprise", price: "$59.95/mo", userLimit: "25+ users", tagline: "Scale, security, SLA" },
];

/** Ordered category groupings for rendering. */
export const CATEGORIES: string[] = [
  "Core workspace",
  "Development lifecycle",
  "Integrations",
  "Team & collaboration",
  "Time, billing & consulting",
  "Admin & configuration",
  "Security & compliance",
  "Enterprise & support",
];
// [SCOPE 084 / T001] END

// [SCOPE 084 / T001] BEGIN — HELP_FEATURES catalog
export const HELP_FEATURES: HelpFeature[] = [
  // ---- Core workspace (every paid plan) ----
  {
    id: "dashboard",
    category: "Core workspace",
    title: "Dashboard",
    description: "Your project overview — lifecycle-phase progress per project plus quick links to each project's generated documents.",
    howTo: "Open Dashboard from the sidebar. Each project card shows its phase progress and document links; ADMINs get a New button to create a project inline.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "projects",
    category: "Core workspace",
    title: "Projects",
    description: "Create and manage projects. Unlimited projects on every paid plan.",
    howTo: "Create a project from the dashboard New button or the Projects nav, then open it to see its tabs (overview, lifecycle, tasks).",
    minPlan: "SINGLE_USER",
  },
  {
    id: "tasks",
    category: "Core workspace",
    title: "My Tasks (Kanban)",
    description: "Your assigned work on a Kanban board across projects.",
    howTo: "Open My Tasks; drag cards between columns to change status, or open a card for detail.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "settings",
    category: "Core workspace",
    title: "Settings",
    description: "Account, company, and preference settings, including language.",
    howTo: "Open Settings from the nav; the language switcher and profile live here.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "faq",
    category: "Core workspace",
    title: "FAQ",
    description: "Answers to common questions about using wxKanban.",
    howTo: "Open FAQ from the nav.",
    minPlan: "SINGLE_USER",
  },

  // ---- Development lifecycle (every paid plan) ----
  {
    id: "lifecycle",
    category: "Development lifecycle",
    title: "6-Phase Lifecycle & Orchestrator",
    description: "The Design → Implementation → QA → Human Testing → Beta → Release methodology that gates every feature and keeps a single source of truth for where a project stands.",
    howTo: "Drive it from Claude Code + the wxKanban kit in VS Code (buildscope → createSpecs → implement). The right command is available only at the right phase.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "specs",
    category: "Development lifecycle",
    title: "Specs & Scopes",
    description: "Scope-of-project documents and the generated specs, plans, and tasks for each feature.",
    howTo: "Author a scope with buildscope; generate the spec/plan/tasks with createSpecs; track them in the Cockpit.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "audit",
    category: "Development lifecycle",
    title: "Audit Reports",
    description: "A per-release audit trail of what was built, tested, and code-fenced.",
    howTo: "Open the Audit Report link on a project card, or regenerate it from the Admin dashboard.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "cockpit",
    category: "Development lifecycle",
    title: "Dev Cockpit",
    description: "A VS Code sidebar showing remaining work per scope, live as work is built.",
    howTo: "Install the Dev Cockpit extension; it pins your active scope and lists incomplete tasks.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "test-suite",
    category: "Development lifecycle",
    title: "Test Suite",
    description: "Automated tests run by AI in the QA phase, then user tests you sign off yourself once the version reaches UAT. A version cannot be released until both are clear.",
    howTo: "Open a project and choose the QA phase to run automated gates and watch progress live; the Human Testing phase holds your own tests, which unlock once the automated run passes.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "feedback",
    category: "Development lifecycle",
    title: "Feedback & bug reports",
    description: "Report a problem or request a change from inside the product, then follow what happened to it. A failed user test files a bug report for you automatically.",
    howTo: "Submit feedback from the product, then open My Feedback to see status, triage notes, and replies for the project you are working in.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "autopilot",
    category: "Development lifecycle",
    title: "Project Agent Autopilot",
    description: "An unattended mode where your connected Project Agent works through a scope's startup list on its own, following the devplan, until it needs a decision or input from you. Turn the Autopilot switch on or off at any time; you can also skip a unit in the startup list.",
    howTo: "Flip the Autopilot switch on for the project. The agent works through the startup list in order and skips any unit you ask it to skip. It posts a status heartbeat about every 15 minutes so you can see it is still running. Autopilot never pushes to git or deploys on its own: a person must still review the work and push it.",
    minPlan: "SINGLE_USER",
  },

  // ---- Integrations ----
  {
    id: "pmIntegrations",
    category: "Integrations",
    title: "PM Integrations",
    description: "Connect Jira, Monday.com, Asana, and Trello and sync tasks two-way.",
    howTo: "Open PM Integrations and connect via OAuth; syncing runs on a background schedule.",
    minPlan: "SINGLE_USER",
    planNotes: {
      SINGLE_USER: "One PM connection",
      SMALL_BUSINESS: "One PM connection",
      CONSULTANT: "Multiple PM connections",
      ENTERPRISE: "Multiple + custom integrations",
    },
  },

  // ---- Team & collaboration (Small Business and up) ----
  {
    id: "team",
    category: "Team & collaboration",
    title: "Team Management",
    description: "Invite teammates, assign roles, and manage access with role-based controls.",
    howTo: "Open Team; invite by email and set each member's role.",
    minPlan: "SMALL_BUSINESS",
    planNotes: {
      SMALL_BUSINESS: "Up to 5 users",
      CONSULTANT: "Unlimited team",
      ENTERPRISE: "25+ users",
    },
  },

  // ---- Time, billing & consulting (Consultant and up) ----
  {
    id: "timeTracking",
    category: "Time, billing & consulting",
    title: "Time Tracking & Billing",
    description: "Built-in timer with billable-hours tracking and time entries.",
    howTo: "Start the timer on a task; mark entries billable for invoicing.",
    minPlan: "CONSULTANT",
  },
  {
    id: "invoices",
    category: "Time, billing & consulting",
    title: "Invoices",
    description: "Generate PDF invoices from billable time entries.",
    howTo: "Open Invoices, pick a project and date range, and generate; invoiced entries are marked to prevent duplicates.",
    minPlan: "CONSULTANT",
  },
  {
    id: "reports",
    category: "Time, billing & consulting",
    title: "Reports",
    description: "Advanced reporting across time, projects, and outcomes.",
    howTo: "Open Reports from the nav.",
    minPlan: "CONSULTANT",
  },
  {
    id: "workHub",
    category: "Time, billing & consulting",
    title: "Work Hub",
    description: "A consultant engagement hub for managing client work.",
    howTo: "Open Work Hub to see and manage your engagements.",
    minPlan: "CONSULTANT",
  },
  {
    id: "clientPortal",
    category: "Time, billing & consulting",
    title: "Client Portal",
    description: "Give clients a scoped, read-only view of their project.",
    howTo: "Enable the portal for a project and share the client link.",
    minPlan: "CONSULTANT",
  },
  {
    id: "customWorkflows",
    category: "Time, billing & consulting",
    title: "Custom Workflows",
    description: "Tailor lifecycle workflows to your team's process.",
    howTo: "Configure custom workflows in project settings.",
    minPlan: "CONSULTANT",
  },
  {
    id: "apiAccess",
    category: "Time, billing & consulting",
    title: "API Access",
    description: "Programmatic access to your wxKanban data via API.",
    howTo: "Create an API token in Settings and call the documented endpoints.",
    minPlan: "CONSULTANT",
  },

  // ---- Admin & configuration (ADMIN role; available on every plan) ----
  {
    id: "stackProfiles",
    category: "Admin & configuration",
    title: "Stack Profiles",
    description: "Reusable target-stack and style definitions applied when a project is created.",
    howTo: "Open Stack Profiles (Admin) to define or edit your company's stacks.",
    minPlan: "SINGLE_USER",
    adminOnly: true,
  },
  {
    id: "themeProfiles",
    category: "Admin & configuration",
    title: "Theme Profiles",
    description: "Reusable look-and-feel themes for generated output.",
    howTo: "Open Theme Profiles (Admin) to define or edit themes.",
    minPlan: "SINGLE_USER",
    adminOnly: true,
  },

  // ---- Security & compliance ----
  {
    id: "encryption",
    category: "Security & compliance",
    title: "Encryption at rest",
    description: "Secrets are encrypted at rest with AES-256-GCM.",
    howTo: "Always on — no configuration required.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "soc2",
    category: "Security & compliance",
    title: "SOC 2 & HIPAA",
    description: "SOC 2- and HIPAA-aligned controls and compliance tooling.",
    howTo: "Add your company's SDLC documents for compliance analysis; assign controls to team members.",
    minPlan: "SMALL_BUSINESS",
  },
  {
    id: "sso",
    category: "Security & compliance",
    title: "Single Sign-On (SSO)",
    description: "Enterprise SSO for your organization.",
    howTo: "Contact your wxKanban representative to configure your identity provider.",
    minPlan: "ENTERPRISE",
  },
  {
    id: "advancedSecurity",
    category: "Security & compliance",
    title: "Advanced Security",
    description: "Additional enterprise-grade security controls.",
    howTo: "Configured as part of Enterprise onboarding.",
    minPlan: "ENTERPRISE",
  },

  // ---- Enterprise & support ----
  {
    id: "emailSupport",
    category: "Enterprise & support",
    title: "Email Support",
    description: "Email-based product support.",
    howTo: "Email admin@wxperts.com.",
    minPlan: "SINGLE_USER",
  },
  {
    id: "dedicatedSupport",
    category: "Enterprise & support",
    title: "Dedicated Support",
    description: "A dedicated support contact for your account.",
    howTo: "Assigned during Enterprise onboarding.",
    minPlan: "ENTERPRISE",
  },
  {
    id: "customIntegrations",
    category: "Enterprise & support",
    title: "Custom Integrations",
    description: "Bespoke integrations built for your organization.",
    howTo: "Scope custom integrations with your wxKanban representative.",
    minPlan: "ENTERPRISE",
  },
  {
    id: "sla",
    category: "Enterprise & support",
    title: "SLA Guarantee",
    description: "A contractual uptime and response-time SLA.",
    howTo: "Part of your Enterprise agreement.",
    minPlan: "ENTERPRISE",
  },
];
// [SCOPE 084 / T001] END

// [SCOPE 084 / T001] BEGIN — availability helpers
const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(
  PLANS.map((p) => [p.id, p]),
) as Record<PlanId, Plan>;

/** Resolve a feature's availability for a given plan. */
export function availabilityFor(feature: HelpFeature, planId: PlanId): FeatureAvailability {
  const viewing = PLAN_BY_ID[planId];
  const required = PLAN_BY_ID[feature.minPlan];
  const note = feature.planNotes?.[planId];
  if (viewing.order >= required.order) {
    return { status: "included", note };
  }
  return { status: "upgrade_required", unlockingPlan: feature.minPlan, note };
}

/** Features grouped by category, in CATEGORIES order (skips empty categories). */
export function featuresByCategory(): Array<{ category: string; features: HelpFeature[] }> {
  return CATEGORIES.map((category) => ({
    category,
    features: HELP_FEATURES.filter((f) => f.category === category),
  })).filter((g) => g.features.length > 0);
}

/** Map a raw DB billingplan (incl. internal FREE) to a public plan for display.
 *  FREE shows as the entry-level Single User plan; anything unknown does too. */
export function billingPlanToPublicPlan(billingplan: string | null | undefined): PlanId {
  switch (billingplan) {
    case "SINGLE_USER":
    case "SMALL_BUSINESS":
    case "CONSULTANT":
    case "ENTERPRISE":
      return billingplan;
    default:
      return "SINGLE_USER";
  }
}
// [SCOPE 084 / T001] END
