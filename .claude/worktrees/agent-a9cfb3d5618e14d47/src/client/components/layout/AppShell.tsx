import { ReactNode, useState, useEffect, useCallback } from "react";
import { APP_VERSION } from "../../version";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  FolderKanban,
  Plug,
  Clock,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Lock,
  Bell,
  Briefcase,
  Layers,
  HelpCircle,
  BookOpen,
  LifeBuoy,
  UserCircle,
  Palette,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LanguageToggle } from "../LanguageToggle"; // [SCOPE 051]
import { useTranslation } from "../../i18n"; // [SCOPE 052]
import { UpgradeLock } from "../admin/UpgradeLock";
import { RoleLock } from "../admin/RoleLock";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function NotificationBell() {
  const [unreadcount, setUnreadcount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; type: string; read: boolean; createdat: string }>>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unreadonly=false&limit=20", {
        credentials: "include",
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json() as { notifications: typeof notifications; unreadcount: number };
      setNotifications(data.notifications);
      setUnreadcount(data.unreadcount);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
      });
      setUnreadcount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // non-critical
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadcount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unreadcount > 99 ? "99+" : unreadcount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</span>
            {unreadcount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`px-4 py-3 ${n.read ? "opacity-60" : ""}`}>
                  <p className="text-sm text-slate-900 dark:text-slate-100">{n.message}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {new Date(n.createdat).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type BillingPlan = "FREE" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

const TIER_ORDER: Record<BillingPlan, number> = {
  FREE: 1,
  SMALL_BUSINESS: 2,
  CONSULTANT: 3,
  ENTERPRISE: 4,
};

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Minimum plan required to access this nav item */
  requiredPlan?: BillingPlan;
  /** Minimum usertype required (ADMIN-only items) */
  requiredUsertype?: "ADMIN";
}

const ADMIN_NAV: NavItem[] = [
  { label: "appnav.dashboard", href: "/admin/dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "appnav.teamMembers", href: "/admin/team", icon: <Users className="w-4 h-4" /> },
  { label: "appnav.projects", href: "/admin/projects", icon: <FolderKanban className="w-4 h-4" /> },
  { label: "appnav.pmIntegrations", href: "/integrations", icon: <Plug className="w-4 h-4" /> },
  { label: "appnav.myTasks", href: "/tasks", icon: <ListChecks className="w-4 h-4" /> },
  // [SCOPE 017 / T047] + [SCOPE 119 / T012] Both surfaces were added to TEAM_NAV
  // only, leaving an ADMIN with no route to them even though neither page is
  // role-gated and SCOPE-119 names Company Admin as a read-only actor. The Work
  // Hub below was already here, so consultant surfaces in this list are the
  // established pattern, not an exception. Order mirrors TEAM_NAV: orient, act,
  // then the records both refer to.
  { label: "appnav.myDay", href: "/dashboard/consultant", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "appnav.workHub", href: "/dashboard/work-hub", icon: <Briefcase className="w-4 h-4" /> },
  { label: "appnav.customers", href: "/dashboard/consultant/customers", icon: <Users className="w-4 h-4" /> },
  {
    label: "appnav.timeBilling",
    href: "/admin/time-billing",
    icon: <Clock className="w-4 h-4" />,
    requiredPlan: "SMALL_BUSINESS", // [SCOPE 005 / T014] Amendment B: Business plan and up
    requiredUsertype: "ADMIN",
  },
  {
    label: "appnav.invoices",
    href: "/admin/invoices",
    icon: <FileText className="w-4 h-4" />,
    requiredPlan: "CONSULTANT",
    requiredUsertype: "ADMIN",
  },
  {
    label: "appnav.reports",
    href: "/admin/reports",
    icon: <BarChart3 className="w-4 h-4" />,
    requiredPlan: "CONSULTANT",
    requiredUsertype: "ADMIN",
  },
  { label: "appnav.stackProfiles", href: "/admin/stack-profiles", icon: <Layers className="w-4 h-4" />, requiredUsertype: "ADMIN" }, // [SCOPE 057 / T004]
  { label: "Theme Profiles", href: "/admin/theme-profiles", icon: <Layers className="w-4 h-4" />, requiredUsertype: "ADMIN" }, // [SCOPE 062 / T014]
  { label: "Theme Studio", href: "/themes", icon: <Palette className="w-4 h-4" /> }, // Theme Studio Phase 1
  { label: "FAQ", href: "/faq", icon: <HelpCircle className="w-4 h-4" /> }, // [SCOPE 066 / T006]
  { label: "appnav.help", href: "/help", icon: <LifeBuoy className="w-4 h-4" /> }, // [SCOPE 084 / T007]
  // [profile self-service] full profile edit (photo, name, role, email, language, prefs)
  { label: "appnav.profile", href: "/settings?tab=profile", icon: <UserCircle className="w-4 h-4" /> },
  { label: "appnav.settings", href: "/admin/settings", icon: <Settings className="w-4 h-4" />, requiredUsertype: "ADMIN" },
];

const TEAM_NAV: NavItem[] = [
  { label: "appnav.dashboard", href: "/dashboard/team", icon: <LayoutDashboard className="w-4 h-4" /> },
  // [SCOPE 017 / T047] Orientation surface; sits directly above the Work Hub
  // it hands off to, so the "look, then act" order is the reading order.
  { label: "appnav.myDay", href: "/dashboard/consultant", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "appnav.workHub", href: "/dashboard/work-hub", icon: <Clock className="w-4 h-4" /> },
  // [SCOPE 119 / T012] Customer records — a consultant's own record of a client
  { label: "appnav.customers", href: "/dashboard/consultant/customers", icon: <Users className="w-4 h-4" /> },
  { label: "appnav.pmIntegrations", href: "/integrations", icon: <Plug className="w-4 h-4" /> },
  { label: "appnav.myTasks", href: "/tasks", icon: <ListChecks className="w-4 h-4" /> },
  { label: "appnav.projects", href: "/projects", icon: <FolderKanban className="w-4 h-4" /> },
  { label: "Theme Studio", href: "/themes", icon: <Palette className="w-4 h-4" /> }, // Theme Studio Phase 1
  { label: "FAQ", href: "/faq", icon: <HelpCircle className="w-4 h-4" /> }, // [SCOPE 066 / T006]
  { label: "appnav.help", href: "/help", icon: <LifeBuoy className="w-4 h-4" /> }, // [SCOPE 084 / T007]
  // [profile self-service] full profile edit
  { label: "appnav.profile", href: "/settings?tab=profile", icon: <UserCircle className="w-4 h-4" /> },
];

function NavLink({ item, currentPlan, usertype }: {
  item: NavItem;
  currentPlan: BillingPlan;
  usertype: string;
}) {
  const location = useLocation();
  const { t } = useTranslation();
  const isActive = location.pathname === item.href;

  // Check tier access
  const tierOk = !item.requiredPlan ||
    (TIER_ORDER[currentPlan] ?? 0) >= TIER_ORDER[item.requiredPlan];

  // Check role access (ADMIN-only items locked for TEAM_MANAGER)
  const roleOk = !item.requiredUsertype || usertype === "ADMIN";

  const baseClass = `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left`;
  const activeClass = "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300";
  const inactiveClass = "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100";

  if (!tierOk) {
    // Tier-locked: show locked state inline in sidebar
    return (
      <div className={`${baseClass} opacity-50 cursor-not-allowed ${inactiveClass}`} title={`Requires ${item.requiredPlan} plan`}>
        <span className="opacity-50">{item.icon}</span>
        <span>{t(item.label)}</span>
        <Lock className="w-3 h-3 ml-auto opacity-60" />
      </div>
    );
  }

  if (!roleOk) {
    // Admin-only items are hidden entirely for non-admins (e.g. TEAM_MANAGER).
    return null;
  }

  return (
    <Link
      to={item.href}
      className={`${baseClass} ${isActive ? activeClass : inactiveClass}`}
    >
      {item.icon}
      <span>{t(item.label)}</span>
    </Link>
  );
}

interface AppShellProps {
  children: ReactNode;
}

/**
 * Application shell with role-conditional sidebar navigation.
 *
 * - ADMIN: 8-item nav; tier-gated and role-gated items shown locked where applicable
 * - TEAM_MANAGER: same 8-item nav; Time & Billing / Invoices / Reports are role-locked
 * - TEAM_MEMBER: 4-item basic nav; no billing or admin sections
 */
// [SCOPE 067] Grace banner shown while a company's subscription payment has
// failed (PENDING_INACTIVE). Login stays available; admins get a one-click
// Stripe Customer Portal link to update their card.
function BillingBanner() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (user?.subscriptionstatus !== "PENDING_INACTIVE") return null;
  const isAdmin = user?.usertype === "ADMIN";
  const openPortal = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/payment/portal-session", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as { url?: string }).url) {
        window.location.href = (data as { url: string }).url;
        return;
      }
      alert((data as { error?: string }).error || "Could not open billing portal");
    } catch {
      alert("Could not open billing portal");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 dark:border-orange-800/60 dark:bg-orange-900/20 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-orange-800 dark:text-orange-200">
        <Lock className="w-4 h-4 flex-shrink-0" />
        <span>Your subscription payment failed. Update your billing to avoid a service interruption.</span>
      </div>
      {isAdmin ? (
        <button
          onClick={openPortal}
          disabled={busy}
          className="text-sm font-medium px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 flex-shrink-0"
        >
          {busy ? "Opening…" : "Update billing"}
        </button>
      ) : (
        <span className="text-xs text-orange-700 dark:text-orange-300 flex-shrink-0">Contact your admin</span>
      )}
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // [SCOPE 051] The language switcher lives on the dashboard (and the public
  // landing page, which renders its own) — hidden on all other in-app screens.
  const showLanguageToggle = location.pathname.includes("/dashboard");

  const usertype = user?.usertype ?? "TEAM_MEMBER";
  const currentPlan = (user?.billingplan ?? "FREE") as BillingPlan;

  const navItems = usertype === "TEAM_MEMBER" ? TEAM_NAV : ADMIN_NAV;

  const handleLogout = async () => {
    // Navigate FIRST so ProtectedRoute doesn't bounce to /login when
    // setUser(null) flushes during await logout().
    navigate("/", { replace: true });
    try {
      await logout();
    } catch {
      // logout failure is non-critical
    }
  };

  const handleAvatarClick = () => {
    navigate("/settings?tab=profile");
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <img src="/wxKanbanNoSloganBlack.png" alt="wxKanban" className="h-7 w-auto invert dark:invert-0" />
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">v{APP_VERSION}</span>
        </div>
        {usertype !== "TEAM_MEMBER" && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
            {currentPlan.replace("_", " ")} Plan
          </p>
        )}
        {/* [SCOPE 037 / T062] BEGIN — Tenant context chip */}
        {/* Makes the active tenant obvious for users with dual-persona exposure
            (CONSULTANT-plan ADMINs who also operate on engagements). Always shows
            the active Company name + a "Consulting Co." badge if the user's
            primary tenant is on the CONSULTANT plan. */}
        {user?.companyname && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Active tenant
            </span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[170px]" title={user.companyname}>
              {user.companyname}
            </span>
            {currentPlan === "CONSULTANT" && (
              <span
                className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                title="This tenant is on the CONSULTANT plan and can serve engagements"
              >
                Consulting
              </span>
            )}
          </div>
        )}
        {/* [SCOPE 037 / T062] END */}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            currentPlan={currentPlan}
            usertype={usertype}
          />
        ))}
        {/* [SCOPE 141 / T016] BEGIN — Getting Started and the Manual
            Both open the Manual (public/manual/, served at /manual). It is static HTML, not a
            router route, so use a real anchor + new tab (a <Link> would 404). */}
        <a
          href="/manual/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <BookOpen className="w-4 h-4" />
          <span>{t("appnav.gettingStarted")}</span>
        </a>
        <a
          href="/manual/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <BookOpen className="w-4 h-4" />
          <span>{t("appnav.manual")}</span>
        </a>
        {/* [SCOPE 141 / T016] END */}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 px-2 py-2 mb-1 w-full rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left group">
          <button
            onClick={handleAvatarClick}
            className="w-8 h-8 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-sm font-bold group-hover:ring-2 group-hover:ring-indigo-400 transition-all"
            title="Click to edit profile"
            style={{ minWidth: 32, minHeight: 32 }}
          >
            {/* [profile self-service] show the uploaded photo when set, else the initial */}
            {user?.avatarurl ? (
              <img src={user.avatarurl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              user?.email?.[0]?.toUpperCase() ?? "?"
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
              {user?.email}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{usertype}</p>
          </div>
          <NotificationBell />
        </div>
        {/* [SCOPE 051] language switcher — dashboard only (landing page has its own) */}
        {showLanguageToggle && (
          <div className="mb-1 px-1">
            <LanguageToggle />
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 transition"
        >
          <LogOut className="w-4 h-4" />
          {t("appnav.signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shrink-0">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex flex-col w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
            <button
              className="absolute top-3 right-3 p-1 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/wxKanbanNoSloganBlack.png" alt="wxKanban" className="h-6 w-auto invert dark:invert-0" />
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 overflow-auto">
          <BillingBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

export { UpgradeLock, RoleLock };
