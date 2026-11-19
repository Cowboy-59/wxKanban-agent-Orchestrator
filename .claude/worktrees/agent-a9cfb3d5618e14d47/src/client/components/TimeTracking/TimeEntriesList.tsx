import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface TimeEntry {
  entryid: string;
  projectid: string;
  taskid?: string;
  starttime: string;
  endtime?: string;
  duration?: number;
  description?: string;
  billable: boolean;
  invoiced: boolean;
  createdAt: string;
}

interface TimeEntriesListProps {
  projectid?: string;
  limit?: number;
}

export const TimeEntriesList: React.FC<TimeEntriesListProps> = ({
  projectid,
  limit = 50,
}) => {
  const [showBillableOnly, setShowBillableOnly] = useState(false);

  // Fetch time entries
  const { data: entriesData, isLoading, refetch } = useQuery({
    queryKey: ['timeEntries', projectid, showBillableOnly],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
        billableOnly: String(showBillableOnly),
      });
      if (projectid) {
        params.append('projectid', projectid);
      }

      const response = await fetch(`/api/time-tracking/entries?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch entries');
      return response.json();
    },
  });

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: async (entryid: string) => {
      const response = await fetch(`/api/time-tracking/entries/${entryid}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete entry');
      return response.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  const entries = entriesData?.entries as TimeEntry[] | undefined;

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600">No time entries yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Time Entries</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showBillableOnly}
            onChange={(e) => setShowBillableOnly(e.target.checked)}
            className="rounded border-slate-300"
          />
          Billable only
        </label>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.entryid}
            className={`p-4 rounded-lg border ${
              entry.invoiced
                ? 'bg-slate-50 border-slate-200'
                : entry.billable
                  ? 'bg-green-50 border-green-200'
                  : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">
                    {entry.description || 'No description'}
                  </p>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                    {formatDuration(entry.duration || 0)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {formatDateTime(entry.starttime)}
                  {entry.endtime && ` - ${new Date(entry.endtime).toLocaleTimeString()}`}
                </p>
              </div>
              <button
                onClick={() => deleteEntryMutation.mutate(entry.entryid)}
                disabled={entry.invoiced || deleteEntryMutation.isPending}
                className="text-red-600 hover:text-red-700 disabled:text-slate-300 text-sm font-medium transition"
              >
                Delete
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={entry.billable}
                  disabled
                  className="rounded border-slate-300"
                />
                {entry.billable ? 'Billable' : 'Non-billable'}
              </label>
              {entry.invoiced && (
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                  Invoiced
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="text-right text-xs text-slate-600">
        Showing {entries.length} entries
      </div>
    </div>
  );
};

export default TimeEntriesList;
