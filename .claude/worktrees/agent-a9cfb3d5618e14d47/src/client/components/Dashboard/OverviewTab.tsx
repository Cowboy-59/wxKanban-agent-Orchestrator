import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface CompanyStats {
  activeUsers: number;
  pendingInvitations: number;
  activeProjects: number;
  totalTasks: number;
}

interface CompanyInfo {
  id: string;
  companyName: string;
  subscriptionTier: "FREE" | "CONSULTANT" | "ENTERPRISE";
  subscriptionStatus: string;
  maxUsers: number;
  usersCount: number;
}

export function OverviewTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [stats, setStats] = useState<CompanyStats | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch company info
      const companyResponse = await fetch("/api/company");
      if (!companyResponse.ok) {
        throw new Error("Failed to fetch company info");
      }
      const companyData = await companyResponse.json();
      setCompanyInfo(companyData);

      // Fetch company stats
      const statsResponse = await fetch("/api/company/stats");
      if (!statsResponse.ok) {
        throw new Error("Failed to fetch stats");
      }
      const statsData = await statsResponse.json();
      setStats(statsData);

      // Data loaded
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Failed to load overview data:", message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          <p className="mt-4 text-muted-foreground">Loading overview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-destructive mb-2">Error Loading Data</h3>
            <p className="text-sm text-destructive/80 mb-4">{error}</p>
            <button onClick={fetchData} className="px-4 py-2 border border-destructive rounded-lg text-sm font-medium hover:bg-destructive/10 transition-colors">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subscription Status Card */}
      <div className="rounded-lg border border-border p-6 bg-background">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Subscription Status</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Your current plan and usage
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
            <p className="text-2xl font-bold">
              {companyInfo?.subscriptionTier}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground mb-1">Renewal Date</p>
            <p className="text-2xl font-bold">
              {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground mb-1">Status</p>
            <p className="text-2xl font-bold text-green-600">Active</p>
          </div>
        </div>
      </div>

      {/* User Limit Card */}
      <div className="rounded-lg border border-border p-6 bg-background">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-semibold">Team Members</h3>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                {companyInfo?.usersCount || 0} of {companyInfo?.maxUsers || 5}{" "}
                users
              </p>
              <p className="text-sm text-muted-foreground">
                {companyInfo?.maxUsers
                  ? Math.round(
                      ((companyInfo.usersCount || 0) /
                        (companyInfo.maxUsers || 1)) *
                        100
                    )
                  : 0}
                %
              </p>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${
                    companyInfo?.maxUsers
                      ? ((companyInfo.usersCount || 0) /
                          (companyInfo.maxUsers || 1)) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {companyInfo && companyInfo.maxUsers - companyInfo.usersCount > 0
              ? `${companyInfo.maxUsers - companyInfo.usersCount} slots remaining`
              : "At capacity"}
          </p>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border p-6 bg-background">
          <p className="text-sm text-muted-foreground mb-2">Active Members</p>
          <p className="text-3xl font-bold">{stats?.activeUsers || 0}</p>
        </div>

        <div className="rounded-lg border border-border p-6 bg-background">
          <p className="text-sm text-muted-foreground mb-2">Pending Invitations</p>
          <p className="text-3xl font-bold text-amber-600">
            {stats?.pendingInvitations || 0}
          </p>
        </div>

        <div className="rounded-lg border border-border p-6 bg-background">
          <p className="text-sm text-muted-foreground mb-2">Active Projects</p>
          <p className="text-3xl font-bold">{stats?.activeProjects || 0}</p>
        </div>

        <div className="rounded-lg border border-border p-6 bg-background">
          <p className="text-sm text-muted-foreground mb-2">Total Tasks</p>
          <p className="text-3xl font-bold">{stats?.totalTasks || 0}</p>
        </div>
      </div>

      {/* Onboarding Checklist */}
      <div className="rounded-lg border border-border p-6 bg-background">
        <h3 className="text-lg font-semibold mb-4">Onboarding Checklist</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
            <span className="text-sm">Email verified</span>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
            <span className="text-sm">Admin account created</span>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 mt-0.5" />
            <button
              onClick={() => navigate("/dashboard/team")}
              className="text-sm text-primary hover:underline"
            >
              Invite team members (optional)
            </button>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 mt-0.5" />
            <button
              onClick={() => navigate("/dashboard/integrations")}
              className="text-sm text-primary hover:underline"
            >
              Connect PM systems (optional)
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade CTA for Free Plan */}
      {companyInfo?.subscriptionTier === "FREE" && (
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">Ready to Scale?</h3>
              <p className="text-sm text-muted-foreground">
                Upgrade to Consultant or Enterprise to unlock unlimited users,
                advanced features, and priority support.
              </p>
            </div>
            <button onClick={() => navigate("/dashboard/billing")} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
              View Plans
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
