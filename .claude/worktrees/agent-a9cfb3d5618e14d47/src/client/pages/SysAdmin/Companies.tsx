import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Building2, 
  Users, 
  Search, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Shield,
  ShieldOff,
  Key,
  Check,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Clock,
  Crown,
  UserMinus
} from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

// Types
interface Company {
  id: string;
  name: string;
  contactemail: string;
  phone?: string;
  subscriptionstatus: 'ACTIVE' | 'TRIAL' | 'PENDING' | 'PENDING_INACTIVE' | 'SUSPENDED' | 'CANCELED';
  activeflag: boolean;
  billingplan: string;
  maxusers: number;
  createdat: string;
  updatedat: string;
  userCount: number;
  mrr: number;
  // [SCOPE 088 / T006] Distributor affiliate + referral attribution (read-only)
  distributor?: boolean;
  referralcode?: string | null;
  referredby?: string | null;
}

// [SCOPE 067] Latest Stripe subscription row returned by GET /companies/:id.
interface CompanySubscription {
  status: string;
  planname: string;
  planamount: string | null;
  currentperiodstart: string | null;
  currentperiodend: string | null;
  canceledat: string | null;
  stripesubscriptionid: string;
  stripecustomerid: string;
}

// [SCOPE 085] Bulk reconcile (POST /api/sysadmin/subscriptions/resync) shapes.
interface ResyncRow {
  companyId: string;
  name?: string;
  stripeStatus: string | null;
  fromCompanyStatus: string;
  toCompanyStatus: string | null;
  changed: boolean;
  note?: string;
}
interface ResyncResponse {
  dryRun: boolean;
  scanned: number;
  changed: number;
  results: ResyncRow[];
}

interface User {
  id: string;
  emailaddr: string;
  fullname: string;
  usertype: string;
  active: boolean;
  lastLoginAt?: string;
  companyid: string;
}

interface CompaniesResponse {
  companies: Company[];
  total: number;
  page: number;
  limit: number;
  offset: number;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    ACTIVE: { bg: 'bg-green-500/20', text: 'text-green-400', icon: <CheckCircle className="w-3 h-3" /> },
    TRIAL: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: <Clock className="w-3 h-3" /> },
    PENDING: { bg: 'bg-sky-500/20', text: 'text-sky-400', icon: <Clock className="w-3 h-3" /> },
    PENDING_INACTIVE: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: <AlertTriangle className="w-3 h-3" /> },
    SUSPENDED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: <XCircle className="w-3 h-3" /> },
    CANCELED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: <XCircle className="w-3 h-3" /> },
    // [SCOPE 131 / T005] MODIFIED-BY — both spellings, and the new PAUSED state.
    // SPEC-131's period-end webhook writes CANCELLED (two L) while rows written
    // before it carry CANCELED (one). Keying on one spelling sent the other to the
    // SUSPENDED fallback, which reads as an operator action rather than a customer
    // one — a cancelled company shown in red as though we had suspended it.
    CANCELLED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: <XCircle className="w-3 h-3" /> },
    PAUSED: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', icon: <Clock className="w-3 h-3" /> },
  };

  const labels: Record<string, string> = {
    PENDING_INACTIVE: 'PAYMENT FAILED',
    // [SCOPE 131 / T005] One label for both spellings, so the console does not
    // display the database's inconsistency back at the operator.
    CANCELED: 'CANCELLED',
    PAUSED: 'SUSPENDED BY CUSTOMER',
  };
  const { bg, text, icon } = config[status] || config.SUSPENDED;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      {icon}
      {labels[status] || status}
    </span>
  );
}

export default function SysAdminCompanies() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const limit = 20;
  
  // Selected company for detail view
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [companySubscription, setCompanySubscription] = useState<CompanySubscription | null>(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [subReason, setSubReason] = useState<string | null>(null);
  const [loadingReason, setLoadingReason] = useState(false);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Create company form
  const [newCompany, setNewCompany] = useState({
    name: '',
    contactemail: '',
    phone: '',
    billingPlan: 'SINGLE_USER',
  });
  const [creating, setCreating] = useState(false);
  
  // Add admin form
  const [newAdmin, setNewAdmin] = useState({
    email: '',
    fullname: '',
    password: '',
  });
  const [addingAdmin, setAddingAdmin] = useState(false);

  
  // Fetch companies
  useEffect(() => {
    fetchCompanies();
  }, [search, statusFilter, page]);
  
  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (page > 1) params.set('page', String(page));
    setSearchParams(params);
  }, [search, statusFilter, page]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      
      const res = await fetch(`/api/sysadmin/companies?${params}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          navigate('/login');
          return;
        }
        if (res.status === 403) {
          navigate('/dashboard');
          return;
        }
        throw new Error('Failed to load companies');
      }
      
      const data: CompaniesResponse = await res.json();
      setCompanies(data.companies);
      setTotal(data.total);
    } catch (err) {
      setError('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchCompanyUsers = async (companyId: string) => {
    try {
      setLoadingUsers(true);
      const res = await fetch(`/api/sysadmin/companies/${companyId}`, {
        credentials: 'include',
      });
      
      if (!res.ok) throw new Error('Failed to load company details');
      
      const data = await res.json();
      setCompanyUsers(data.users || []);
      setCompanySubscription(data.subscription ?? null);
      setSubReason(null);
    } catch (err) {
      console.error('Failed to load company users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // [SCOPE 067] Quick interpretation of a non-active subscription, no Stripe call.
  const derivedSubLabel = (companyStatus: string, sub: CompanySubscription | null): string | null => {
    if (!sub) {
      return companyStatus === 'PENDING'
        ? 'No subscription — registration never reached payment'
        : null;
    }
    switch (sub.status) {
      case 'incomplete': return 'Awaiting first payment — card not completed';
      case 'incomplete_expired': return 'Initial payment window expired — never paid';
      case 'past_due':
      case 'unpaid': return 'A recurring payment failed (past due)';
      case 'active':
      case 'trialing': return null;
      case 'canceled': return 'Subscription canceled';
      default: return null;
    }
  };

  // [SCOPE 067] Fetch the live "why" from Stripe (PaymentIntent reason).
  const handleCheckReason = async (companyId: string) => {
    try {
      setLoadingReason(true);
      setSubReason(null);
      const res = await fetch(`/api/sysadmin/companies/${companyId}/subscription-reason`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get reason');
      setSubReason(`${data.reason}${data.live ? '' : ' (from stored state)'}`);
    } catch (err: any) {
      setSubReason(err.message || 'Could not determine reason');
    } finally {
      setLoadingReason(false);
    }
  };

  // [SCOPE 085] Bulk "Recheck all pending from Stripe" — dry-run preview → apply.
  const [showResyncAll, setShowResyncAll] = useState(false);
  const [resyncAllLoading, setResyncAllLoading] = useState(false);
  const [resyncAllApplying, setResyncAllApplying] = useState(false);
  const [resyncPreview, setResyncPreview] = useState<ResyncResponse | null>(null);

  // [SCOPE 067] Reconcile this company's local status from Stripe.
  const [resyncing, setResyncing] = useState(false);
  const handleResync = async (companyId: string) => {
    try {
      setResyncing(true);
      const res = await fetch(`/api/sysadmin/companies/${companyId}/resync-subscription`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resync failed');
      if (data.changed) {
        alert(`Updated: Stripe says "${data.stripeStatus}"${data.toCompanyStatus ? ` → status set to ${data.toCompanyStatus}` : ''}.`);
        await Promise.all([fetchCompanies(), fetchCompanyUsers(companyId)]);
      } else {
        alert(`No change — already in sync${data.stripeStatus ? ` (Stripe: ${data.stripeStatus})` : ` (${data.note || 'nothing to sync'})`}.`);
      }
    } catch (err: any) {
      alert(err.message || 'Resync failed');
    } finally {
      setResyncing(false);
    }
  };

  // [SCOPE 085 FR-003/005] Bulk reconcile: dry-run preview first, then apply.
  const handleResyncAllPreview = async () => {
    try {
      setResyncAllLoading(true);
      setResyncPreview(null);
      setShowResyncAll(true);
      const res = await fetch('/api/sysadmin/subscriptions/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setResyncPreview(data as ResyncResponse);
    } catch (err: any) {
      alert(err.message || 'Preview failed');
      setShowResyncAll(false);
    } finally {
      setResyncAllLoading(false);
    }
  };

  const handleResyncAllApply = async () => {
    try {
      setResyncAllApplying(true);
      const res = await fetch('/api/sysadmin/subscriptions/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resync failed');
      alert(`Reconciled ${data.changed} of ${data.scanned} companies from Stripe.`);
      setShowResyncAll(false);
      setResyncPreview(null);
      await fetchCompanies();
    } catch (err: any) {
      alert(err.message || 'Resync failed');
    } finally {
      setResyncAllApplying(false);
    }
  };

  // [SCOPE 067] Email the company's billing/admin contact a Stripe Portal restart link.
  const handleSendRestartLink = async (companyId: string) => {
    try {
      setSendingLink(true);
      const res = await fetch(`/api/sysadmin/companies/${companyId}/restart-link`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.reason === 'no_stripe_customer'
          ? 'No Stripe customer on file for this company'
          : data.reason || data.error || 'Failed to send restart link');
      }
      alert(`Restart link sent to ${data.to}`);
    } catch (err: any) {
      alert(err.message || 'Failed to send restart link');
    } finally {
      setSendingLink(false);
    }
  };
  
  const handleSelectCompany = async (company: Company) => {
    setSelectedCompany(company);
    await fetchCompanyUsers(company.id);
  };
  
  const handleStatusChange = async (companyId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/sysadmin/companies/${companyId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (!res.ok) throw new Error('Failed to update status');
      
      // Refresh companies list
      fetchCompanies();
      
      // Update selected company if it's the one being modified
      if (selectedCompany?.id === companyId) {
        await res.json();
        setSelectedCompany({ ...selectedCompany, 
          subscriptionstatus: newStatus as any,
          activeflag: newStatus === 'ACTIVE' || newStatus === 'TRIAL'
        });
      }
    } catch (err) {
      alert('Failed to update company status');
    }
  };
  
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await fetch('/api/sysadmin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newCompany),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create company');
      }
      
      setShowCreateModal(false);
      setNewCompany({ name: '', contactemail: '', phone: '', billingPlan: 'SINGLE_USER' });
      fetchCompanies();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };
  
  const handleResetPassword = async (userId: string) => {
    try {
      const res = await fetch(`/api/sysadmin/users/${userId}/reset-password`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!res.ok) throw new Error('Failed to reset password');
      
      const data = await res.json();
      alert(data.message || 'Password reset email sent');
      setShowPasswordResetModal(false);
      setSelectedUser(null);
    } catch (err) {
      alert('Failed to reset password');
    }
  };
  
  const handleToggleUserStatus = async (userId: string, active: boolean) => {
    try {
      const res = await fetch(`/api/sysadmin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !active }),
      });
      
      if (!res.ok) throw new Error('Failed to update user status');
      
      // Refresh users list
      if (selectedCompany) {
        fetchCompanyUsers(selectedCompany.id);
      }
    } catch (err) {
      alert('Failed to update user status');
    }
  };
  
  const handleChangeUserType = async (userId: string, newUserType: string) => {
    try {
      const res = await fetch(`/api/sysadmin/users/${userId}/usertype`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ usertype: newUserType }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user type');
      }
      
      // Refresh users list
      if (selectedCompany) {
        fetchCompanyUsers(selectedCompany.id);
      }
      
      alert(`User successfully ${newUserType === 'ADMIN' ? 'promoted to Admin' : 'demoted to Team Member'}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update user type');
    }
  };
  
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    
    try {
      setAddingAdmin(true);
      const res = await fetch('/api/sysadmin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: newAdmin.email,
          password: newAdmin.password,
          companyid: selectedCompany.id,
          fullname: newAdmin.fullname,
          usertype: 'ADMIN',
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create admin user');
      }
      
      setShowAddAdminModal(false);
      setNewAdmin({ email: '', fullname: '', password: '' });
      fetchCompanyUsers(selectedCompany.id);
      alert('Admin user created successfully');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingAdmin(false);
    }
  };

  
  const totalPages = Math.ceil(total / limit);
  
  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/sysadmin/dashboard')}
              className="text-slate-400 hover:text-white"
            >
              <ChevronLeft className="w-5 h-5" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Companies</h1>
              <p className="text-slate-400">Manage all tenant companies</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* [SCOPE 085 FR-003] Bulk reconcile all pending companies from Stripe */}
            <Button
              onClick={handleResyncAllPreview}
              variant="outline"
              className="border-sky-600 text-sky-400 hover:bg-sky-600/20"
            >
              Recheck all from Stripe
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Company
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search companies..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2"
              >
                <option value="all">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="TRIAL">Trial</option>
                <option value="PENDING">Pending</option>
                <option value="PENDING_INACTIVE">Payment failed</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="CANCELED">Cancelled</option>
              </select>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Companies List */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">All Companies ({total})</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-slate-400">Loading...</div>
                ) : error ? (
                  <div className="text-center py-8 text-red-400">{error}</div>
                ) : companies.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">No companies found</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Company</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Users</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Plan</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {companies.map((company) => (
                            <tr 
                              key={company.id} 
                              className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer ${
                                selectedCompany?.id === company.id ? 'bg-slate-700/50' : ''
                              }`}
                              onClick={() => handleSelectCompany(company)}
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <Building2 className="w-5 h-5 text-blue-400" />
                                  </div>
                                  <div>
                                    <div className="text-white font-medium">{company.name}</div>
                                    <div className="text-slate-400 text-sm">{company.contactemail}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <StatusBadge status={company.subscriptionstatus} />
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {company.userCount} / {company.maxusers}
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {company.billingplan}
                              </td>
                              <td className="py-3 px-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectCompany(company);
                                  }}
                                  className="text-slate-400 hover:text-white"
                                >
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                        <div className="text-slate-400 text-sm">
                          Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="border-slate-600 text-slate-300"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="border-slate-600 text-slate-300"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Company Detail Panel */}
          <div>
            {selectedCompany ? (
              <Card className="bg-slate-800/50 border-slate-700 sticky top-6">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {selectedCompany.name}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    <StatusBadge status={selectedCompany.subscriptionstatus} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Company Info */}
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Contact</div>
                    <div className="text-white">{selectedCompany.contactemail}</div>
                    {selectedCompany.phone && (
                      <div className="text-slate-300">{selectedCompany.phone}</div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Plan</div>
                    <div className="text-white">{selectedCompany.billingplan}</div>
                  </div>

                  {/* [SCOPE 088 / T006] Distributor affiliate + referral attribution (read-only) */}
                  {(selectedCompany.distributor || selectedCompany.referralcode || selectedCompany.referredby) && (
                    <div className="space-y-2">
                      <div className="text-sm text-slate-400">Distributor / Referral</div>
                      <div className="text-sm text-slate-300 space-y-1">
                        {selectedCompany.distributor && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Distributor</span>
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">YES</span>
                          </div>
                        )}
                        {selectedCompany.referralcode && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Referral code</span>
                            <span className="text-white font-mono">{selectedCompany.referralcode}</span>
                          </div>
                        )}
                        {selectedCompany.referredby && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Referred by</span>
                            <span className="text-white font-mono">{selectedCompany.referredby}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* [SCOPE 067] Subscription / billing detail */}
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Subscription</div>
                    {companySubscription ? (
                      <div className="text-sm text-slate-300 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Stripe status</span>
                          <span className="text-white">{companySubscription.status}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Amount</span>
                          <span className="text-white">{companySubscription.planamount ? `$${companySubscription.planamount}/mo` : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Renews / ends</span>
                          <span className="text-white">{companySubscription.currentperiodend ? new Date(companySubscription.currentperiodend).toLocaleDateString() : '—'}</span>
                        </div>
                        {companySubscription.canceledat && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Canceled</span>
                            <span className="text-white">{new Date(companySubscription.canceledat).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 italic">No Stripe subscription</div>
                    )}

                    {/* [SCOPE 067] Why is it pending/not active? */}
                    {(() => {
                      const label = derivedSubLabel(selectedCompany.subscriptionstatus, companySubscription);
                      const showWhy =
                        label !== null ||
                        ['PENDING', 'PENDING_INACTIVE'].includes(selectedCompany.subscriptionstatus);
                      if (!showWhy) return null;
                      return (
                        <div className="mt-2 space-y-1.5">
                          {label && <div className="text-xs text-amber-400">{label}</div>}
                          <button
                            type="button"
                            onClick={() => handleCheckReason(selectedCompany.id)}
                            disabled={loadingReason}
                            className="text-xs text-indigo-400 hover:text-indigo-300 underline disabled:opacity-50"
                          >
                            {loadingReason ? 'Checking Stripe…' : 'Why? (check Stripe)'}
                          </button>
                          {subReason && (
                            <div className="text-xs text-slate-200 bg-slate-700/40 rounded p-2">{subReason}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Users</div>
                    <div className="text-white">{selectedCompany.userCount} / {selectedCompany.maxusers}</div>
                  </div>

                  {/* Status Actions */}
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      {/* [SCOPE 085 FR-004] Recheck this company against Stripe —
                          always available (even with no local subscription row). */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resyncing}
                        onClick={() => handleResync(selectedCompany.id)}
                        className="border-sky-600 text-sky-400 hover:bg-sky-600/20"
                      >
                        {resyncing ? 'Rechecking…' : 'Recheck Stripe'}
                      </Button>
                      {selectedCompany.subscriptionstatus !== 'ACTIVE' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(selectedCompany.id, 'ACTIVE')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Activate
                        </Button>
                      )}
                      {/* [SCOPE 067] Restart link for failed/non-active subscriptions */}
                      {(selectedCompany.subscriptionstatus === 'PENDING_INACTIVE' || companySubscription) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingLink}
                          onClick={() => handleSendRestartLink(selectedCompany.id)}
                          className="border-orange-600 text-orange-400 hover:bg-orange-600/20"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {sendingLink ? 'Sending…' : 'Send restart link'}
                        </Button>
                      )}
                      {selectedCompany.subscriptionstatus !== 'SUSPENDED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(selectedCompany.id, 'SUSPENDED')}
                          className="border-red-600 text-red-400 hover:bg-red-600/20"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Inactivate
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Users Section */}
                  <div className="pt-4 border-t border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm text-slate-400">Users ({companyUsers.length})</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => setShowAddAdminModal(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          <Crown className="w-3 h-3 mr-1" />
                          Add Admin
                        </Button>
                        <Users className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                    
                    {loadingUsers ? (
                      <div className="text-center py-4 text-slate-400">Loading users...</div>
                    ) : companyUsers.length === 0 ? (
                      <div className="text-center py-4 text-slate-400">No users found</div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {companyUsers.map((user) => (
                          <div 
                            key={user.id} 
                            className="p-3 bg-slate-700/30 rounded-lg"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-white text-sm truncate">{user.fullname}</div>
                                  {user.usertype === 'ADMIN' && (
                                    <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded">
                                      ADMIN
                                    </span>
                                  )}
                                  {user.usertype === 'TEAM_MANAGER' && (
                                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                                      MANAGER
                                    </span>
                                  )}
                                  {user.usertype === 'SYSADMIN' && (
                                    <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                                      SYSADMIN
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-400 text-xs truncate">{user.emailaddr}</div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {user.usertype !== 'ADMIN' && user.usertype !== 'SYSADMIN' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleChangeUserType(user.id, 'ADMIN')}
                                    className="text-indigo-400 hover:text-indigo-300"
                                    title="Make Admin"
                                  >
                                    <Crown className="w-4 h-4" />
                                  </Button>
                                )}
                                {user.usertype === 'ADMIN' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleChangeUserType(user.id, 'TEAM_MEMBER')}
                                    className="text-amber-400 hover:text-amber-300"
                                    title="Demote to Team Member"
                                  >
                                    <UserMinus className="w-4 h-4" />
                                  </Button>
                                )}
                                {user.active ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleUserStatus(user.id, user.active)}
                                    className="text-green-400 hover:text-green-300"
                                    title="Disable user"
                                  >
                                    <Shield className="w-4 h-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleUserStatus(user.id, user.active)}
                                    className="text-red-400 hover:text-red-300"
                                    title="Enable user"
                                  >
                                    <ShieldOff className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowPasswordResetModal(true);
                                  }}
                                  className="text-slate-400 hover:text-white"
                                  title="Reset password"
                                >
                                  <Key className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>
            ) : (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-8 text-center">
                  <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Select a company to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      {/* Create Company Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-slate-800 border-slate-700 w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-white">Create New Company</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Company Name</label>
                  <Input
                    value={newCompany.name}
                    onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                    placeholder="Enter company name"
                    required
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Contact Email</label>
                  <Input
                    type="email"
                    value={newCompany.contactemail}
                    onChange={(e) => setNewCompany({ ...newCompany, contactemail: e.target.value })}
                    placeholder="contact@company.com"
                    required
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Phone (Optional)</label>
                  <Input
                    type="tel"
                    value={newCompany.phone}
                    onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Billing Plan</label>
                  <select
                    value={newCompany.billingPlan}
                    onChange={(e) => setNewCompany({ ...newCompany, billingPlan: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2"
                  >
                    <option value="SINGLE_USER">Single User</option>
                    <option value="SMALL_BUSINESS">Small Business</option>
                    <option value="CONSULTANT">Consultant</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {creating ? 'Creating...' : 'Create Company'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Password Reset Modal */}
      {showPasswordResetModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-slate-800 border-slate-700 w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-white">Reset Password</CardTitle>
              <CardDescription className="text-slate-400">
                Reset password for {selectedUser.fullname}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <div>
                      <div className="text-yellow-400 font-medium">Warning</div>
                      <div className="text-slate-400 text-sm">
                        This will send a password reset email to the user.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordResetModal(false);
                      setSelectedUser(null);
                    }}
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleResetPassword(selectedUser.id)}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Reset Password
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Add Admin User Modal */}
      {showAddAdminModal && selectedCompany && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-slate-800 border-slate-700 w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-indigo-400" />
                Add Admin User
              </CardTitle>
              <CardDescription className="text-slate-400">
                Create a new admin user for {selectedCompany.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddAdmin} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Full Name</label>
                  <Input
                    value={newAdmin.fullname}
                    onChange={(e) => setNewAdmin({ ...newAdmin, fullname: e.target.value })}
                    placeholder="John Doe"
                    required
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <Input
                    type="email"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                    placeholder="admin@company.com"
                    required
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Password</label>
                  <Input
                    type="password"
                    value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters</p>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddAdminModal(false);
                      setNewAdmin({ email: '', fullname: '', password: '' });
                    }}
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={addingAdmin}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  >
                    {addingAdmin ? 'Creating...' : (
                      <>
                        <Crown className="w-4 h-4 mr-2" />
                        Create Admin
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* [SCOPE 085 FR-003/005] Recheck-all-from-Stripe preview → apply */}
      {showResyncAll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-slate-800 border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle className="text-white">Recheck all pending from Stripe</CardTitle>
              <CardDescription className="text-slate-400">
                Live Stripe status for every pending / non-active company. Nothing is written until you apply.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              {resyncAllLoading ? (
                <div className="text-center py-8 text-slate-400">Checking Stripe…</div>
              ) : !resyncPreview ? (
                <div className="text-center py-8 text-slate-400">No preview available.</div>
              ) : (
                <>
                  <div className="text-sm text-slate-300 mb-3">
                    Scanned <span className="text-white font-medium">{resyncPreview.scanned}</span> · would change{' '}
                    <span className="text-white font-medium">{resyncPreview.changed}</span>
                  </div>
                  {resyncPreview.results.filter((r) => r.changed).length === 0 ? (
                    <div className="text-slate-400 text-sm">Everything is already in sync — no changes needed.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {resyncPreview.results.filter((r) => r.changed).map((r) => (
                        <div key={r.companyId} className="text-xs bg-slate-700/40 rounded p-2 flex justify-between gap-2">
                          <span className="text-white truncate">{r.name || r.companyId}</span>
                          <span className="text-slate-300 flex-shrink-0">
                            {r.fromCompanyStatus} → <span className="text-sky-400">{r.stripeStatus ?? '—'}</span>
                            {r.toCompanyStatus ? <> ⇒ <span className="text-green-400">{r.toCompanyStatus}</span></> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
            <div className="flex gap-3 p-4 border-t border-slate-700">
              <Button
                variant="outline"
                onClick={() => { setShowResyncAll(false); setResyncPreview(null); }}
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleResyncAllApply}
                disabled={resyncAllApplying || resyncAllLoading || !resyncPreview || resyncPreview.changed === 0}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {resyncAllApplying ? 'Applying…' : `Apply ${resyncPreview?.changed ?? 0} change(s)`}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
