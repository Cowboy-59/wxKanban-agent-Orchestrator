// [SCOPE 084 / T006] BEGIN — Deep per-area Help articles
//
// The "full-blown" per-page help: what every control/button/option does, grounded
// in the real UI. Keyed by HelpFeature.id. A feature with an article renders the
// rich detail page (overview -> what you will see -> controls & options -> common
// tasks -> tips); a feature WITHOUT one falls back to the quick steps in guides.ts.
//
// Content is derived from the actual page components (SCOPE-084 deep-help pass);
// keep it truthful — if a control is not in the UI, it does not belong here.

export interface HelpControl {
  /** The label as shown in the UI. */
  label: string;
  /** What happens when you use it. */
  does: string;
  /** Set when the control is limited to company ADMINs. */
  adminOnly?: boolean;
  /** Optional plan qualifier (e.g. "Consultant+"). */
  planNote?: string;
}

export interface HelpTask {
  title: string;
  steps: string[];
}

export interface HelpArticle {
  /** Fuller "what this page is and why" — 1-3 sentences. */
  overview?: string;
  /** The regions/sections of the screen. */
  whatYouSee?: string[];
  /** Every button/control/option and what it does. */
  controls?: HelpControl[];
  /** Common step-by-step tasks. */
  tasks?: HelpTask[];
  /** Gotchas and notes. */
  tips?: string[];
}

export const HELP_ARTICLES: Record<string, HelpArticle> = {
  "dashboard": {
    "overview": "The dashboard is your landing page after signing in and adapts to your role. Admins get the Admin Dashboard (subscription status, org stats, a project overview grid with per-project document links, proposals, pending tasks, activity feed, and system health), while team members get a leaner My Dashboard focused on assigned projects, open tasks, and a link to their work queue. Several lower sections (Time & Billing, Reports) are placeholders that only show data once time entries exist and require the right plan and admin role.",
    "whatYouSee": [
      "Page header with your plan, company name, and welcome message",
      "Stat cards across the top (Team Members / Assigned Projects, Active Projects / Open Tasks, Hours This Week)",
      "Subscription card showing your current billing plan (admin)",
      "Project Overview grid — cards grouped into Active and Branched, each with lifecycle phase progress",
      "Per-project document links inside each project card (Overview, Lifecycle, Development Plan, Audit Report, Compound Learnings, Scope Analysis, Entity Diagram)",
      "Project Proposals and Pending Tasks panels (admin)",
      "Engagements quick-view (admin, hidden when you have none)",
      "Daily Digest preview and Activity feed (admin)",
      "Time & Billing, System Health, and Reports sections (admin, plan-gated placeholders)",
      "Consultant Work Hub card with a link to your task queue (team member)"
    ],
    "controls": [
      {
        "label": "New",
        "does": "Opens the Create Project modal to add a project inline from the dashboard.",
        "adminOnly": true
      },
      {
        "label": "All projects",
        "does": "Link in the project panel header that takes you to the full Projects list."
      },
      {
        "label": "Edit pencil (on a project card)",
        "does": "Opens the Edit Audit Type dialog to set or clear a project's compliance framework (GDPR, HIPAA, HITRUST, SOC2).",
        "adminOnly": true
      },
      {
        "label": "Project card",
        "does": "Clicking a project card opens that project's workspace."
      },
      {
        "label": "Project Overview (card link)",
        "does": "Opens the AI-assisted project overview editor for that project, creating a draft if none exists."
      },
      {
        "label": "Project Lifecycle (card link)",
        "does": "Opens the generated project lifecycle document/PDF for that project."
      },
      {
        "label": "Development Plan (card link)",
        "does": "Opens the generated build-roadmap (development plan) PDF for that project."
      },
      {
        "label": "Audit Report (card link)",
        "does": "Opens the project's compliance audit report page."
      },
      {
        "label": "Compound Learnings (card link)",
        "does": "Opens the project's Learnings report showing captured decisions and fixes."
      },
      {
        "label": "Project Scope Analysis (card link)",
        "does": "Opens the cross-scope analysis report for the project."
      },
      {
        "label": "Entity Diagram (card link)",
        "does": "Opens the platform-wide database ER diagram viewer."
      },
      {
        "label": "Compliance Framework (dropdown in Edit Audit Type)",
        "does": "Selects which audit framework applies to the project, then Save applies it.",
        "adminOnly": true
      },
      {
        "label": "Open Work Hub",
        "does": "Team-member button that opens the Consultant Work Hub — your unified task queue with time tracking."
      }
    ],
    "tasks": [
      {
        "title": "Create a new project from the dashboard",
        "steps": [
          "Click New in the Project Overview panel header",
          "Fill in the project details in the modal",
          "Confirm to create — you are taken to the new project"
        ]
      },
      {
        "title": "Set a project's compliance framework",
        "steps": [
          "Find the project card",
          "Click the edit pencil next to its audit badge",
          "Choose a framework (or None) in the dropdown",
          "Click Save"
        ]
      },
      {
        "title": "Open a project's lifecycle or development plan",
        "steps": [
          "Locate the project card in the grid",
          "Click the Project Lifecycle or Development Plan link inside the card",
          "The generated PDF opens"
        ]
      }
    ],
    "tips": [
      "Team members see a read-only project grid with no New button or edit pencils.",
      "Hours This Week and the Time & Billing / Reports sections are placeholders and show zero/empty until time entries are recorded.",
      "A document link that says 'not created' means that report hasn't been generated for the project yet.",
      "Time & Billing, Reports, and System Health require the CONSULTANT+ plan and/or admin role."
    ]
  },
  "projects": {
    "overview": "The Projects area lists all your projects with search, phase filters, and sorting, and lets you open any project into a full workspace. The project workspace is organized as a 6-phase lifecycle (Design, Implementation, QA, Human Testing, Beta, Release) plus extra tabs for Lifecycle, Development Plan, Portfolio Analyzer, Compliance, Learnings, and Kit, and a Views row (Matrix, Kanban, Stack, Theme, Bug Reports). Admins can edit, archive, or delete projects and control phase advancement.",
    "whatYouSee": [
      "Projects list header with a count and New Project button",
      "Phase filter chips (All, Design, Implementation, QA Testing, Human Testing, Beta Release, Release)",
      "Search box and sort buttons (Updated, Created, Name)",
      "A row of project cards; clicking one expands its detail panel",
      "Inside a project: a top bar with project name, phase badge, and edit/archive/delete controls",
      "Tab bar: Lifecycle, Development Plan, Portfolio Analyzer, Compliance, Learnings, Kit",
      "A Views row: Matrix, Kanban, Stack, Theme, Bug Reports",
      "The active phase workspace (specs, tasks, completion, advance/reopen controls)",
      "A task drawer that slides in when you open a specific task"
    ],
    "controls": [
      {
        "label": "New Project",
        "does": "Opens the Create Project modal to start a new project."
      },
      {
        "label": "Show All / My Projects",
        "does": "Toggles between only your assigned projects and all projects in your organization (shown only to non-admins; admins always see everything)."
      },
      {
        "label": "Phase filter chips",
        "does": "Filters the list to projects currently in the selected lifecycle phase."
      },
      {
        "label": "Search box",
        "does": "Filters projects by name or description as you type."
      },
      {
        "label": "Sort buttons (Updated / Created / Name)",
        "does": "Sorts the list by that field; clicking the active field again flips ascending/descending."
      },
      {
        "label": "Edit pencil (project top bar)",
        "does": "Opens the edit dialog to change name, description, hourly rate, allocated hours, PM systems, security classification, audit type, and phase assignments."
      },
      {
        "label": "Audit dropdown (project top bar)",
        "does": "Quickly sets the project's compliance framework (No Audit, GDPR, HIPAA, HITRUST, SOC2).",
        "adminOnly": true
      },
      {
        "label": "Archive",
        "does": "Archives the project so it is hidden from the project list (with a confirmation prompt).",
        "adminOnly": true
      },
      {
        "label": "Delete",
        "does": "Permanently deletes the project and all its tasks, phases, specs, and documents (with a confirmation prompt).",
        "adminOnly": true
      },
      {
        "label": "Lifecycle / Development Plan tabs",
        "does": "Show the generated lifecycle PDF and build-roadmap PDF for the project inline."
      },
      {
        "label": "Compliance tab",
        "does": "Opens the compliance workspace with sub-tabs: Settings, Documents, Tasks, Audit, Reports."
      },
      {
        "label": "Learnings tab",
        "does": "Shows the captured learnings report; admins can regenerate it."
      },
      {
        "label": "Kit tab",
        "does": "Opens Kit management for downloading and managing the project's orchestrator kit."
      },
      {
        "label": "Change Impact mode (Kit tab)",
        "does": "Sets how the kit's Change Impact check treats AI edits in this project: Notify tells the developer what an edit affects and never asks; Boundaries (the default) asks only when an edit reaches another scope or a signed-off test; Always asks whenever an edit affects anything else. It applies to every developer's kit and overrides a value set locally. Possible data loss is stopped in every mode. Only the project owner or a company administrator can change it; everyone else sees who set it and when."
      },
      {
        "label": "Change Impact log (expanded scope row)",
        "does": "Expand a scope to see its Change Impact log: a read-only record of each change that crossed an Impact Boundary for that scope, who agreed to or approved it, when, and the developer's own words. Records cannot be edited or deleted."
      },
      {
        "label": "Matrix / Kanban views",
        "does": "Switch the workspace between a scope matrix grid and a Kanban board of scopes/tasks."
      },
      {
        "label": "Stack / Theme / Bug Reports views",
        "does": "Open the project's tech stack editor, visual theme studio, and bug-report triage surfaces."
      }
    ],
    "tasks": [
      {
        "title": "Find and open a project",
        "steps": [
          "Go to the Projects list",
          "Type in the search box or click a phase filter chip",
          "Click a project card to expand it, then open its workspace"
        ]
      },
      {
        "title": "Move a project to the next phase",
        "steps": [
          "Open the project and select the current phase tab",
          "Complete the phase's tasks or specs",
          "Use the Advance control in the phase view (admins or the phase's assignee)"
        ]
      },
      {
        "title": "Edit project details and phase owners",
        "steps": [
          "Open the project",
          "Click the edit pencil in the top bar",
          "Update fields and assign team members to phases",
          "Save"
        ]
      },
      {
        "title": "Enable a compliance framework",
        "steps": [
          "Open the project",
          "Pick a framework from the Audit dropdown (admin) or the edit dialog",
          "Open the Compliance tab to configure settings, upload documents, and run audits"
        ]
      },
      {
        "title": "Choose how the kit checks AI edits",
        "steps": [
          "Open the project and click the Kit tab",
          "In Change Impact mode, choose Notify, Boundaries or Always (project owner or company administrator)",
          "Check the line under the choices: it shows who set the mode and when; every developer's kit picks it up within an hour"
        ]
      }
    ],
    "tips": [
      "Opening a bare project URL lands on the Kanban board by default.",
      "Change Impact mode set here wins over a mode a developer typed into their own kit settings; the kit tells them it was ignored.",
      "Only admins (or the assigned phase owner / team manager) can advance or reopen a phase.",
      "Delete is permanent and cannot be undone; use Archive to just hide a project.",
      "Projects accessed through a client engagement show a 'Client project' badge and hide the edit controls.",
      "The Lifecycle and Development Plan PDFs can lag recent changes until regenerated."
    ]
  },
  "tasks": {
    "overview": "The Tasks page shows a unified, read-only view of all tasks aggregated from your connected project-management systems (Jira, Monday, Asana, Trello) plus internal tasks. You can filter, sort, and manually trigger a sync, but tasks are viewed here rather than created or edited.",
    "whatYouSee": [
      "Header with page title and a badge showing the total task count",
      "Last-sync time and a Sync Now button",
      "Filter/sort bar: Source, Priority, Status, Sort field, and sort-direction toggle",
      "A responsive grid of task cards (title, source badge, project, priority, status, due date, external id)",
      "Empty-state prompt linking to Integrations when no tasks exist"
    ],
    "controls": [
      {
        "label": "← Back",
        "does": "Returns to the Dashboard."
      },
      {
        "label": "Sync Now",
        "does": "Triggers an immediate sync of all connected PM systems, then reports how many tasks were added, updated, or errored and refreshes the list."
      },
      {
        "label": "Source (dropdown)",
        "does": "Filters tasks by origin: All sources, Jira, Monday, Asana, Trello, or Internal."
      },
      {
        "label": "Priority (dropdown)",
        "does": "Filters tasks by priority: All, Critical, High, Medium, or Low."
      },
      {
        "label": "Status (dropdown)",
        "does": "Filters tasks by status: All, Open, In Progress, Completed, or Orphaned."
      },
      {
        "label": "Sort (dropdown)",
        "does": "Chooses the sort field: Last Updated, Due Date, Priority, or Title."
      },
      {
        "label": "↑ / ↓ (direction toggle)",
        "does": "Switches the sort order between ascending and descending."
      },
      {
        "label": "Integrations (link)",
        "does": "In the empty state, navigates to the Integrations page to connect a PM system."
      }
    ],
    "tasks": [
      {
        "title": "See tasks from a specific tool",
        "steps": [
          "Open the Tasks page",
          "Set the Source dropdown to Jira, Monday, Asana, Trello, or Internal",
          "Review the filtered cards"
        ]
      },
      {
        "title": "Pull the latest tasks",
        "steps": [
          "Click Sync Now",
          "Wait for the spinner to finish",
          "Read the summary of added/updated/errors and the refreshed cards"
        ]
      },
      {
        "title": "Focus on urgent work",
        "steps": [
          "Set Priority to Critical or High",
          "Set Sort to Due Date",
          "Toggle the direction to ascending to see soonest due dates first"
        ]
      }
    ],
    "tips": [
      "The count badge reflects the currently filtered result set.",
      "Tasks are read-only here; connect or manage sources on the Integrations page.",
      "Last sync shows a relative time (e.g. '5m ago') based on the most recent connection sync."
    ]
  },
  "pmIntegrations": {
    "overview": "The Integrations page lets you connect your project-management tools to wxKanban via OAuth so their tasks flow into the unified Tasks view. It shows one card per supported system (Jira, Monday.com, Asana, Trello) with connect/disconnect controls and connection status.",
    "whatYouSee": [
      "Header with title, subtitle, and a View Tasks button",
      "Optional green success banner after returning from an OAuth flow",
      "Optional red error banner if a connection action fails",
      "A grid of four PM-system cards (Jira, Monday.com, Asana, Trello)",
      "Per-card status: connected-since date, sync status badge (active/expired/failed), and last-sync time",
      "A blue 'Need help?' info panel at the bottom"
    ],
    "controls": [
      {
        "label": "← Back",
        "does": "Returns to the Dashboard."
      },
      {
        "label": "View Tasks",
        "does": "Navigates to the Tasks page to see synced tasks."
      },
      {
        "label": "Connect",
        "does": "Starts the OAuth authorization flow for that system and redirects you to its login/consent page."
      },
      {
        "label": "Disconnect",
        "does": "After a confirmation prompt, removes the connection to that PM system and refreshes the cards."
      },
      {
        "label": "Sync status badge",
        "does": "Displays the connection health: Active (green), or a warning for Expired (yellow) / Failed (red)."
      },
      {
        "label": "Need help? panel",
        "does": "Static informational text with guidance on connecting integrations."
      }
    ],
    "tasks": [
      {
        "title": "Connect a PM tool",
        "steps": [
          "Open the Integrations page",
          "Find the system's card (e.g. Jira)",
          "Click Connect",
          "Complete the sign-in/consent on the provider's site",
          "Return to see a success banner and Connected status"
        ]
      },
      {
        "title": "Remove a connection",
        "steps": [
          "Locate the connected system's card",
          "Click Disconnect",
          "Confirm in the prompt"
        ]
      },
      {
        "title": "Check why syncing stopped",
        "steps": [
          "Open the Integrations page",
          "Look at the card's status badge",
          "If it shows Expired or Failed, Disconnect and Connect again to re-authorize"
        ]
      }
    ],
    "tips": [
      "Only Jira, Monday.com, Asana, and Trello are supported.",
      "An Expired or Failed badge usually means the OAuth token needs re-authorizing via Connect.",
      "After connecting, use View Tasks (or Sync Now on the Tasks page) to pull tasks in."
    ]
  },
  "team": {
    "overview": "The Team Members page (Personnel) lists everyone in your company, with search, active/inactive filtering, and — for admins — controls to invite members, change roles and language, activate/deactivate, remove, re-invite, and reset passwords. Admins also see a Pending Invitations table and a Consultants panel.",
    "whatYouSee": [
      "Header with 'Team Members' title, member count, and an Invite Member button",
      "Search box plus All / Active / Inactive filter buttons",
      "Members table: Email, Name, Role, Language, Status, Joined, Actions",
      "Inline error banner and a green action-steps confirmation panel",
      "Pending Invitations table (admin-only, when invitations exist)",
      "Consultants panel for engaged consulting companies (spec 037)"
    ],
    "controls": [
      {
        "label": "Invite Member",
        "does": "Opens the Invite Team Member modal to send an email invitation with a chosen role."
      },
      {
        "label": "Search by name or email",
        "does": "Filters the member list as you type."
      },
      {
        "label": "All / Active / Inactive",
        "does": "Filters the table to all members, only active, or only inactive."
      },
      {
        "label": "Edit name (pencil)",
        "does": "Inline-edits the member's full name; save with the check, cancel with the X (Enter/Escape also work)."
      },
      {
        "label": "Role (dropdown)",
        "does": "Changes a member's role to Admin, Manager, or Member.",
        "adminOnly": true
      },
      {
        "label": "Language (dropdown)",
        "does": "Sets the member's preferred UI language from the supported locales.",
        "adminOnly": true
      },
      {
        "label": "Active / Inactive (status toggle)",
        "does": "Deactivates (with a confirm) or reactivates a member's access.",
        "adminOnly": true
      },
      {
        "label": "Re-send invitation (mail icon)",
        "does": "Sends a fresh invitation email to a member and shows the resulting steps.",
        "adminOnly": true
      },
      {
        "label": "Reset password (key icon)",
        "does": "Sends a password-reset email to the member.",
        "adminOnly": true
      },
      {
        "label": "Remove member (trash icon)",
        "does": "After a Yes/No confirm, removes the member (deactivates their access).",
        "adminOnly": true
      },
      {
        "label": "Resend invitation (Pending table)",
        "does": "Reissues a pending invite with a new link and fresh 7-day expiry.",
        "adminOnly": true
      },
      {
        "label": "Cancel invitation (Pending table)",
        "does": "After confirm, cancels a pending invitation so it can no longer be accepted.",
        "adminOnly": true
      },
      {
        "label": "Role radios (invite modal)",
        "does": "Choose Admin, Team Manager, or Team Member for the invitee; Team Manager requires a CONSULTANT+ plan."
      },
      {
        "label": "Send Invitation (invite modal)",
        "does": "Sends the invite to the entered email; shows a success panel with a 7-day accept window."
      }
    ],
    "tasks": [
      {
        "title": "Invite a new team member",
        "steps": [
          "Click Invite Member",
          "Enter the person's email",
          "Pick a role (Admin, Team Manager, or Team Member)",
          "Click Send Invitation",
          "The invitee gets an email and has 7 days to accept"
        ]
      },
      {
        "title": "Change someone's role",
        "steps": [
          "Find the member in the table",
          "Open the Role dropdown in their row",
          "Select Admin, Manager, or Member"
        ]
      },
      {
        "title": "Deactivate an account",
        "steps": [
          "Locate the member",
          "Click their green Active badge",
          "Confirm 'Set inactive?' with Yes"
        ]
      },
      {
        "title": "Resend a stale invitation",
        "steps": [
          "Scroll to Pending Invitations",
          "Click the mail icon on the invite row to resend with a fresh 7-day expiry"
        ]
      }
    ],
    "tips": [
      "Role, language, status toggle, re-invite, reset-password, remove, and the Pending Invitations table are visible only to admins.",
      "Admins cannot change status or role on other admins, or on themselves.",
      "Seat limits apply: at the plan's cap the invite form is disabled with an upgrade prompt, and Team Manager needs a CONSULTANT or ENTERPRISE plan.",
      "Deactivate/remove/cancel actions each require a Yes/No confirmation."
    ]
  },
  "timeTracking": {
    "overview": "There is no dedicated Time Tracking page wired into the app. Live time tracking happens inside the Consultant Work Hub (see workHub). A set of standalone time-tracking widgets exists in the codebase (TimerWidget, TimeEntriesList, TimeSummary) that hit the /api/time-tracking endpoints, but they are not currently mounted on any route, so this feature is partially built / not user-reachable as its own screen. The controls below describe those widgets for completeness.",
    "whatYouSee": [
      "Timer widget: a start/stop stopwatch that shows elapsed HH:MM:SS while running (unmounted component)",
      "Time entries list: past entries with duration, start/end, billable and invoiced badges (unmounted component)",
      "Time summary: total time, billable time, billable percentage and per-entry averages (unmounted component)"
    ],
    "controls": [
      {
        "label": "Description (optional)",
        "does": "Free-text note (max 500 chars) for what you are working on before starting the timer"
      },
      {
        "label": "Mark as billable",
        "does": "Checkbox that sets the new time entry as billable when you start the timer"
      },
      {
        "label": "Start Timer",
        "does": "Starts a live timer for the project/task; blocked if a timer is already running"
      },
      {
        "label": "Stop Timer",
        "does": "Stops the running timer and records the elapsed duration as a time entry"
      },
      {
        "label": "Billable only",
        "does": "Checkbox filter that shows only billable entries in the time entries list"
      },
      {
        "label": "Delete",
        "does": "Removes a time entry; disabled once the entry has been invoiced"
      }
    ],
    "tasks": [
      {
        "title": "Track time on work (via Work Hub)",
        "steps": [
          "Open the Consultant Work Hub",
          "Press Start Timer on the task you are working on",
          "Press Stop when done and answer the billable prompt"
        ]
      }
    ],
    "tips": [
      "A timer running past 8 hours triggers an inactivity warning prompting you to stop it",
      "Only one timer can run at a time"
    ]
  },
  "invoices": {
    "overview": "Full working invoicing screen. Shows summary stats, lets you generate an invoice from time entries in a date range, then view, download, email, resend, or delete each invoice.",
    "whatYouSee": [
      "Header with title and a Generate Invoice button",
      "Three stat cards: Total Invoices, Total Revenue, Invoices Sent",
      "Invoice history table: number, date, billed-to, hours, amount, status (Sent/Draft), and row actions",
      "Generate modal (date range) and a per-invoice detail modal"
    ],
    "controls": [
      {
        "label": "Generate Invoice (+)",
        "does": "Opens the generate modal to create an invoice for a date range"
      },
      {
        "label": "Start Date / End Date",
        "does": "Date pickers in the modal that define which time entries are billed (default rate is $100/hr)"
      },
      {
        "label": "Generate Invoice (confirm)",
        "does": "Creates the invoice from billable time in the chosen range; disabled until both dates are set"
      },
      {
        "label": "Cancel",
        "does": "Closes the generate modal without creating an invoice"
      },
      {
        "label": "View (eye icon)",
        "does": "Opens the invoice detail modal with billed-to, status, hours, and total"
      },
      {
        "label": "Send (paper-plane icon)",
        "does": "Emails the invoice and marks it Sent; only shown on unsent invoices"
      },
      {
        "label": "Delete (trash icon)",
        "does": "Deletes the invoice; disabled once the invoice has been sent"
      },
      {
        "label": "Download PDF",
        "does": "Opens the invoice PDF in a new tab (detail modal)"
      },
      {
        "label": "Send Invoice",
        "does": "Emails an unsent invoice from the detail modal"
      },
      {
        "label": "Resend",
        "does": "Re-sends an already-sent invoice from the detail modal"
      }
    ],
    "tasks": [
      {
        "title": "Generate an invoice",
        "steps": [
          "Click Generate Invoice",
          "Pick a start and end date",
          "Click Generate Invoice to confirm"
        ]
      },
      {
        "title": "Send an invoice",
        "steps": [
          "Find the invoice in the history table",
          "Click the send (paper-plane) icon, or open View and click Send Invoice"
        ]
      }
    ],
    "tips": [
      "Sent invoices cannot be deleted",
      "Status badge is green for Sent, yellow for Draft"
    ]
  },
  "reports": {
    "overview": "Reporting screen with two tabs: Time report (hours per team member for a date range) and Projects report (per-project performance). Data is real; the CSV export button is a stub and does not yet produce a file.",
    "whatYouSee": [
      "Two tabs: Time and Projects",
      "Time tab: a date-range filter card plus a per-member table (member, total hours, billable hours, billable %)",
      "Projects tab: a table of projects (hours, task count, completion-rate bar, team size)"
    ],
    "controls": [
      {
        "label": "Time (tab)",
        "does": "Shows hours logged per team member for the selected date range"
      },
      {
        "label": "Projects (tab)",
        "does": "Shows per-project performance: hours, tasks, completion, team size"
      },
      {
        "label": "Start Date / End Date",
        "does": "Date pickers; the time report only loads once both dates are set"
      },
      {
        "label": "Export CSV",
        "does": "Intended to export the report to CSV, but is currently not implemented (no download)"
      }
    ],
    "tasks": [
      {
        "title": "See time by team member",
        "steps": [
          "Open the Time tab",
          "Set a start and end date",
          "Review the per-member hours and billable percentage"
        ]
      },
      {
        "title": "Review project performance",
        "steps": [
          "Open the Projects tab",
          "Read the hours, task count, and completion rate per project"
        ]
      }
    ],
    "tips": [
      "Billable % badge is green above 80%, yellow below",
      "The time report stays empty until both dates are chosen"
    ]
  },
  "workHub": {
    "overview": "The Consultant Work Hub is the consultant's daily workspace: an assigned-task queue with a built-in stopwatch timer, workload counters, billable-time preview, and compliance flags. Fully built and the primary place time gets tracked.",
    "whatYouSee": [
      "Header with a project filter dropdown",
      "Green running-timer banner (when a timer is active) and an amber 8-hour inactivity warning",
      "Workload summary bar: Total, Past Due, 30+ day Aging, Compliance Attention counts",
      "Assigned-queue list: each task shows name, project, status, priority, source tags, and action buttons",
      "Billable preview panel with a date range, manual/AI source breakdown, and a compliance review list"
    ],
    "controls": [
      {
        "label": "Project filter (dropdown)",
        "does": "Filters the task queue and previews to All projects or one project"
      },
      {
        "label": "Start Timer (per task)",
        "does": "Starts a billable timer on that task; disabled while another timer runs"
      },
      {
        "label": "Stop / Stop Timer",
        "does": "Stops the running timer and opens the Save Time Entry (billable) prompt"
      },
      {
        "label": "Keep Running",
        "does": "Dismisses the 8-hour inactivity warning and leaves the timer going"
      },
      {
        "label": "Activity",
        "does": "Opens the Time Log drawer for the task: time entries, status-change history, and PM sync state"
      },
      {
        "label": "Blocked",
        "does": "Opens the status modal to mark the task blocked (requires a reason)"
      },
      {
        "label": "Suspended",
        "does": "Opens the status modal to mark the task suspended (requires a reason)"
      },
      {
        "label": "Billable / Non-billable (save prompt)",
        "does": "After stopping a timer, sets whether the entry is billable, with optional notes"
      },
      {
        "label": "Save Entry",
        "does": "Saves the stopped time entry with the chosen billable flag and notes"
      },
      {
        "label": "Invoice preview Start/End date",
        "does": "Date inputs that set the range for the billable-time preview totals"
      }
    ],
    "tasks": [
      {
        "title": "Track time on a task",
        "steps": [
          "Optionally filter by project",
          "Click Start Timer on the task",
          "Click Stop when done",
          "Choose Billable or Non-billable and Save Entry"
        ]
      },
      {
        "title": "Mark a task blocked or suspended",
        "steps": [
          "Click Blocked or Suspended on the task",
          "Enter a required reason",
          "Click Submit"
        ]
      },
      {
        "title": "Preview billable time",
        "steps": [
          "Set the preview start and end dates",
          "Read the entry count / total hours and the manual vs AI breakdown"
        ]
      }
    ],
    "tips": [
      "Only one timer runs at a time; the green banner shows the active task and elapsed time",
      "A reason is mandatory when marking a task blocked or suspended"
    ]
  },
  "stackProfiles": {
    "overview": "Company Stack Profiles is an ADMIN-only screen that sets a company-wide default stack & style for each application type (Web / Desktop / Mobile). New projects of a type inherit the profile unless they capture their own stack, in which case the project's own stack always wins. There is one profile per type (max 3).",
    "whatYouSee": [
      "Page heading 'Company Stack Profiles' with an explanation that new projects inherit the company default per app type",
      "A 'Promote a project's stack to company-wide' panel with a project dropdown and a Promote button",
      "A 'Profiles' list showing one row per app type (Web / Desktop / Mobile), each showing whether it is Set (with last-updated date) or Not set",
      "Non-admins see only a red 'This page requires Administrator access.' message"
    ],
    "controls": [
      {
        "label": "Project (must have a captured Stack & Style)",
        "does": "Dropdown of projects that have a captured stack; pick the one whose stack you want to make the company default. Only projects with an app type appear.",
        "adminOnly": true
      },
      {
        "label": "Promote",
        "does": "Copies the selected project's captured stack/style up to the company-wide profile for that project's app type. Disabled until a project is selected; shows 'Promoting…' while working.",
        "adminOnly": true
      },
      {
        "label": "Clear",
        "does": "Removes the company-wide stack profile for that app type, so projects of that type fall back to the built-in default. Shown on each row that is Set.",
        "adminOnly": true
      },
      {
        "label": "Retry",
        "does": "Re-loads the profiles list after a load error.",
        "adminOnly": true
      }
    ],
    "tasks": [
      {
        "title": "Make a project's stack the company default",
        "steps": [
          "Open Company Stack Profiles (admin)",
          "In the Promote panel, choose a project that has a captured Stack & Style",
          "Click Promote",
          "Confirm the matching app-type row now shows 'Set'"
        ]
      },
      {
        "title": "Reset an app type to the built-in default",
        "steps": [
          "Find the app-type row (Web / Desktop / Mobile) marked 'Set'",
          "Click Clear on that row",
          "The row returns to 'Not set' and projects of that type fall back to the wxKanban default"
        ]
      }
    ],
    "tips": [
      "If no projects appear in the dropdown, run /buildstack on a project first to capture its Stack & Style.",
      "A project that has its own captured stack ignores the company profile."
    ]
  },
  "themeProfiles": {
    "overview": "Company Theme Profiles is an ADMIN-only screen that sets a company-wide default color theme per application type (Web / Desktop / Mobile). New projects inherit the theme unless they set their own; a project with its own theme always wins. Profiles are created from a project's Theme tab, not on this page.",
    "whatYouSee": [
      "Page heading 'Company Theme Profiles' with an explanation and a note to set a theme from a project's Theme tab via 'Save as company theme'",
      "A 'Profiles' list with one row per app type (Web / Desktop / Mobile)",
      "Each Set row shows a swatch preview of the primary / secondary / accent / background colors plus a last-updated date; unset rows read 'Not set (projects fall back to the wxKanban default)'",
      "Non-admins see only a red 'This page requires Administrator access.' message"
    ],
    "controls": [
      {
        "label": "Color swatches",
        "does": "Read-only preview of the profile's primary, secondary, accent, and background colors for each Set app type.",
        "adminOnly": true
      },
      {
        "label": "Clear",
        "does": "Removes the company-wide theme profile for that app type, so projects of that type fall back to the wxKanban default theme. Shown on each Set row.",
        "adminOnly": true
      },
      {
        "label": "Retry",
        "does": "Re-loads the profiles list after a load error.",
        "adminOnly": true
      }
    ],
    "tasks": [
      {
        "title": "Set a company default theme",
        "steps": [
          "Open a project and go to its Theme tab",
          "Choose 'Save as company theme'",
          "Return to Company Theme Profiles to confirm the app-type row shows 'Set' with the swatch preview"
        ]
      },
      {
        "title": "Remove a company theme",
        "steps": [
          "Find the app-type row marked 'Set'",
          "Click Clear",
          "The row returns to 'Not set' and projects fall back to the wxKanban default"
        ]
      }
    ],
    "tips": [
      "There is no way to set a theme directly on this page — it is created from a project's Theme tab.",
      "A project that sets its own theme overrides the company profile."
    ]
  },
  "settings": {
    "overview": "There are two distinct Settings surfaces. The admin Company Settings page (src/client/pages/admin/SettingsPage.tsx) manages company info, billing/subscription, and arbitrary encrypted key/value application settings. A second account SettingsPage (src/client/pages/SettingsPage.tsx) is a tabbed personal/company screen with Company, Profile, Notifications, and Security tabs. Notifications is a stub ('coming soon'); Security's only live action is a (non-wired) Delete Account button, with password change living under Profile.",
    "whatYouSee": [
      "Admin Company Settings page: heading 'Company Settings', a Company Information editor (admin), a Billing & Subscription panel (admin), an 'Add Setting' form, and a 'Current Settings' list with a count",
      "Account Settings page: a back-to-dashboard arrow, a Tier Info card with Upgrade, and a tab bar — Company (admins only), Profile, Notifications, Security",
      "Company tab: company name, billing email, consultant invoice email, billing address, billing phone, Save Changes",
      "Profile tab: read-only email, full name, timezone, language, an 'Enable time tracking' checkbox, Save Profile, plus a Change Password card",
      "Notifications tab: placeholder 'Notification settings coming soon...'",
      "Security tab: note pointing to Profile for password change, plus a Danger Zone Delete Account button"
    ],
    "controls": [
      {
        "label": "Company Information — Save Company Info",
        "does": "Saves company name, billing email, consultant invoice email, billing address, and phone via the admin settings API.",
        "adminOnly": true
      },
      {
        "label": "Consultant Invoice Email",
        "does": "Email where B2B invoices from engaged consulting companies are delivered; if empty, invoice generation fails.",
        "adminOnly": true
      },
      {
        "label": "Update card / Re-activate subscription",
        "does": "Opens the Stripe card form to re-enter a card and reactivate a failed/incomplete subscription (label reads 'Add a card / Subscribe' if none on file). Hidden when card processing is disabled.",
        "adminOnly": true
      },
      {
        "label": "Add Setting form (Name / Type / Value / Description)",
        "does": "Creates a new company setting. Name is snake_case (max 64); Type is boolean, default, report_header, or image, which changes the value input (dropdown / text / textarea / URL).",
        "adminOnly": true
      },
      {
        "label": "Add Setting (button)",
        "does": "Submits the new setting; shows 'Adding…' while saving.",
        "adminOnly": true
      },
      {
        "label": "Setting row Edit (pencil)",
        "does": "Inline-edits a setting's value and description; Save/Cancel, with Enter to save and Escape to cancel on text fields.",
        "adminOnly": true
      },
      {
        "label": "Setting row Delete (trash)",
        "does": "Prompts 'Delete this setting?' then Confirm/Cancel to remove it.",
        "adminOnly": true
      },
      {
        "label": "Profile — Full Name / Timezone / Language / Enable time tracking",
        "does": "Editable profile fields; changing Language live-applies the new locale. Email is shown but locked.",
        "adminOnly": false
      },
      {
        "label": "Save Profile",
        "does": "Persists the profile fields and updates the signed-in user context.",
        "adminOnly": false
      },
      {
        "label": "Change Password (Current / New / Confirm + button)",
        "does": "Changes the account password; validates min 8 chars, matching confirmation, and that the new password differs from the current.",
        "adminOnly": false
      },
      {
        "label": "Upgrade (Tier Info card)",
        "does": "Navigates to the /upgrade page to change plan tier.",
        "adminOnly": false
      },
      {
        "label": "Delete Account (Security tab, Danger Zone)",
        "does": "Presented as a destructive account-deletion button (no confirmation handler is wired in the component).",
        "adminOnly": false
      }
    ],
    "tasks": [
      {
        "title": "Update company billing details",
        "steps": [
          "Open admin Company Settings (or the account Settings Company tab)",
          "Edit company name, billing email, consultant invoice email, address, phone",
          "Click Save Company Info / Save Changes"
        ]
      },
      {
        "title": "Recover a failed subscription",
        "steps": [
          "Open admin Company Settings",
          "In Billing & Subscription review the plan and status",
          "Click 'Update card / Re-activate subscription'",
          "Enter card details in the Stripe form and complete"
        ]
      },
      {
        "title": "Add a company setting",
        "steps": [
          "In Add Setting, enter a snake_case name",
          "Pick a Type (boolean / default / report_header / image)",
          "Enter the Value (and optional Description)",
          "Click Add Setting"
        ]
      },
      {
        "title": "Change your password",
        "steps": [
          "Open the account Settings Profile tab",
          "In Change Password enter current, new (8+ chars) and confirm",
          "Submit; new password must differ from the current one"
        ]
      }
    ],
    "tips": [
      "Company settings are encrypted at rest.",
      "The Notifications tab is a placeholder; password change is under Profile, not Security."
    ]
  },
  "test-suite": {
    "overview": "Every version of a project is verified twice before it can be released. In the QA phase, AI runs the automated tests gate by gate and you watch the results arrive live. In the Human Testing phase, you run the tests only a person can judge and sign each one off yourself — but those stay locked until the automated run passes, so you are never asked to test a build that is already known to be broken. A version cannot reach production with either set outstanding.",
    "whatYouSee": [
      "A version header reading 'Version 1.4.0' with its status: In build, In UAT, In production, or Superseded",
      "A 'Scope:' filter, so a project carrying a suite per scope answers 'what is outstanding for THIS scope' instead of showing a flat list of hundreds",
      "Filter chips: All, Outstanding, Forced, Failing",
      "Each test item marked Required or Optional, and tagged AI or Tester to show who wrote it",
      "A 'Run <gate>' button per gate; while a run is open, totals update every couple of seconds as '12 passed · 1 failed · 20 total'",
      "A note reading '4 user test(s) waiting for release to UAT' — the human set exists but cannot be acted on yet",
      "In Human Testing before release: 'Not ready for you yet' with a count and an explanation",
      "Once released: each test showing 'Before you start', 'Steps', and 'Check afterwards', with Pass and Fail buttons",
      "Empty state: 'No test items yet. They are generated when the scope is implemented.'"
    ],
    "controls": [
      {
        "label": "Run <gate>",
        "does": "Starts the AI runner for every machine test in that gate and opens the live view. Results stream in while it works; if the runner stops reporting you see 'Run stalled — no report from the runner' rather than a spinner that never ends."
      },
      {
        "label": "Scope:",
        "does": "Narrows the suite to one scope. Only that scope's items are fetched, which is what keeps a project with a hundred scopes responsive."
      },
      {
        "label": "All / Outstanding / Forced / Failing",
        "does": "Filters the list. Outstanding is the working view; Failing is the triage view; Forced shows items whose testing requirement was overridden."
      },
      {
        "label": "Pass",
        "does": "Signs the test off in your name. Your signoff is recorded against this version, not the project generally."
      },
      {
        "label": "Fail",
        "does": "Asks what actually happened, then files a bug report with the test's steps already attached. The wording you enter becomes the report, so describe the behaviour rather than a guess at the cause."
      },
      {
        "label": "Add a test",
        "does": "Adds your own test to the suite. It is tagged Tester rather than AI, so anyone reading the results can see a human wrote it."
      },
      {
        "label": "Testing requirement",
        "does": "Turns the testing gate off for a project, or forces it on for one scope that inherits an off setting. Administrators only, and the change is written to the audit log.",
        "adminOnly": true
      },
      {
        "label": "Inherits / Override",
        "does": "Shows whether a scope follows the project's testing requirement or sets its own.",
        "adminOnly": true
      }
    ],
    "tasks": [
      {
        "title": "Run the automated tests for a version",
        "steps": [
          "Open the project and choose the QA phase",
          "Set Scope: to the scope you care about, or leave it on all scopes",
          "Click Run beside the gate you want",
          "Watch the totals update; the list refreshes itself when the run finishes",
          "Switch the filter to Failing to work through anything that did not pass"
        ]
      },
      {
        "title": "Sign off a user test",
        "steps": [
          "Open the project and choose the Human Testing phase",
          "If you see 'Not ready for you yet', the automated tests have not passed yet — nothing to do",
          "Read 'Before you start', follow the Steps, then confirm 'Check afterwards'",
          "Click Pass, or Fail and describe what actually happened",
          "Repeat until no Required tests remain outstanding"
        ]
      },
      {
        "title": "Handle a re-test request",
        "steps": [
          "Open Human Testing and look for 'Please test this again'",
          "Something changed since your signoff, so it is being re-checked",
          "Test it again and sign off as normal",
          "If the change could not have affected what you verified, say why — your earlier signoff stands"
        ]
      }
    ],
    "tips": [
      "The QA phase shows automated tests only. The user tests exist from the start and are shown as a waiting count, so you can see the work is there without being able to start it early.",
      "A failure is more useful than a comment: it files a bug report with the steps attached, which a comment does not.",
      "Optional tests do not block a release. Required ones do.",
      "Turning the testing requirement off is an administrator action and is audit-logged; it does not delete the tests, it stops them gating the release."
    ]
  },
  "feedback": {
    "overview": "You can report a problem or request a change from inside the product and then follow what happened to it. Feedback you submit is triaged, may be answered, and is visible to you afterwards under My Feedback. Failing a user test files a bug report the same way, with the test's steps already attached.",
    "whatYouSee": [
      "A feedback form asking what happened, with room for detail",
      "My Feedback: your own submissions for the project you are working in, newest first",
      "A status on each item showing where it has got to",
      "Any reply or triage note left by whoever picked it up",
      "Bug Reports for a project, where Resolved items are hidden by default",
      "Status filter chips with counts, so you can see how many sit in each state"
    ],
    "controls": [
      {
        "label": "Submit feedback",
        "does": "Sends your report for triage. Describe what you did and what you saw rather than what you think caused it — the person reading it cannot see your screen."
      },
      {
        "label": "My Feedback",
        "does": "Lists what you have submitted for the project you are currently in, with its status and any reply. It is scoped to that project, so feedback from another project will not appear here."
      },
      {
        "label": "Status filter chips",
        "does": "Filters bug reports by state; each chip carries a count. Resolved is hidden by default so the list shows outstanding work."
      }
    ],
    "tasks": [
      {
        "title": "Report a problem",
        "steps": [
          "Open the feedback form from inside the product",
          "Describe what you did, what you expected, and what happened instead",
          "Submit, then check My Feedback for the status and any reply"
        ]
      },
      {
        "title": "Find out what happened to something you reported",
        "steps": [
          "Make sure you are in the project you reported it against",
          "Open My Feedback",
          "Find the item and read its status and any triage note"
        ]
      }
    ],
    "tips": [
      "My Feedback is project-scoped. If something you reported is missing, check you are in the right project.",
      "Failing a user test is the fastest way to file a good bug report — the steps are attached for you."
    ]
  },
  "faq": {
    "overview": "Help & FAQ is available to any signed-in user (not admin-gated). It lists published, answered FAQs as an expandable accordion and lets you ask a new question that gets routed to be answered and added to the FAQ.",
    "whatYouSee": [
      "Page heading 'Help & FAQ' with a subtitle inviting you to browse or ask",
      "A 'Frequently asked questions' card listing published FAQ entries, each a collapsible row",
      "An 'Ask a question' area with a text box and Submit question button",
      "Empty/loading states: 'Loading…' or 'No FAQs yet — ask a question below.'"
    ],
    "controls": [
      {
        "label": "FAQ row (title)",
        "does": "Click to expand/collapse the answer; a chevron rotates to show open state. Expanded answers may include an embedded video.",
        "adminOnly": false
      },
      {
        "label": "Question text box",
        "does": "Type your question (up to 2000 characters); must be at least 5 characters to submit.",
        "adminOnly": false
      },
      {
        "label": "Submit question",
        "does": "Sends your question to be answered and added to the FAQ; shows 'Sending…' then a confirmation message. Rejects questions under 5 characters.",
        "adminOnly": false
      }
    ],
    "tasks": [
      {
        "title": "Find an answer",
        "steps": [
          "Open Help & FAQ",
          "Scan the FAQ list",
          "Click a question to expand its answer (and watch any attached video)"
        ]
      },
      {
        "title": "Ask a new question",
        "steps": [
          "Scroll to 'Didn't find your answer? Ask us'",
          "Type your question (5+ characters)",
          "Click Submit question and wait for the confirmation"
        ]
      }
    ],
    "tips": [
      "Only published, answered FAQs appear — your submitted question is added once answered."
    ]
  }
};

export function hasArticle(id: string): boolean {
  const a = HELP_ARTICLES[id];
  return (
    !!a &&
    (!!a.overview ||
      (a.whatYouSee?.length ?? 0) > 0 ||
      (a.controls?.length ?? 0) > 0 ||
      (a.tasks?.length ?? 0) > 0)
  );
}
// [SCOPE 084 / T006] END
