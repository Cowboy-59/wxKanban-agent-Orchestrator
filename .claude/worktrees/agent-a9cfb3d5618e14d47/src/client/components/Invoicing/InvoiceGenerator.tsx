import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

interface InvoiceGeneratorProps {
  projectid?: string;
  onInvoiceGenerated?: (invoiceid: string) => void;
}

export const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({
  projectid,
  onInvoiceGenerated,
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hourlyRate, setHourlyRate] = useState('50');
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Generate invoice mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          projectid,
          startdate: startDate,
          enddate: endDate,
          hourlyRate: parseFloat(hourlyRate),
          taxRate: taxRate ? parseFloat(taxRate) : undefined,
          notes: notes || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate invoice');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Clear form
      setStartDate('');
      setEndDate('');
      setHourlyRate('50');
      setTaxRate('0');
      setNotes('');
      setErrors({});

      if (onInvoiceGenerated) {
        onInvoiceGenerated(data.invoice.invoiceid);
      }
    },
    onError: (error: Error) => {
      setErrors({ submit: error.message });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!endDate) {
      newErrors.endDate = 'End date is required';
    }

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      newErrors.dateRange = 'End date must be after start date';
    }

    if (!hourlyRate || parseFloat(hourlyRate) <= 0) {
      newErrors.hourlyRate = 'Hourly rate must be greater than 0';
    }

    if (taxRate && parseFloat(taxRate) < 0) {
      newErrors.taxRate = 'Tax rate must be 0 or greater';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      generateInvoiceMutation.mutate();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Generate Invoice</h3>

      {errors.submit && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{errors.submit}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-slate-900 mb-1">
              Start Date *
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                errors.startDate
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:ring-blue-500'
              }`}
              disabled={generateInvoiceMutation.isPending}
            />
            {errors.startDate && (
              <p className="text-red-600 text-sm mt-1">{errors.startDate}</p>
            )}
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-slate-900 mb-1">
              End Date *
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                errors.endDate
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:ring-blue-500'
              }`}
              disabled={generateInvoiceMutation.isPending}
            />
            {errors.endDate && (
              <p className="text-red-600 text-sm mt-1">{errors.endDate}</p>
            )}
          </div>
        </div>

        {errors.dateRange && (
          <p className="text-red-600 text-sm">{errors.dateRange}</p>
        )}

        {/* Rates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="hourlyRate" className="block text-sm font-medium text-slate-900 mb-1">
              Hourly Rate (USD) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-600">$</span>
              <input
                id="hourlyRate"
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="50.00"
                step="0.01"
                min="0"
                className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  errors.hourlyRate
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                disabled={generateInvoiceMutation.isPending}
              />
            </div>
            {errors.hourlyRate && (
              <p className="text-red-600 text-sm mt-1">{errors.hourlyRate}</p>
            )}
          </div>

          <div>
            <label htmlFor="taxRate" className="block text-sm font-medium text-slate-900 mb-1">
              Tax Rate (%)
            </label>
            <input
              id="taxRate"
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="0"
              step="0.01"
              min="0"
              max="100"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                errors.taxRate
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-300 focus:ring-blue-500'
              }`}
              disabled={generateInvoiceMutation.isPending}
            />
            {errors.taxRate && (
              <p className="text-red-600 text-sm mt-1">{errors.taxRate}</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-900 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes for the invoice..."
            maxLength={1000}
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={generateInvoiceMutation.isPending}
          />
          <p className="text-xs text-slate-500 mt-1">
            {notes.length}/1000 characters
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={generateInvoiceMutation.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          {generateInvoiceMutation.isPending ? 'Generating Invoice...' : 'Generate Invoice'}
        </button>
      </form>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-slate-600">
        <p className="font-medium mb-2">ℹ️ Invoice Details</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Only billable time entries from the selected period will be included</li>
          <li>Already invoiced entries will not be included</li>
          <li>Invoice status will be set to DRAFT for review</li>
          <li>Due date will be set to 30 days from invoice date</li>
        </ul>
      </div>
    </div>
  );
};

export default InvoiceGenerator;
