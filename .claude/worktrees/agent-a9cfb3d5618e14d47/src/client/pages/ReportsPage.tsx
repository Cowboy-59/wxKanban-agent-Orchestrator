import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/client/components/ui/Card';
import { Button } from '~/client/components/ui/Button';
import { Input } from '~/client/components/ui/Input';
import { Download, Calendar, Loader2, Users, FolderKanban, Clock } from 'lucide-react';
import { useTranslation } from '~/client/i18n'; // [SCOPE 052]

interface TimeReport {
  userid: string;
  username: string;
  totalHours: number;
  billableHours: number;
  projectBreakdown: Array<{
    projectid: string;
    projectname: string;
    hours: number;
  }>;
}

interface ProjectReport {
  projectid: string;
  projectname: string;
  totalHours: number;
  taskCount: number;
  completionRate: number;
  teamMembers: number;
}

export function ReportsPage() {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [activeTab, setActiveTab] = useState<'time' | 'projects'>('time');

  // Fetch time report
  const { data: timeReport, isLoading: timeLoading } = useQuery({
    queryKey: ['time-report', dateRange],
    queryFn: async (): Promise<TimeReport[]> => {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      
      const response = await fetch(`/api/company/billing/reports/time?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch time report');
      return response.json().then(r => r.data);
    },
    enabled: !!dateRange.startDate && !!dateRange.endDate,
  });

  // Fetch project report
  const { data: projectReport, isLoading: projectLoading } = useQuery({
    queryKey: ['project-report'],
    queryFn: async (): Promise<ProjectReport[]> => {
      const response = await fetch('/api/company/billing/reports/projects', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch project report');
      return response.json().then(r => r.data);
    },
  });

  const handleExport = () => {
    // TODO: Implement CSV export
    console.log('Exporting report...');
  };

  const isLoading = activeTab === 'time' ? timeLoading : projectLoading;

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t("reports.title")}</h1>
        <p className="text-gray-600 mt-2">{t("reports.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('time')}
          className={`pb-3 px-4 font-medium text-sm transition-colors ${
            activeTab === 'time'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t("reports.tabTime")}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`pb-3 px-4 font-medium text-sm transition-colors ${
            activeTab === 'projects'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            {t("reports.tabProjects")}
          </div>
        </button>
      </div>

      {/* Time Reports */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          {/* Date Range Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t("reports.dateRange")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("invoices.startDate")}</label>
                  <Input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("invoices.endDate")}</label>
                  <Input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("reports.exportCsv")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Time Report Data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("reports.timeByMember")}
              </CardTitle>
              <CardDescription>{t("reports.timeByMemberDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !timeReport || timeReport.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p>{t("reports.selectDateRange")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t("reports.colMember")}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t("reports.colTotalHours")}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t("reports.colBillableHours")}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t("reports.colBillablePct")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeReport.map((user) => (
                        <tr key={user.userid} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium">{user.username}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{user.totalHours.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{user.billableHours.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              (user.billableHours / user.totalHours) > 0.8
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {user.totalHours > 0 
                                ? ((user.billableHours / user.totalHours) * 100).toFixed(0) 
                                : 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Project Reports */}
      {activeTab === 'projects' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderKanban className="h-5 w-5" />
                  {t("reports.projectPerformance")}
                </CardTitle>
                <CardDescription>{t("reports.projectPerformanceDesc")}</CardDescription>
              </div>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {projectLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !projectReport || projectReport.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FolderKanban className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p>{t("reports.noProjects")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t("reports.colProject")}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t("reports.colHours")}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t("reports.colTasks")}</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">{t("reports.colCompletion")}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t("reports.colTeamSize")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectReport.map((project) => (
                        <tr key={project.projectid} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium">{project.projectname}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{project.totalHours.toFixed(1)}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{project.taskCount}</td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${project.completionRate}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-600">{project.completionRate.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">{project.teamMembers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
