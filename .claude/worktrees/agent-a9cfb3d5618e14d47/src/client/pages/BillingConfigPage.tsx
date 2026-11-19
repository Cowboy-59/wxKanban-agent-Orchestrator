import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/client/components/ui/Card';
import { Button } from '~/client/components/ui/Button';
import { Input } from '~/client/components/ui/Input';
import { DollarSign, Users, FolderKanban, Building2, Loader2, Save, Info } from 'lucide-react';
import { useTranslation } from '~/client/i18n'; // [SCOPE 052]

interface BillingRateConfig {
  companyDefaultRate: number | null;
  projectRates: Array<{
    projectid: string;
    projectname: string;
    rate: number | null;
  }>;
  userRates: Array<{
    userid: string;
    username: string;
    rate: number | null;
  }>;
}

export function BillingConfigPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [companyRate, setCompanyRate] = useState<string>('');
  const [projectRates, setProjectRates] = useState<Record<string, string>>({});
  const [userRates, setUserRates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch billing rates
  const { data: rates, isLoading } = useQuery({
    queryKey: ['billing-rates'],
    queryFn: async (): Promise<BillingRateConfig> => {
      const response = await fetch('/api/company/billing/rates', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error(t('billing.fetchError'));
      return response.json().then(r => r.data);
    },
  });

  // Update billing rate mutation
  const updateRateMutation = useMutation({
    mutationFn: async (params: { rate: number; projectid?: string; userid?: string }) => {
      const response = await fetch('/api/company/billing/rates', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error(t('billing.updateError'));
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-rates'] });
      setSuccess(t('billing.updateSuccess'));
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t('billing.updateError'));
      setTimeout(() => setError(null), 5000);
    },
  });

  // Initialize form values when data loads
  useEffect(() => {
    if (rates) {
      setCompanyRate(rates.companyDefaultRate?.toString() || '');
      
      const projectMap: Record<string, string> = {};
      rates.projectRates.forEach(p => {
        projectMap[p.projectid] = p.rate?.toString() || '';
      });
      setProjectRates(projectMap);

      const userMap: Record<string, string> = {};
      rates.userRates.forEach(u => {
        userMap[u.userid] = u.rate?.toString() || '';
      });
      setUserRates(userMap);
    }
  }, [rates]);

  const handleSaveCompanyRate = () => {
    const rate = parseFloat(companyRate);
    if (isNaN(rate) || rate < 0) {
      setError(t('billing.invalidRate'));
      return;
    }
    updateRateMutation.mutate({ rate });
  };

  const handleSaveProjectRate = (projectid: string) => {
    const rateStr = projectRates[projectid];
    const rate = rateStr === '' ? null : parseFloat(rateStr);
    if (rate !== null && (isNaN(rate) || rate < 0)) {
      setError(t('billing.invalidRate'));
      return;
    }
    updateRateMutation.mutate({ rate: rate || 0, projectid });
  };

  const handleSaveUserRate = (userid: string) => {
    const rateStr = userRates[userid];
    const rate = rateStr === '' ? null : parseFloat(rateStr);
    if (rate !== null && (isNaN(rate) || rate < 0)) {
      setError(t('billing.invalidRate'));
      return;
    }
    updateRateMutation.mutate({ rate: rate || 0, userid });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('billing.title')}</h1>
        <p className="text-gray-600 mt-2">
          {t('billing.subtitle')}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {success}
        </div>
      )}

      {/* Rate Hierarchy Info */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="text-blue-800">
          <strong>{t('billing.resolutionTitle')}</strong> {t('billing.resolutionBody')}
        </div>
      </div>

      {/* Company Default Rate */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t('billing.companyRate')}</CardTitle>
              <CardDescription>{t('billing.companyRateDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('billing.hourlyRate')}</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={companyRate}
                  onChange={(e) => setCompanyRate(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button 
              onClick={handleSaveCompanyRate}
              disabled={updateRateMutation.isPending}
            >
              {updateRateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Project-Specific Rates */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FolderKanban className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t('billing.projectRates')}</CardTitle>
              <CardDescription>{t('billing.projectRatesDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rates?.projectRates.length === 0 ? (
            <p className="text-gray-500 text-center py-4">{t('reports.noProjects')}</p>
          ) : (
            <div className="space-y-4">
              {rates?.projectRates.map((project) => (
                <div key={project.projectid} className="flex items-end gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-700">
                      {project.projectname}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t('billing.projectIdLabel', { id: project.projectid })}</div>
                  </div>
                  <div className="w-48">
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t('billing.defaultPlaceholder')}
                        value={projectRates[project.projectid] || ''}
                        onChange={(e) => setProjectRates(prev => ({
                          ...prev,
                          [project.projectid]: e.target.value
                        }))}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    onClick={() => handleSaveProjectRate(project.projectid)}
                    disabled={updateRateMutation.isPending}
                  >
                    {updateRateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User-Specific Rates */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t('billing.userRates')}</CardTitle>
              <CardDescription>{t('billing.userRatesDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rates?.userRates.length === 0 ? (
            <p className="text-gray-500 text-center py-4">{t('billing.noTeamMembers')}</p>
          ) : (
            <div className="space-y-4">
              {rates?.userRates.map((user) => (
                <div key={user.userid} className="flex items-end gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-700">
                      {user.username}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${user.rate ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {user.rate ? t('billing.customRate') : t('billing.usingDefault')}
                      </span>
                    </div>
                  </div>
                  <div className="w-48">
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t('billing.defaultPlaceholder')}
                        value={userRates[user.userid] || ''}
                        onChange={(e) => setUserRates(prev => ({
                          ...prev,
                          [user.userid]: e.target.value
                        }))}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    onClick={() => handleSaveUserRate(user.userid)}
                    disabled={updateRateMutation.isPending}
                  >
                    {updateRateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
