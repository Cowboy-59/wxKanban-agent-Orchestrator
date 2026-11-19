/**
 * Page: Subscription Duty Types Management
 *
 * Manage custom duty types at subscription level.
 * Features:
 * - Add new custom duties
 * - Remove existing duties (with impact warning)
 * - Show which projects are affected
 * - Filter by security standard
 *
 * Implements T072-T074
 */

import React, { useState } from 'react';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';

interface DutyType {
  dutyName: string;
  securityStandard: 'SOC2' | 'HITRUST';
  projectCount: number;
  isStandard: boolean;
}

interface DialogState {
  open: boolean;
  type: 'add' | 'remove' | null;
  dutyName?: string;
  affectedProjects?: number;
}

export const SubscriptionDutyTypesPage: React.FC = () => {
  const [duties, setDuties] = useState<DutyType[]>([
    {
      dutyName: 'Developer',
      securityStandard: 'SOC2',
      projectCount: 0,
      isStandard: true,
    },
    {
      dutyName: 'Design Coordinator',
      securityStandard: 'SOC2',
      projectCount: 0,
      isStandard: true,
    },
    {
      dutyName: 'System Review',
      securityStandard: 'SOC2',
      projectCount: 0,
      isStandard: true,
    },
    {
      dutyName: 'QA',
      securityStandard: 'SOC2',
      projectCount: 0,
      isStandard: true,
    },
    {
      dutyName: 'Final Acceptance Reviewer',
      securityStandard: 'SOC2',
      projectCount: 0,
      isStandard: true,
    },
    {
      dutyName: 'Publisher',
      securityStandard: 'SOC2',
      projectCount: 0,
      isStandard: true,
    },
    {
      dutyName: 'Security Auditor',
      securityStandard: 'HITRUST',
      projectCount: 3,
      isStandard: false,
    },
    {
      dutyName: 'Compliance Officer',
      securityStandard: 'HITRUST',
      projectCount: 2,
      isStandard: false,
    },
  ]);

  const [newDutyName, setNewDutyName] = useState('');
  const [newDutyStandard, setNewDutyStandard] = useState<
    'SOC2' | 'HITRUST'
  >('SOC2');

  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    type: null,
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleAddDuty = () => {
    if (!newDutyName.trim()) {
      alert('Duty name required');
      return;
    }

    const exists = duties.some(
      (d) =>
        d.dutyName.toLowerCase() === newDutyName.toLowerCase() &&
        d.securityStandard === newDutyStandard
    );

    if (exists) {
      alert('Duty already exists for this standard');
      return;
    }

    const newDuty: DutyType = {
      dutyName: newDutyName.trim(),
      securityStandard: newDutyStandard,
      projectCount: 0,
      isStandard: false,
    };

    setDuties([...duties, newDuty]);
    setNewDutyName('');
    setSuccessMessage('Duty type added successfully');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleRemoveDuty = (dutyName: string) => {
    const duty = duties.find((d) => d.dutyName === dutyName);
    if (!duty || duty.isStandard) return;

    setDialog({
      open: true,
      type: 'remove',
      dutyName,
      affectedProjects: duty.projectCount,
    });
  };

  const confirmRemoveDuty = () => {
    if (dialog.dutyName) {
      setDuties(duties.filter((d) => d.dutyName !== dialog.dutyName));
      setDialog({ open: false, type: null });
      setSuccessMessage('Duty type removed from all projects');
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const customDuties = duties.filter((d) => !d.isStandard);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Custom Duty Types</h1>
        <p className="mt-2 text-gray-600">
          Manage custom duty types available to all projects in your
          subscription
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg bg-green-50 p-4 text-green-700">
          ✓ {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Add New Duty Form */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-1">
          <h2 className="mb-4 text-lg font-semibold">Add Custom Duty</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Duty Name
              </label>
              <input
                type="text"
                value={newDutyName}
                onChange={(e) => setNewDutyName(e.target.value)}
                placeholder="e.g., Security Auditor"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Security Standard
              </label>
              <select
                value={newDutyStandard}
                onChange={(e) =>
                  setNewDutyStandard(e.target.value as 'SOC2' | 'HITRUST')
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="SOC2">SOC 2</option>
                <option value="HITRUST">HiTrust</option>
              </select>
            </div>

            <button
              onClick={handleAddDuty}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Duty Type
            </button>
          </div>
        </div>

        {/* Duty Types List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Standard Duties */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Standard Duties</h2>
            <p className="mb-4 text-sm text-gray-600">
              These duties are built-in and cannot be removed
            </p>

            <div className="space-y-2">
              {duties
                .filter((d) => d.isStandard)
                .map((duty) => (
                  <div
                    key={duty.dutyName}
                    className="flex items-center justify-between rounded-md border border-gray-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {duty.dutyName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {duty.securityStandard}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-600">
                        All Projects
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Custom Duties */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Custom Duties</h2>

            {customDuties.length === 0 ? (
              <p className="text-sm text-gray-600">
                No custom duties created yet
              </p>
            ) : (
              <div className="space-y-2">
                {customDuties.map((duty) => (
                  <div
                    key={duty.dutyName}
                    className="flex items-center justify-between rounded-md border border-gray-200 p-3 hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {duty.dutyName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {duty.securityStandard} • Used in {duty.projectCount}{' '}
                        project{duty.projectCount !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRemoveDuty(duty.dutyName)}
                      className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      title="Remove duty from all projects"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {dialog.open && dialog.type === 'remove' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-w-md rounded-lg bg-white p-6">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 flex-shrink-0 text-yellow-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Remove Duty Type?
                </h2>
                <p className="mt-2 text-sm text-gray-700">
                  This will remove{' '}
                  <strong>{dialog.dutyName}</strong> from all{' '}
                  <strong>{dialog.affectedProjects} projects</strong>. This
                  action cannot be undone.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
                ⚠️ Projects using this duty will have it marked as unavailable
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDialog({ open: false, type: null })}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  onClick={confirmRemoveDuty}
                  className="flex-1 rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
