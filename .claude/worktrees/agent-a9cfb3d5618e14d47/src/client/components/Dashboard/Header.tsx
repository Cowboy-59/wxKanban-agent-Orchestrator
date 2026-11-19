import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../ThemeProvider";
import { ThemeToggle } from "../ThemeToggle";

interface HeaderProps {
  companyName?: string;
  subscriptionTier?: string;
  userName?: string;
  onLogout?: () => void;
}

export function Header({
  companyName = "Loading...",
  subscriptionTier = "FREE",
  userName = "User",
  onLogout,
}: HeaderProps) {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const usertype = user?.usertype ?? "TEAM_MEMBER";
  const { theme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    // Navigate FIRST so ProtectedRoute doesn't bounce to /login when
    // logout() clears user state on the next render.
    setUserMenuOpen(false);
    navigate("/", { replace: true });
    if (onLogout) {
      onLogout();
    } else {
      logout();
    }
  };

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case "FREE":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100";
      case "CONSULTANT":
        return "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100";
      case "ENTERPRISE":
        return "bg-purple-100 text-purple-800 dark:bg-purple-700 dark:text-purple-100";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <header
      className={`sticky top-0 z-30 border-b border-border ${
        theme === "dark" ? "bg-slate-900" : "bg-white"
      }`}
    >
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Left: Company Info */}
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold">{companyName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${getTierBadgeColor(
                  subscriptionTier
                )}`}
              >
                {subscriptionTier}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Theme Toggle & User Menu */}
        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Logout"
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

          {/* User Menu */}
          <div className="relative">
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div className="text-right">
                <p className="text-sm font-semibold">{userName}</p>
                <p className="text-xs text-muted-foreground">{usertype}</p>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  userMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div
                className={`absolute right-0 mt-2 w-48 rounded-lg border border-border shadow-lg ${
                  theme === "dark" ? "bg-slate-800" : "bg-white"
                }`}
              >
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold">{userName}</p>
                  <p className="text-xs text-muted-foreground">{usertype}</p>
                </div>

                <div className="px-2 py-2 space-y-1">
                  <button
                    onClick={() => navigate("/dashboard/settings")}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
                  >
                    Profile Settings
                  </button>
                  <button
                    onClick={() => navigate("/dashboard/billing")}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
                  >
                    Billing & Subscription
                  </button>
                </div>

                <div className="px-2 py-2 border-t border-border">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
