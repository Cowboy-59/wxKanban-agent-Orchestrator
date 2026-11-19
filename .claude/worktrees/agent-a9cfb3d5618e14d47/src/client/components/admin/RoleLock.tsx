import { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "../../i18n";

interface RoleLockProps {
  requiredUsertype: "ADMIN" | "TEAM_MANAGER";
  featureName: string;
  children: ReactNode;
}

/**
 * Wraps a section in a role gate. If the user's usertype meets the requirement,
 * renders children normally. Otherwise renders a role-locked state ("Requires Admin").
 * Used for TEAM_MANAGER's locked nav items (billing, invoices, reports).
 */
export function RoleLock({ requiredUsertype, featureName, children }: RoleLockProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const usertype = user?.usertype ?? "TEAM_MEMBER";

  // ADMIN satisfies all role requirements
  if (usertype === "ADMIN") {
    return <>{children}</>;
  }

  // TEAM_MANAGER satisfies TEAM_MANAGER requirements
  if (requiredUsertype === "TEAM_MANAGER" && usertype === "TEAM_MANAGER") {
    return <>{children}</>;
  }

  return (
    <div className="relative rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300">{featureName}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("roleLock.contactAdmin")}
          </p>
        </div>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
          {t("roleLock.requiresAdmin")}
        </span>
      </div>
    </div>
  );
}
