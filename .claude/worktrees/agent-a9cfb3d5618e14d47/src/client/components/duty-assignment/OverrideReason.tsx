/**
 * Component: OverrideReasonInput
 *
 * Text input for compliance override reason with character counter.
 * Features:
 * - Minimum 50 character requirement
 * - Real-time character count
 * - Visual feedback on validity
 * - Required indicator
 *
 * Implements T062
 */

import React from 'react';

interface OverrideReasonInputProps {
  value: string;
  onChange: (reason: string) => void;
  required?: boolean;
  minChars?: number;
}

const MIN_CHARS = 50;

export const OverrideReasonInput: React.FC<OverrideReasonInputProps> = ({
  value,
  onChange,
  required = false,
  minChars = MIN_CHARS,
}) => {
  const charCount = value.length;
  const isValid = charCount >= minChars;
  const isNearValid = charCount >= minChars - 10;

  return (
    <div className="space-y-2">
      <label htmlFor="override-reason" className="block text-sm font-medium">
        {required ? (
          <>
            Override Reason <span className="text-red-600">*</span>
          </>
        ) : (
          'Override Reason'
        )}
      </label>

      <textarea
        id="override-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Explain why this compliance violation is necessary..."
        className={`block w-full rounded-md border shadow-sm focus:ring-blue-500 focus:border-blue-500 ${
          isValid
            ? 'border-green-300'
            : isNearValid
              ? 'border-yellow-300'
              : 'border-gray-300'
        }`}
        rows={4}
      />

      {/* Character Count */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600">
          <span className={isValid ? 'text-green-600' : 'text-gray-600'}>
            {charCount}
          </span>
          /{minChars} characters
        </div>

        {!isValid && (
          <div className="text-xs font-medium text-gray-600">
            {minChars - charCount} more characters required
          </div>
        )}

        {isValid && (
          <div className="flex items-center gap-1 text-xs font-medium text-green-600">
            <span>✓</span> Valid
          </div>
        )}
      </div>

      {/* Helper Text */}
      <p className="text-xs text-gray-500">
        Provide a detailed business reason for overriding compliance rules.
        Minimum 50 characters required.
      </p>
    </div>
  );
};
