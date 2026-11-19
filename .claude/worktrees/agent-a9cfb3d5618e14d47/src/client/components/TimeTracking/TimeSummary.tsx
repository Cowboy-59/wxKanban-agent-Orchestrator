import React from 'react';
import { useQuery } from '@tanstack/react-query';

interface TimeSummaryProps {
  projectid?: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
}

interface SummaryData {
  totalDuration: number;
  totalDurationFormatted: string;
  billableDuration: number;
  billableDurationFormatted: string;
  entryCount: number;
  billableEntryCount: number;
}

export const TimeSummary: React.FC<TimeSummaryProps> = ({
  projectid,
  dateRange,
}) => {
  // Fetch time summary
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['timeSummary', projectid, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectid) {
        params.append('projectid', projectid);
      }
      if (dateRange) {
        params.append('startDate', dateRange.startDate.toISOString());
        params.append('endDate', dateRange.endDate.toISOString());
      }
      params.append('billableOnly', 'false');

      const response = await fetch(`/api/time-tracking/summary?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch summary');
      return response.json();
    },
  });

  const summary = summaryData?.summary as SummaryData | undefined;

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const billablePercentage =
    summary.totalDuration > 0
      ? ((summary.billableDuration / summary.totalDuration) * 100).toFixed(1)
      : '0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Total Time Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <h3 className="text-sm font-medium text-slate-600 mb-2">Total Time</h3>
        <div className="text-3xl font-bold text-slate-900 mb-1">
          {summary.totalDurationFormatted}
        </div>
        <p className="text-xs text-slate-500">
          {summary.entryCount} {summary.entryCount === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      {/* Billable Time Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
        <h3 className="text-sm font-medium text-slate-600 mb-2">Billable Time</h3>
        <div className="text-3xl font-bold text-slate-900 mb-1">
          {summary.billableDurationFormatted}
        </div>
        <p className="text-xs text-slate-500">
          {billablePercentage}% of total ({summary.billableEntryCount} entries)
        </p>
      </div>

      {/* Progress Bar */}
      <div className="md:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-900">Billable Breakdown</h4>
          <span className="text-xs text-slate-500">{billablePercentage}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${Math.min(Number(billablePercentage), 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="md:col-span-2 grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs text-slate-600 mb-1">Non-billable Time</p>
          <p className="text-lg font-semibold text-slate-900">
            {(() => {
              const nonBillableSeconds =
                summary.totalDuration - summary.billableDuration;
              const hours = Math.floor(nonBillableSeconds / 3600);
              const minutes = Math.floor((nonBillableSeconds % 3600) / 60);
              return `${hours}h ${minutes}m`;
            })()}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {summary.entryCount - summary.billableEntryCount} entries
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs text-slate-600 mb-1">Average per Entry</p>
          <p className="text-lg font-semibold text-slate-900">
            {(() => {
              if (summary.entryCount === 0) return '0h 0m';
              const avgSeconds = summary.totalDuration / summary.entryCount;
              const hours = Math.floor(avgSeconds / 3600);
              const minutes = Math.floor((avgSeconds % 3600) / 60);
              return `${hours}h ${minutes}m`;
            })()}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            per {summary.entryCount > 1 ? 'entry' : 'entry'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TimeSummary;
