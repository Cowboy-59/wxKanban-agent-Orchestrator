import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { evaluateAccess } from "../../shared/subscription-policy"; // [SCOPE 090 / T008]

interface ProtectedRouteProps {
  children: ReactNode;
}

// [SCOPE 090 / T008] SPEC-090 Amendment A FR-007. The wall's own route, exempt
// from the redirect below — otherwise the guard would bounce the wall into itself.
export const SUBSCRIPTION_WALL_PATH = "/subscription-required";

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, but save the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // [SCOPE 090 / T008] BEGIN — subscription gate (Amendment A, FR-007).
  // The single client-side choke point: authentication alone no longer grants
  // access to the product. `replace` so a walled user cannot reach the app by
  // pressing Back. This is UX enforcement only — the server middleware (FR-009)
  // is what actually protects the API.
  if (location.pathname !== SUBSCRIPTION_WALL_PATH) {
    const access = evaluateAccess({
      subscriptionstatus: user?.subscriptionstatus,
      activeflag: user?.companyactiveflag,
      billingexempt: user?.billingexempt,
      usertype: user?.usertype,
    });
    if (!access.allowed) {
      return <Navigate to={SUBSCRIPTION_WALL_PATH} replace />;
    }
  }
  // [SCOPE 090 / T008] END

  return <>{children}</>;
}
