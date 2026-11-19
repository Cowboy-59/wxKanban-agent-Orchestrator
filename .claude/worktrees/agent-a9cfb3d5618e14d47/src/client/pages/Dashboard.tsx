import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Dashboard router — redirects to the appropriate dashboard based on usertype.
 *
 * - SYSADMIN → /sysadmin/dashboard (platform administration)
 * - ADMIN or TEAM_MANAGER → /admin/dashboard (role-conditional admin shell)
 * - TEAM_MEMBER or unknown → /dashboard/team (basic task-focused view)
 */
export default function DashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const usertype = user?.usertype;

  // SYSADMIN gets platform-level dashboard
  if (usertype === "SYSADMIN") {
    return <Navigate to="/sysadmin/dashboard" replace />;
  }

  // Company-level admins
  if (usertype === "ADMIN" || usertype === "TEAM_MANAGER") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/dashboard/team" replace />;
}
