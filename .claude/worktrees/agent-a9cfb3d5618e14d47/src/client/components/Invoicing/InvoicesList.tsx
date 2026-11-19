import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface Invoice {
  invoiceid: string;
  invoicenumber: string;
  invoicedate: string;
  duedate: string;
  total: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
}

interface InvoicesListProps {
  onInvoiceSelect?: (invoiceid: string) => void;
}

export const InvoicesList: React.FC<InvoicesListProps> = ({
  onInvoiceSelect,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fetch invoices
  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/invoices?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json();
    },
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceid: string) => {
      const response = await fetch(`/api/invoices/${invoiceid}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete invoice');
      return response.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  const invoices = invoicesData?.invoices as Invoice[] | undefined;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US').format(new Date(dateString));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'SENT':
        return 'bg-blue-100 text-blue-800';
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'OVERDUE':
        return 'bg-red-100 text-red-800';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600">No invoices yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Invoices</h3>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {invoices.map((invoice) => (
          <div
            key={invoice.invoiceid}
            className="p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-medium text-slate-900">{invoice.invoicenumber}</p>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Invoice Date: {formatDate(invoice.invoicedate)}
                  {invoice.status !== 'PAID' && ` • Due: ${formatDate(invoice.duedate)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(invoice.total)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => onInvoiceSelect?.(invoice.invoiceid)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium transition"
              >
                View Details
              </button>
              {invoice.status === 'DRAFT' && (
                <button
                  onClick={() => deleteInvoiceMutation.mutate(invoice.invoiceid)}
                  disabled={deleteInvoiceMutation.isPending}
                  className="text-red-600 hover:text-red-700 disabled:text-slate-300 text-sm font-medium transition"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="text-right text-xs text-slate-600">
        Showing {invoices.length} invoices
      </div>
    </div>
  );
};

export default InvoicesList;
