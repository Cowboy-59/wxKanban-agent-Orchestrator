/**
 * Component: ComplianceWarning
 *
 * Displays compliance rule violations and requires override reason.
 * Features:
 * - Lists violated rules with descriptions
 * - Shows conflicting duties
 * - Override reason input with character count
 * - Cancel/Approve buttons
 *
 * Implements T061
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { OverrideReasonInput } from './OverrideReason';

interface ComplianceViolation {
  ruleId: string;
  reason: string;
  standard: 'SOC2' | 'HITRUST';
  duties: string[];
  severity: 'error' | 'warning';
}

interface ComplianceWarningProps {
  violations: ComplianceViolation[];
  overrideReason: string;
  onReasonChange: (reason: string) => void;
  onCancel?: () => void;
  onApprove?: () => void;
}

export const ComplianceWarning: React.FC<ComplianceWarningProps> = ({
  violations,
  overrideReason,
  onReasonChange,
  onCancel,
  onApprove,
}) => {
  const violationsByStandard = violations.reduce(
    (acc, v) => {
      if (!acc[v.standard]) acc[v.standard] = [];
      acc[v.standard].push(v);
      return acc;
    },
    {} as Record<string, ComplianceViolation[]>
  );

  const isValidReason = overrideReason.trim().length >= 50;

  return (
    <div className="rounded-lg border-l-4 border-l-yellow-400 bg-yellow-50 p-4">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
        <div>
          <h3 className="font-semibold text-yellow-900">
            Compliance Violations Detected
          </h3>
          <p className="mt-1 text-sm text-yellow-700">
            This assignment violates {violations.length} compliance rule
            {violations.length !== 1 ? 's' : ''}. Provide an override reason to
            proceed.
          </p>
        </div>
      </div>

      {/* Violations by Standard */}
      <div className="mb-4 space-y-4">
        {Object.entries(violationsByStandard).map(([standard, rules]) => (
          <div key={standard} className="rounded-md bg-white p-3">
            <p className="mb-2 text-sm font-medium text-gray-900">
              {standard} Violations ({rules.length})
            </p>
            <ul className="space-y-2">
              {rules.map((violation) => (
                <li key={violation.ruleId} className="text-sm text-gray-700">
                  <div className="flex gap-2">
                    <span className="font-mono text-xs font-semibold text-gray-500">
                      {violation.ruleId}
                    </span>
                    <span>{violation.reason}</span>
                  </div>
                  {violation.duties.length > 0 && (
                    <div className="mt-1 ml-4 flex flex-wrap gap-1">
                      {violation.duties.map((duty) => (
                        <span
                          key={duty}
                          className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
                        >
                          {duty}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Override Reason Input */}
      <div className="mb-4">
        <OverrideReasonInput
          value={overrideReason}
          onChange={onReasonChange}
          required={true}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        {onApprove && (
          <button
            type="button"
            onClick={onApprove}
            disabled={!isValidReason}
            className="flex-1 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
          >
            Override & Proceed
          </button>
        )}
      </div>
    </div>
  );
};
