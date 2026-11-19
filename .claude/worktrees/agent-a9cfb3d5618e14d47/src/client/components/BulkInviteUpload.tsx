import React, { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@client/components/ui/Button';

import { Upload, FileSpreadsheet, X, Check, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

interface BulkInviteUploadProps {
  onSuccess?: (batchId: string) => void;
  onCancel?: () => void;
}

interface CsvRow {
  email: string;
  usertype?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: string | undefined;
}

interface PreviewData {
  rows: CsvRow[];
  columns: string[];
  valid: boolean;
  errors: string[];
}

/**
 * BulkInviteUpload Component
 * CSV file upload with drag-drop, format validation, and preview
 */
export const BulkInviteUpload: React.FC<BulkInviteUploadProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/invitations/send-bulk', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload CSV');
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (onSuccess) {
        onSuccess(data.batchId);
      }
    },
  });

  const validateCsv = (file: File) => {
    Papa.parse(file, {
      header: true,
      preview: 10, // Preview first 10 rows
      complete: (results: any) => {
        const columns = results.meta.fields || [];
        const errors: string[] = [];

        // Check required columns
        if (!columns.includes('email')) {
          errors.push('CSV must contain an "email" column');
        }

        // Validate rows
        const rows = results.data as CsvRow[];
        rows.forEach((row, index) => {
          if (!row.email || !row.email.includes('@')) {
            errors.push(`Row ${index + 1}: Invalid email "${row.email}"`);
          }
        });

        setPreview({
          rows: rows.slice(0, 10),
          columns,
          valid: errors.length === 0,
          errors,
        });
      },
      error: (error: any) => {
        setPreview({
          rows: [],
          columns: [],
          valid: false,
          errors: [error.message],
        });
      },
    });
  };

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setPreview({
        rows: [],
        columns: [],
        valid: false,
        errors: ['Please upload a CSV file'],
      });
      return;
    }

    setFile(selectedFile);
    validateCsv(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleSubmit = () => {
    if (file && preview?.valid) {
      uploadMutation.mutate(file);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
          }`}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
            Drop your CSV file here
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            or click to browse
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
            id="csv-upload"
          />
          <Button asChild variant="outline">
            <label htmlFor="csv-upload" className="cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Select CSV File
            </label>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{file.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFile}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {preview && (
            <div className="space-y-4">
              {preview.errors.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="font-medium text-red-800 dark:text-red-200">
                      Validation Errors
                    </span>
                  </div>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {preview.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.valid && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Valid CSV Format
                    </span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Found {preview.columns.length} columns: {preview.columns.join(', ')}
                  </p>
                </div>
              )}

              {preview.rows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Preview (first {preview.rows.length} rows):
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          {preview.columns.map((col) => (
                            <th
                              key={col}
                              className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, index) => (
                          <tr
                            key={index}
                            className="border-b border-slate-200 dark:border-slate-700 last:border-0"
                          >
                            {preview.columns.map((col) => (
                              <td
                                key={col}
                                className="px-4 py-2 text-slate-600 dark:text-slate-400"
                              >
                                {row[col] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1"
          disabled={uploadMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!file || !preview?.valid || uploadMutation.isPending}
          className="flex-1"
        >
          {uploadMutation.isPending ? 'Uploading...' : 'Send Invitations'}
        </Button>
      </div>
    </div>
  );
};

export default BulkInviteUpload;
