// The screen list to document — end-user core + admin essentials, one guide.
// Chosen from the real nav this account sees. Project-detail uses the most
// populated project (eBusiness, 467 tasks) for realistic screenshots.
export const PROJECT_ID = "1d7d347e-7374-4894-9d27-24edbac4ffee"; // eBusiness — populated

export const SCREENS = [
  { id: "login",          path: "/login",                 title: "Signing in",            nav: "Public page", public: true },
  { id: "dashboard",      path: "/admin/dashboard",        title: "The Dashboard",         nav: "Sidebar > Dashboard" },
  { id: "projects",       path: "/admin/projects",         title: "Projects",              nav: "Sidebar > Projects" },
  { id: "project-detail", path: `/projects/${PROJECT_ID}`, title: "Inside a project",      nav: "Dashboard or Projects > pick a project" },
  { id: "tasks",          path: "/tasks",                  title: "My Tasks",              nav: "Sidebar > My Tasks" },
  // [SCOPE 111] Testing is two distinct surfaces, so it is captured twice: the QA
  // phase shows the automated suite, and Human Testing shows the tests you sign
  // off yourself. One screenshot of "testing" would misrepresent both.
  { id: "testing-qa",     path: `/projects/${PROJECT_ID}/phase/qa`,            title: "Automated tests (QA)", nav: "Projects > pick a project > QA" },
  { id: "testing-user",   path: `/projects/${PROJECT_ID}/phase/human-testing`, title: "User tests",           nav: "Projects > pick a project > Human Testing" },
  { id: "team",           path: "/admin/team",             title: "Team Members",          nav: "Sidebar > Team Members" },
  { id: "integrations",   path: "/integrations",           title: "PM Integrations",       nav: "Sidebar > PM Integrations" },
  { id: "work-hub",       path: "/dashboard/work-hub",     title: "Work Hub",              nav: "Sidebar > Work Hub" },
  { id: "invoices",       path: "/admin/invoices",         title: "Invoices",              nav: "Sidebar > Invoices" },
  { id: "reports",        path: "/admin/reports",          title: "Reports",               nav: "Sidebar > Reports" },
  { id: "stack-profiles", path: "/admin/stack-profiles",   title: "Stack Profiles",        nav: "Sidebar > Stack Profiles" },
  { id: "theme-profiles", path: "/admin/theme-profiles",   title: "Theme Profiles",        nav: "Sidebar > Theme Profiles" },
  { id: "faq",            path: "/faq",                    title: "FAQ",                   nav: "Sidebar > FAQ" },
  { id: "help",           path: "/help",                   title: "Help & plan features",  nav: "Sidebar > Help" },
  { id: "settings",       path: "/admin/settings",         title: "Settings",              nav: "Sidebar > Settings" },
];
