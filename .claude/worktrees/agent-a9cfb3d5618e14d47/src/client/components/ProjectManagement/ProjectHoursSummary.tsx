import React from 'react';
import { useQuery } from '@tanstack/react-query';

interface ProjectHoursSummaryProps {
  projectid: string;
}

export const ProjectHoursSummary: React.FC<ProjectHoursSummaryProps> = ({ projectid }) => {
  const { data: hoursData, isLoading, error } = useQuery({
    queryKey: ['projectHours', projectid],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectid}/hours`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch hours');
      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Failed to load hours summary
      </div>
    );
  }

  const h = hoursData?.hours;
  if (!h) return null;

  const getBudgetStatusColor = (percentage: number) => {
    if (percentage >= 100) return 'text-red-600';
    if (percentage >= 80) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getBudgetBarColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Hours Card */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-medium text-slate-600">Total Hours</p>
        <p className="text-3xl font-bold text-slate-900 mt-2">{h.totalHours.toFixed(1)}</p>
        <p className="text-xs text-slate-500 mt-1">Billable + Non-billable</p>
      </div>

      {/* Billable Hours Card */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-medium text-slate-600">Billable Hours</p>
        <p className="text-3xl font-bold text-blue-600 mt-2">{h.billableHours.toFixed(1)}</p>
        <p className="text-xs text-slate-500 mt-1">@ ${h.hourlyRate}/hour</p>
      </div>

      {/* Non-Billable Hours Card */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-medium text-slate-600">Non-Billable Hours</p>
        <p className="text-3xl font-bold text-slate-600 mt-2">{h.nonBillableHours.toFixed(1)}</p>
        <p className="text-xs text-slate-500 mt-1">Administrative/Internal</p>
      </div>

      {/* Projected Total Card */}
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-medium text-slate-600">Projected Total</p>
        <p className="text-3xl font-bold text-green-600 mt-2">${h.projectedTotal.toFixed(2)}</p>
        <p className="text-xs text-slate-500 mt-1">Based on billable hours</p>
      </div>

      {/* Budget Tracking - Full Width */}
      <div className="md:col-span-2 lg:col-span-4 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Budget Status</h3>
          <span className={`text-lg font-bold ${getBudgetStatusColor(h.budgetPercentage)}`}>
            {h.budgetPercentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="w-full bg-slate-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${getBudgetBarColor(h.budgetPercentage)}`}
              style={{ width: `${Math.min(h.budgetPercentage, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Hours Breakdown */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-600">Hours Used</p>
            <p className="text-lg font-semibold text-slate-900">{h.totalHours.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Hours Remaining</p>
            <p className={`text-lg font-semibold ${h.remainingHours > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {h.remainingHours.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Total Allocated</p>
            <p className="text-lg font-semibold text-slate-900">{h.allocatedHours.toFixed(1)}</p>
          </div>
        </div>

        {/* Warning Messages */}
        {h.budgetPercentage >= 100 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">
              ⚠️ Project budget exceeded by {(h.budgetPercentage - 100).toFixed(0)}%
            </p>
          </div>
        )}

        {h.budgetPercentage >= 80 && h.budgetPercentage < 100 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700 font-medium">
              ⚠️ Approaching budget limit: {h.remainingHours.toFixed(1)} hours remaining
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectHoursSummary;
