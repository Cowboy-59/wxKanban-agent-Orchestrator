// [SCOPE 046 / T005] Marketing lead funnel — wxperts platform admins work captured
// signups through the funnel: filter by segment/status/source, view detail, change
// status (decline requires a reason), and append internal notes. Mirrors the spec
// 043 feedback-queue UI pattern.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Building2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { MarketingHeader } from './marketing/MarketingTabs';

interface LeadRow {
  id: string;
  companyid: string | null;
  email: string;
  name: string | null;
  sourceproperty: string;
  campaignid: string | null;
  segment: string;
  locale: string;
  company: string | null;
  platformfrom: string | null;
  status: string;
  declinedreason: string | null;
  notes: string | null;
  notifystatus: string;
  createdat: string;
  updatedat: string;
}

const STATUSES = ['new', 'contacted', 'qualified', 'onboarded', 'declined'] as const;
const SEGMENTS = ['windev', 'careerchanger', 'broad'] as const;
const SOURCES = ['windev', 'wxperts'] as const;

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  contacted: 'bg-indigo-500/15 text-indigo-400',
  qualified: 'bg-purple-500/15 text-purple-400',
  onboarded: 'bg-emerald-500/15 text-emerald-400',
  declined: 'bg-rose-500/15 text-rose-400',
};

// [SCOPE 046 / T005] BEGIN — SysAdminMarketing lead-funnel component
export default function SysAdminMarketing() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (segmentFilter !== 'all') params.set('segment', segmentFilter);
      if (sourceFilter !== 'all') params.set('sourceproperty', sourceFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/sysadmin/marketing/leads${qs}`, { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setItems(data.leads ?? []);
    } catch {
      // non-fatal — leave the list as-is
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, segmentFilter, sourceFilter]);

  const mutate = async (path: string, method: 'PATCH' | 'POST', body?: unknown) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/leads/${selected.id}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Action failed');
        return;
      }
      if (data.lead) setSelected(data.lead);
      void load();
    } catch {
      alert('Action failed');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status: string) => {
    if (status === 'declined') {
      const reason = declineReason.trim();
      if (!reason) {
        alert('A decline reason is required.');
        return;
      }
      void mutate('/status', 'PATCH', { status, declinedreason: reason });
    } else {
      void mutate('/status', 'PATCH', { status });
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Leads" onRefresh={() => void load()} />

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {['all', ...STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs capitalize ${
                  statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-xs text-slate-300"
            >
              <option value="all">All segments</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-xs text-slate-300"
            >
              <option value="all">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base">
                Leads {loading ? '' : `(${items.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No leads in this view.</div>
              ) : (
                items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setSelected(it);
                      setNote('');
                      setDeclineReason('');
                    }}
                    className={`w-full text-left p-3 rounded-lg border ${
                      selected?.id === it.id
                        ? 'border-indigo-500 bg-slate-700/50'
                        : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-white truncate flex-1">{it.email}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_STYLE[it.status] ?? 'bg-slate-600 text-slate-200'}`}>
                        {it.status}
                      </span>
                      <span className="text-[10px] text-slate-400 capitalize">{it.segment}</span>
                      <span className="text-[10px] text-slate-500">·</span>
                      <span className="text-[10px] text-slate-400">{it.sourceproperty}</span>
                      <span className="text-[10px] text-slate-500 ml-auto">{fmt(it.createdat)}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Detail + actions */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            {!selected ? (
              <CardContent className="py-16 text-center text-slate-400">
                Select a lead to work it.
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Mail className="h-5 w-5 text-slate-400" />
                    {selected.email}
                  </CardTitle>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span>ref {selected.id.slice(0, 8)}</span>
                    <span>segment {selected.segment}</span>
                    <span>source {selected.sourceproperty}</span>
                    <span>locale {selected.locale}</span>
                    <span>notify {selected.notifystatus}</span>
                    <span>captured {fmt(selected.createdat)}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Captured fields */}
                  <div className="bg-slate-900/60 rounded p-3 space-y-1 text-sm text-slate-300">
                    {selected.name && (
                      <div><span className="text-slate-500">Name:</span> {selected.name}</div>
                    )}
                    {selected.company && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-slate-500" />
                        <span className="text-slate-500">Company:</span> {selected.company}
                      </div>
                    )}
                    {selected.platformfrom && (
                      <div><span className="text-slate-500">Converting from:</span> {selected.platformfrom}</div>
                    )}
                    {selected.campaignid && (
                      <div><span className="text-slate-500">Campaign:</span> {selected.campaignid.slice(0, 8)}</div>
                    )}
                    {!selected.name && !selected.company && !selected.platformfrom && (
                      <div className="text-slate-500">No additional qualifying details.</div>
                    )}
                  </div>

                  {selected.status === 'declined' && selected.declinedreason && (
                    <div className="text-sm text-rose-400">Declined: {selected.declinedreason}</div>
                  )}

                  {/* Status transitions */}
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-1">Status</div>
                    <div className="flex flex-wrap gap-2">
                      {STATUSES.filter((s) => s !== 'declined').map((s) => (
                        <Button
                          key={s}
                          variant="outline"
                          disabled={busy || selected.status === s}
                          onClick={() => changeStatus(s)}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700 capitalize text-xs h-8"
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Decline reason…"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                      />
                      <Button
                        disabled={busy}
                        onClick={() => changeStatus('declined')}
                        className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8"
                      >
                        Decline
                      </Button>
                    </div>
                  </div>

                  {/* Internal notes */}
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-1">Notes</div>
                    {selected.notes && (
                      <pre className="bg-slate-900/60 rounded p-2 text-xs text-slate-400 whitespace-pre-wrap mb-2">
                        {selected.notes}
                      </pre>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note…"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                      />
                      <Button
                        disabled={busy || !note.trim()}
                        onClick={() => void mutate('/note', 'POST', { note: note.trim() }).then(() => setNote(''))}
                        className="bg-slate-600 hover:bg-slate-500 text-white text-xs h-8"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
// [SCOPE 046 / T005] END
