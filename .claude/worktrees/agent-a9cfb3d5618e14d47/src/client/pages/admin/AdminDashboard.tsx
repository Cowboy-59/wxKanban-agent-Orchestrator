import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n'; // [SCOPE 052]
import CompanyMetrics from '../../components/Dashboard/CompanyMetrics';
import TeamSummary from '../../components/Dashboard/TeamSummary';
import ProjectSummary from '../../components/Dashboard/ProjectSummary';
import FinancialSummary from '../../components/Dashboard/FinancialSummary';
import ActivityFeed from '../../components/Dashboard/ActivityFeed';
import ProjectProposalsPanel from '../../components/Dashboard/ProjectProposalsPanel';
import PendingTasksSummaryPanel from '../../components/Dashboard/PendingTasksSummaryPanel';

interface DashboardMetrics {
  company: {
    totalUsers: number;
    usersByRole: Array<{ role: string; count: number }>;
    activeUsers: number;
  };
  projects: {
    totalProjects: number;
    activeProjects: number;
  };
  hours: {
    hoursThisMonth: number;
    hoursTrackedThisMonth: number;
  };
  financials: {
    revenueThisMonth: string;
    invoicesThisMonth: number;
    outstandingInvoices: number;
  };
  teamWorkload: {
    totalHours: number;
    averageHoursPerUser: number;
  };
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/company/dashboard', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch dashboard metrics: ${response.status}`);
        }

        const data = await response.json();
        setMetrics(data.data || data);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        console.error('Failed to fetch dashboard metrics:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load dashboard'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    // Set up auto-refresh every 5 minutes
    const interval = setInterval(fetchMetrics, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (!user || user.usertype !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You must be an admin to view this dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {t("dashboard.adminTitle")}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {t("dashboard.lastUpdated", { time: lastUpdated.toLocaleTimeString() })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">{t("dashboard.welcome", { email: user?.email ?? "" })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        ) : metrics ? (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <CompanyMetrics metrics={metrics.company} />
              <ProjectSummary metrics={metrics.projects} />
              <FinancialSummary metrics={metrics.financials} />
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  ⏱️ Hours Tracked
                </h3>
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  {metrics.hours.hoursThisMonth}
                </div>
                <p className="text-sm text-gray-600">This Month</p>
              </div>
            </div>

            {/* Team and Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-1">
                <TeamSummary metrics={metrics.company.usersByRole} />
              </div>
              <div className="lg:col-span-2">
                <ActivityFeed />
              </div>
            </div>

            {/* Project Proposals & Pending Tasks (Spec 024) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <ProjectProposalsPanel />
              <PendingTasksSummaryPanel />
            </div>

            {/* Workload Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                👥 Team Workload
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-gray-600 text-sm">Total Hours (All-time)</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {metrics.teamWorkload.totalHours}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Average per User</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {metrics.teamWorkload.averageHoursPerUser} hrs
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
