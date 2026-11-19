import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/client/components/ui/Card';
import { Button } from '~/client/components/ui/Button';
import { Input } from '~/client/components/ui/Input';
import { FileText, Download, Send, Trash2, Loader2, Plus, Eye, RefreshCw } from 'lucide-react';
import { useTranslation } from '~/client/i18n'; // [SCOPE 052]

interface Invoice {
  id: string;
  invoicenumber: string;
  generatedat: string;
  totalamount: string;
  billedto: string;
  hoursworked: string;
  emailsent: boolean;
  sentat?: string;
}

interface InvoiceStats {
  totalInvoices: number;
  totalRevenue: number;
  sentCount: number;
}

export function InvoicesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async (): Promise<Invoice[]> => {
      const response = await fetch('/api/invoices', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json().then(r => r.invoices);
    },
  });

  // Fetch invoice stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: async (): Promise<InvoiceStats> => {
      const response = await fetch('/api/invoices/stats/summary', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json().then(r => r.stats);
    },
  });

  // Generate invoice mutation
  const generateMutation = useMutation({
    mutationFn: async (params: { startdate: string; enddate: string; hourlyRate: number }) => {
      const response = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('Failed to generate invoice');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats'] });
      setShowGenerateModal(false);
      setDateRange({ startDate: '', endDate: '' });
    },
  });

  // Send invoice mutation
  const sendMutation = useMutation({
    mutationFn: async (invoiceid: string) => {
      const response = await fetch(`/api/invoices/${invoiceid}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ status: 'SENT' }),
      });
      if (!response.ok) throw new Error('Failed to send invoice');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats'] });
    },
  });

  // Delete invoice mutation
  const deleteMutation = useMutation({
    mutationFn: async (invoiceid: string) => {
      const response = await fetch(`/api/invoices/${invoiceid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete invoice');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats'] });
      setSelectedInvoice(null);
    },
  });

  const handleGenerate = () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      return;
    }
    generateMutation.mutate({
      startdate: new Date(dateRange.startDate).toISOString(),
      enddate: new Date(dateRange.endDate).toISOString(),
      hourlyRate: 100, // Default rate, should be configurable
    });
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(parseFloat(amount));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (invoicesLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("invoices.title")}</h1>
          <p className="text-gray-600 mt-2">{t("invoices.subtitle")}</p>
        </div>
        <Button onClick={() => setShowGenerateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("invoices.generate")}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("invoices.statTotal")}</CardDescription>
            <CardTitle className="text-3xl">{stats?.totalInvoices || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("invoices.statRevenue")}</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(String(stats?.totalRevenue || 0))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("invoices.statSent")}</CardDescription>
            <CardTitle className="text-3xl">{stats?.sentCount || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Generate Invoice Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{t("invoices.modalTitle")}</CardTitle>
              <CardDescription>{t("invoices.modalDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("invoices.startDate")}</label>
                <Input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("invoices.endDate")}</label>
                <Input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending || !dateRange.startDate || !dateRange.endDate}
                  className="flex-1"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  {t("invoices.generateConfirm")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("invoices.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!invoices || invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{t("invoices.emptyTitle")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("invoices.emptyHint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">{t("invoices.colNumber")}</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">{t("invoices.colDate")}</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">{t("invoices.colBilledTo")}</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t("invoices.colHours")}</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t("invoices.colAmount")}</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-700">{t("invoices.colStatus")}</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">{t("invoices.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{invoice.invoicenumber}</td>
                      <td className="py-3 px-4 text-gray-600">{formatDate(invoice.generatedat)}</td>
                      <td className="py-3 px-4 text-gray-600">{invoice.billedto || t("invoices.na")}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{invoice.hoursworked}</td>
                      <td className="py-3 px-4 text-right font-medium">{formatCurrency(invoice.totalamount)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          invoice.emailsent
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {invoice.emailsent ? t("invoices.statusSent") : t("invoices.statusDraft")}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedInvoice(invoice)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!invoice.emailsent && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => sendMutation.mutate(invoice.id)}
                              disabled={sendMutation.isPending}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(invoice.id)}
                            disabled={deleteMutation.isPending || invoice.emailsent}
                          >
                            <Trash2 className={`h-4 w-4 ${invoice.emailsent ? 'text-gray-300' : 'text-red-500'}`} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("invoices.detailTitle", { number: selectedInvoice.invoicenumber })}</CardTitle>
                  <CardDescription>{t("invoices.generatedOn", { date: formatDate(selectedInvoice.generatedat) })}</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInvoice(null)}
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">{t("invoices.colBilledTo")}</label>
                  <p className="text-gray-900">{selectedInvoice.billedto || t("invoices.na")}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">{t("invoices.colStatus")}</label>
                  <p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedInvoice.emailsent
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedInvoice.emailsent ? t("invoices.statusSent") : t("invoices.statusDraft")}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">{t("invoices.hoursWorked")}</label>
                  <p className="text-gray-900">{selectedInvoice.hoursworked}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">{t("invoices.totalAmount")}</label>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedInvoice.totalamount)}</p>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`/api/invoices/${selectedInvoice.id}/pdf`, '_blank')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t("invoices.downloadPdf")}
                </Button>
                {!selectedInvoice.emailsent && (
                  <Button
                    className="flex-1"
                    onClick={() => sendMutation.mutate(selectedInvoice.id)}
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {t("invoices.sendInvoice")}
                  </Button>
                )}
                {selectedInvoice.emailsent && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => sendMutation.mutate(selectedInvoice.id)}
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {t("invoices.resend")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
