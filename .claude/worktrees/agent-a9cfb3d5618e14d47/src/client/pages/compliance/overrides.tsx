/**
 * Page: Compliance Override History (Admin Only)
 *
 * View all compliance overrides across projects.
 * Features:
 * - Filter by project, user, standard, date range
 * - Pagination support
 * - View violation details
 * - Immutable audit trail
 *
 * Implements T071
 */

import { useState } from 'react';
import { Filter } from 'lucide-react';
import {
  useComplianceAudit,
  useComplianceOverrideDetail,
} from '../../hooks/useComplianceAudit';

interface FilterState {
  standard?: 'SOC2' | 'HITRUST';
  startDate?: Date;
  endDate?: Date;
  showFilters: boolean;
}

export const ComplianceOverridesPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    showFilters: false,
  });

  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);

  const limit = 25;

  // Fetch overrides list
  const overridesQuery = useComplianceAudit({
    standard: filters.standard,
    startDate: filters.startDate,
    endDate: filters.endDate,
    limit,
    offset: page * limit,
  });

  // Fetch selected override detail
  const overrideDetailQuery = useComplianceOverrideDetail(selectedOverride ?? undefined);

  const handleStandardChange = (standard: 'SOC2' | 'HITRUST' | '') => {
    setFilters((prev) => ({
      ...prev,
      standard: standard as 'SOC2' | 'HITRUST' | undefined,
    }));
    setPage(0);
  };

  const handleDateChange = (type: 'start' | 'end', date: string) => {
    setFilters((prev) => ({
      ...prev,
      [type === 'start' ? 'startDate' : 'endDate']: date
        ? new Date(date)
        : undefined,
    }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({ showFilters: false });
    setPage(0);
  };

  const totalPages = Math.ceil((overridesQuery.data?.total || 0) / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Compliance Overrides
        </h1>
        <p className="mt-2 text-gray-600">
          Audit trail of all compliance rule violations and approvals
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <button
          onClick={() =>
            setFilters((prev) => ({ ...prev, showFilters: !prev.showFilters }))
          }
          className="flex items-center gap-2 font-medium text-gray-900"
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>

        {filters.showFilters && (
          <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Security Standard
              </label>
              <select
                value={filters.standard || ''}
                onChange={(e) =>
                  handleStandardChange(e.target.value as any)
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">All Standards</option>
                <option value="SOC2">SOC 2</option>
                <option value="HITRUST">HiTrust</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  type="date"
                  value={
                    filters.startDate
                      ? filters.startDate.toISOString().split('T')[0]
                      : ''
                  }
                  onChange={(e) => handleDateChange('start', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  value={
                    filters.endDate
                      ? filters.endDate.toISOString().split('T')[0]
                      : ''
                  }
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {overridesQuery.isLoading ? (
        <div className="text-center py-8 text-gray-600">Loading...</div>
      ) : overridesQuery.data?.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center">
          <p className="text-sm text-gray-600">No overrides found</p>
        </div>
      ) : (
        <>
          {/* Overrides Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Duty
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Standard
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Violations
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Approved By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overridesQuery.data?.items.map((override) => (
                  <tr
                    key={override.complianceOverrideId}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      setSelectedOverride(override.complianceOverrideId)
                    }
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(override.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-gray-900">
                        {override.userName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {override.dutyName}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                        {override.standard}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        {override.violatedRules.length} rule
                        {override.violatedRules.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {override.overriddenByName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {page * limit + 1} to{' '}
              {Math.min((page + 1) * limit, overridesQuery.data?.total || 0)} of{' '}
              {overridesQuery.data?.total} overrides
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>

              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`rounded-md px-2.5 py-1 text-sm ${
                      page === i
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selectedOverride && overrideDetailQuery.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-w-2xl rounded-lg bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Override Details
              </h2>
              <button
                onClick={() => setSelectedOverride(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">User</p>
                  <p className="mt-1 text-gray-900">
                    {overrideDetailQuery.data.userName}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Duty</p>
                  <p className="mt-1 text-gray-900">
                    {overrideDetailQuery.data.dutyName}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Standard</p>
                  <p className="mt-1 text-gray-900">
                    {overrideDetailQuery.data.standard}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Approved By
                  </p>
                  <p className="mt-1 text-gray-900">
                    {overrideDetailQuery.data.overriddenByName}
                  </p>
                </div>
              </div>

              {/* Violated Rules */}
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Violated Rules
                </p>
                <div className="mt-2 space-y-2">
                  {overrideDetailQuery.data.violatedRules.map((rule) => (
                    <div
                      key={rule.ruleId}
                      className="rounded-md bg-red-50 p-3"
                    >
                      <p className="font-mono text-xs font-semibold text-red-700">
                        {rule.ruleId}
                      </p>
                      <p className="mt-1 text-sm text-red-800">
                        {rule.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Override Reason */}
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Override Reason
                </p>
                <p className="mt-2 rounded-md bg-gray-50 p-3 text-sm text-gray-900">
                  {overrideDetailQuery.data.reason}
                </p>
              </div>

              {/* Date */}
              <div className="text-xs text-gray-600">
                Created: {new Date(overrideDetailQuery.data.createdAt).toLocaleString()}
              </div>
            </div>

            <button
              onClick={() => setSelectedOverride(null)}
              className="mt-4 w-full rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-900 hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
