import { useState } from "react";
import { APP_VERSION } from "../../version";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Zap,
  Settings,
  CreditCard,
  Menu,
  X,
} from "lucide-react";

interface SidebarProps {
  activeSection?: string;
  onSectionClick?: (section: string) => void;
}

const navigationItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    section: "overview",
  },
  {
    label: "Projects",
    icon: FolderOpen,
    href: "/dashboard/projects",
    section: "projects",
  },
  {
    label: "Team",
    icon: Users,
    href: "/dashboard/team",
    section: "team",
  },
  {
    label: "Integrations",
    icon: Zap,
    href: "/dashboard/integrations",
    section: "integrations",
  },
];

const settingsItems = [
  {
    label: "Settings",
    icon: Settings,
    href: "/dashboard/settings",
    section: "settings",
  },
  {
    label: "Billing",
    icon: CreditCard,
    href: "/dashboard/billing",
    section: "billing",
  },
];

export function Sidebar({ activeSection, onSectionClick }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (section: string, href: string) => {
    if (onSectionClick) {
      onSectionClick(section);
    }
    navigate(href);
    setIsOpen(false);
  };

  const isActive = (section: string) => {
    return activeSection === section || location.pathname.includes(section);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative left-0 top-0 h-screen w-64 bg-background border-r border-border transition-transform duration-300 transform md:transform-none z-40 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Branding */}
          <div className="px-6 py-6 border-b border-border">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-primary">wxKanban</h1>
              <span className="text-xs text-muted-foreground font-mono">v{APP_VERSION}</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {/* Main Navigation */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground px-3 mb-3">
                WORKSPACE
              </p>
              <div className="space-y-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.section);
                  return (
                    <button
                      key={item.section}
                      onClick={() =>
                        handleNavigation(item.section, item.href)
                      }
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings Section */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground px-3 mb-3">
                SETTINGS
              </p>
              <div className="space-y-1">
                {settingsItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.section);
                  return (
                    <button
                      key={item.section}
                      onClick={() =>
                        handleNavigation(item.section, item.href)
                      }
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* Footer Info */}
          <div className="px-4 py-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              wxKanban v1.0
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
