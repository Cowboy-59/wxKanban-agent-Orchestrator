import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, 
  Users, 
  Settings, 
  Activity, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatBillingPlan } from '../../lib/billingPlan';

import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { MetricsCard } from '../../components/MetricsCard';



// API response interface (matches backend)
interface ApiMetrics {
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  suspendedCompanies: number;
  totalUsers: number;
  activeUsers: number;
  mrr: number;
  churnRate: number;
  timestamp: string;
}

interface SystemHealth {
  database: string;
  api: string;
  email: string;
  payments: string;
  queue: string;
  timestamp: string;
}

export default function SysAdminDashboard() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch {
      // logout failure is non-critical
    }
  };


  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch metrics
      const metricsRes = await fetch('/api/sysadmin/metrics', {
        credentials: 'include',
      });
      
      if (!metricsRes.ok) {
        if (metricsRes.status === 401) {
          navigate('/login');
          return;
        }
        if (metricsRes.status === 403) {
          navigate('/dashboard');
          return;
        }
        throw new Error('Failed to load metrics');
      }

      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      // Fetch health
      const healthRes = await fetch('/api/sysadmin/health', {
        credentials: 'include',
      });
      
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData);
      }
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              My System Dashboard
              <span className="ml-2 text-slate-500 font-normal">—</span>
              <span className="ml-2 text-indigo-400 font-semibold">
                {formatBillingPlan(user?.billingplan)}
              </span>
            </h1>

            <p className="text-slate-400 mt-1">
              Platform Administration • Last updated: {new Date(metrics.timestamp).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/sysadmin/companies')}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <Building2 className="mr-2 h-4 w-4" />
              Companies
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/sysadmin/users')}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <Users className="mr-2 h-4 w-4" />
              Users
            </Button>
            <Button
              onClick={() => navigate('/sysadmin/settings')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="border-red-600 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>


        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricsCard
            title="Total Companies"
            value={metrics.totalCompanies}
            subtitle={`${metrics.activeCompanies} active, ${metrics.trialCompanies} trial`}
            trend={metrics.activeCompanies > 0 ? "up" : "neutral"}
            trendValue={`${metrics.activeCompanies} active`}
            icon={<Building2 className="h-5 w-5 text-blue-500" />}
          />
          <MetricsCard
            title="Total Users"
            value={metrics.totalUsers}
            subtitle={`${metrics.activeUsers} active users`}
            trend="up"
            trendValue={`${Math.round((metrics.activeUsers / metrics.totalUsers) * 100)}% active rate`}
            icon={<Users className="h-5 w-5 text-green-500" />}
          />
          <MetricsCard
            title="Monthly Revenue"
            value={formatCurrency(metrics.mrr)}
            subtitle="MRR"
            trend="up"
            trendValue="MRR"
            icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
          />
          <MetricsCard
            title="Suspended"
            value={metrics.suspendedCompanies}
            subtitle="Companies"
            trend={metrics.suspendedCompanies > 0 ? "down" : "neutral"}
            trendValue={`${metrics.churnRate}% churn`}
            icon={<AlertTriangle className="h-5 w-5 text-yellow-500" />}
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company Status */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Overview
              </CardTitle>
              <CardDescription className="text-slate-400">
                Breakdown of companies by status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-700/50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-white">{metrics.totalCompanies}</div>
                  <div className="text-sm text-slate-400">Total</div>
                </div>
                <div className="bg-green-500/10 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-400">{metrics.activeCompanies}</div>
                  <div className="text-sm text-slate-400">Active</div>
                </div>
                <div className="bg-yellow-500/10 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-400">{metrics.trialCompanies}</div>
                  <div className="text-sm text-slate-400">Trial</div>
                </div>
                <div className="bg-red-500/10 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-400">{metrics.suspendedCompanies}</div>
                  <div className="text-sm text-slate-400">Suspended</div>
                </div>
              </div>
              
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/sysadmin/companies')}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  View All Companies
                </Button>
                <Button
                  onClick={() => navigate('/sysadmin/companies/new')}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Create Company
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Health */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Health
              </CardTitle>
              <CardDescription className="text-slate-400">
                Platform component status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {health ? (
                <div className="space-y-3">
                  <HealthItem 
                    name="Database" 
                    status={health.database} 
                  />
                  <HealthItem 
                    name="API" 
                    status={health.api} 
                  />
                  <HealthItem 
                    name="Email" 
                    status={health.email} 
                  />
                  <HealthItem 
                    name="Payments" 
                    status={health.payments} 
                  />
                  <HealthItem 
                    name="Queue" 
                    status={health.queue} 
                  />
                </div>
              ) : (
                <div className="text-slate-400 text-center py-4">
                  Health data unavailable
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => navigate('/sysadmin/metrics')}
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  View Detailed Metrics
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
            <CardDescription className="text-slate-400">
              Common SysAdmin tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <Button
                variant="outline"
                onClick={() => navigate('/sysadmin/users')}
                className="h-auto py-4 border-slate-600 text-slate-300 hover:bg-slate-800 flex flex-col items-start"
              >
                <Users className="h-6 w-6 mb-2" />
                <span className="font-semibold">Manage Users</span>
                <span className="text-sm text-slate-400">Search and manage all users</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/sysadmin/settings')}
                className="h-auto py-4 border-slate-600 text-slate-300 hover:bg-slate-800 flex flex-col items-start"
              >
                <Settings className="h-6 w-6 mb-2" />
                <span className="font-semibold">System Settings</span>
                <span className="text-sm text-slate-400">Configure platform settings</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/sysadmin/metrics')}
                className="h-auto py-4 border-slate-600 text-slate-300 hover:bg-slate-800 flex flex-col items-start"
              >
                <Activity className="h-6 w-6 mb-2" />
                <span className="font-semibold">Platform Metrics</span>
                <span className="text-sm text-slate-400">View detailed analytics</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/sysadmin/audit')}
                className="h-auto py-4 border-slate-600 text-slate-300 hover:bg-slate-800 flex flex-col items-start"
              >
                <AlertTriangle className="h-6 w-6 mb-2" />
                <span className="font-semibold">Audit Logs</span>
                <span className="text-sm text-slate-400">Review system activity</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>


  );
}

/**
 * Health status indicator component
 */
function HealthItem({ 
  name, 
  status
}: { 
  name: string; 
  status: string;
}) {
  const isHealthy = status === 'healthy';
  const isWarning = status === 'warning';
  
  return (
    <div className="flex items-center justify-between p-2 rounded bg-slate-700/30">
      <div className="flex items-center gap-2">
        <span className={isHealthy ? 'text-green-400' : isWarning ? 'text-yellow-400' : 'text-red-400'}>
          {isHealthy ? <CheckCircle className="h-4 w-4" /> : isWarning ? <AlertTriangle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </span>
        <span className="text-slate-300 text-sm">{name}</span>
      </div>
      <span className={`text-xs capitalize ${
        isHealthy ? 'text-green-400' : isWarning ? 'text-yellow-400' : 'text-red-400'
      }`}>
        {status}
      </span>
    </div>
  );
}
