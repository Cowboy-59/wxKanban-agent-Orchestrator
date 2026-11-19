// [SCOPE 043 / T006] User Feedback triage surface — wxperts platform admins
// review submissions (with AI triage results), transition status, add internal
// notes, send the single clarifying question, and retry a failed notification.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Bug, Lightbulb, Copy, Send, BarChart3, Sparkles, Rocket, AlertTriangle, Trash2, EyeOff, Eye, RotateCcw, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

interface FeedbackRow {
  id: string;
  projectid: string;
  userid: string;
  type: string;
  title: string;
  details: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  classification: string | null;
  severity: string | null;
  duplicateofid: string | null;
  status: string;
  declinereason: string | null;
  internalnotes: string | null;
  clarificationquestion: string | null;
  clarificationanswer: string | null;
  notificationchannel: string;
  artifactstatus: string;
  notifystatus: string;
  createdat: string;
  firsttriagedat: string | null;
  // [SCOPE 043 / T015] v2 decision layer
  aiproposeddisposition: string | null;
  dispositionrationale: string | null;
  disposition: string | null;
  linkedscopenumber: string | null;
  scopeseed: { title?: string; shortname?: string } | null;
  // [SCOPE 061] auto error capture — 'manual' user feedback vs 'auto' trapped error
  source?: string;
  errorfingerprint?: string | null;
  occurrencecount?: number;
  firstoccurredat?: string | null;
  lastoccurredat?: string | null;
  // [SCOPE 110] feedback queue hygiene — removal + regression state
  dismissedat?: string | null;
  dismissedbyid?: string | null;
  submitterhiddenat?: string | null;
  reopenedat?: string | null;
}

// [SCOPE 110 / T014] a record is automatic iff source='auto' (type 'error' is the
// legacy signal); everything else is a human submission.
const isAuto = (r: FeedbackRow) => r.source === 'auto' || r.type === 'error';

const STATUSES = ['new', 'triaged', 'needsinfo', 'inprogress', 'resolved', 'declined'] as const;

// [SCOPE 043 / T015] BEGIN — v2 disposition vocabulary (mirrors FEEDBACK_DISPOSITIONS)
const DISPOSITIONS = ['scope', 'outofbandfix', 'duplicate', 'decline', 'needsinfo'] as const;
const DISPOSITION_LABEL: Record<string, string> = {
  scope: 'Scope it',
  outofbandfix: 'Out-of-band fix',
  duplicate: 'Duplicate',
  decline: 'Decline',
  needsinfo: 'Needs info',
};
const DISPOSITION_STYLE: Record<string, string> = {
  scope: 'bg-emerald-500/15 text-emerald-400',
  outofbandfix: 'bg-sky-500/15 text-sky-400',
  duplicate: 'bg-slate-500/15 text-slate-300',
  decline: 'bg-rose-500/15 text-rose-400',
  needsinfo: 'bg-amber-500/15 text-amber-400',
};
// [SCOPE 043 / T015] END

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  triaged: 'bg-indigo-500/15 text-indigo-400',
  needsinfo: 'bg-amber-500/15 text-amber-400',
  inprogress: 'bg-purple-500/15 text-purple-400',
  resolved: 'bg-emerald-500/15 text-emerald-400',
  declined: 'bg-rose-500/15 text-rose-400',
};

const SEVERITY_STYLE: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-rose-400',
};

// [SCOPE 043 / T030] BEGIN — Amendment E: attachment panel (FR-023/FR-025)
// Renders what the list payload actually carries — metadata plus a tail excerpt
// — and links to the full text rather than embedding it. The redaction count is
// shown deliberately: a triager reading `password=[redacted]` needs to know the
// text was modified in transit and is not what the log said on disk.
function FeedbackAttachments({
  feedbackId,
  details,
}: {
  feedbackId: string;
  details: Record<string, unknown> | null;
}) {
  const raw = details && typeof details === 'object' ? (details as Record<string, unknown>).attachments : null;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items = raw.filter(
    (a): a is AttachmentSummaryView => typeof a === 'object' && a !== null && typeof (a as { name?: unknown }).name === 'string',
  );
  if (items.length === 0) return null;

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
        Attachments ({items.length})
      </div>
      <div className="space-y-3">
        {items.map((a, i) => (
          <div key={`${a.name}-${i}`} className="border border-slate-700/60 rounded-md overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-900/60 px-3 py-2">
              <span className="font-mono text-[13px] text-slate-200">{a.name}</span>
              <span className="text-[11px] text-slate-400">{fmtBytes(a.bytes)}</span>
              {a.truncated && (
                <span className="text-[11px] text-amber-400">tail only — earlier content dropped</span>
              )}
              {typeof a.redactions === 'number' && a.redactions > 0 && (
                <span className="text-[11px] text-amber-400">
                  {a.redactions} secret{a.redactions === 1 ? '' : 's'} masked before upload
                </span>
              )}
              <a
                className="ml-auto text-[11px] text-indigo-300 hover:text-indigo-200 underline"
                href={`/api/sysadmin/feedback/${feedbackId}/attachments/${i}`}
              >
                Download full file
              </a>
            </div>
            {a.excerpt && (
              <pre className="bg-slate-900/70 p-3 text-[12px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-56 overflow-y-auto">
                {a.excerpt}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AttachmentSummaryView {
  name: string;
  bytes: number;
  truncated: boolean;
  redactions: number;
  contentLength: number;
  excerpt: string;
}

function fmtBytes(n: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
// [SCOPE 043 / T030] END

// [SCOPE 043 / T006] BEGIN — SysAdminFeedback triage queue component
export default function SysAdminFeedback() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  // [SCOPE 061] source filter: 'all' | 'manual' | 'auto' (auto = trapped runtime errors)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [selected, setSelected] = useState<FeedbackRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [scopeTitle, setScopeTitle] = useState(''); // [SCOPE 043 / T015] accept-to-scope seed title
  // [SCOPE 110 / T013] bulk selection + dismissed visibility + purge confirmation.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [dismissedView, setDismissedView] = useState<'active' | 'dismissed' | 'all'>('active');
  const [purge, setPurge] = useState<{ ids: string[]; humanTitles: string[]; text: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // [SCOPE 061] build query from status + source filters
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      // [SCOPE 110 / T012] dismissed visibility — 'active' (default) hides dismissed.
      if (dismissedView === 'dismissed') params.set('dismissed', 'only');
      else if (dismissedView === 'all') params.set('dismissed', 'include');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/sysadmin/feedback${qs}`, { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // non-fatal — leave the list as-is
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    setCheckedIds(new Set()); // selection is filter-relative; reset when the view changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sourceFilter, dismissedView]);

  const applyResult = (updated: FeedbackRow | undefined) => {
    if (updated) setSelected(updated);
    void load();
  };

  const mutate = async (path: string, method: 'PATCH' | 'POST', body?: unknown) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/feedback/${selected.id}${path}`, {
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
      applyResult(data.feedback);
    } catch {
      alert('Action failed');
    } finally {
      setBusy(false);
    }
  };

  // [SCOPE 110 / T013] BEGIN — bulk selection + removal actions
  const checkedItems = useMemo(
    () => items.filter((i) => checkedIds.has(i.id)),
    [items, checkedIds],
  );
  const allChecked = items.length > 0 && checkedIds.size === items.length;

  const toggleCheck = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setCheckedIds(allChecked ? new Set() : new Set(items.map((i) => i.id)));

  // Dismiss / undismiss a whole selection in one call (FR-001/003).
  const runBulk = async (action: 'dismiss' | 'undismiss') => {
    if (checkedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/feedback/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [...checkedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || `${action} failed`);
        return;
      }
      setCheckedIds(new Set());
      void load();
    } catch {
      alert(`${action} failed`);
    } finally {
      setBulkBusy(false);
    }
  };

  // Purge (FR-002/007): open a confirmation stating the composition; a selection
  // containing any human-submitted record requires the typed word DELETE.
  const openPurge = () => {
    if (checkedIds.size === 0) return;
    const humanTitles = checkedItems.filter((i) => !isAuto(i)).map((i) => i.title);
    setPurge({ ids: [...checkedIds], humanTitles, text: '' });
  };

  const confirmPurge = async () => {
    if (!purge) return;
    const hasHuman = purge.humanTitles.length > 0;
    if (hasHuman && purge.text !== 'DELETE') return; // guard — button also disabled
    setBulkBusy(true);
    try {
      const res = await fetch('/api/sysadmin/feedback/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          hasHuman ? { ids: purge.ids, confirmText: 'DELETE' } : { ids: purge.ids, confirm: true },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(data.humanTitles)) {
        // Server re-derived a human record in the set — escalate to typed DELETE.
        setPurge((p) => (p ? { ...p, humanTitles: data.humanTitles, text: '' } : p));
        return;
      }
      if (!res.ok) {
        alert(data.error || 'Purge failed');
        return;
      }
      setPurge(null);
      setCheckedIds(new Set());
      if (selected && purge.ids.includes(selected.id)) setSelected(null);
      void load();
    } catch {
      alert('Purge failed');
    } finally {
      setBulkBusy(false);
    }
  };
  // [SCOPE 110 / T013] END

  const changeStatus = (status: string) => {
    if (status === 'declined') {
      const reason = declineReason.trim();
      if (!reason) {
        alert('A decline reason is required.');
        return;
      }
      void mutate('/status', 'PATCH', { status, declineReason: reason });
    } else {
      void mutate('/status', 'PATCH', { status });
    }
  };

  // [SCOPE 043 / T015] BEGIN — v2 disposition + accept-to-scope actions
  const setDisposition = (disposition: string) =>
    void mutate('/disposition', 'PATCH', { disposition });

  const acceptToScope = async () => {
    if (!selected) return;
    const title = scopeTitle.trim();
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/feedback/${selected.id}/accept-to-scope`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(title ? { title } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Accept to scope failed');
        return;
      }
      if (data.alreadyScoped) {
        alert(`Already accepted to scope${data.feedback?.linkedscopenumber ? ` (${data.feedback.linkedscopenumber})` : ''}.`);
      } else {
        alert(`Accepted to scope. Seed "${data.seed?.shortname ?? ''}" will materialize in VS Code on next open.`);
      }
      setScopeTitle('');
      applyResult(data.feedback);
    } catch {
      alert('Accept to scope failed');
    } finally {
      setBusy(false);
    }
  };
  // [SCOPE 043 / T015] END

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/sysadmin/dashboard')}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <h1 className="text-2xl font-bold text-white">User Feedback</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* [SCOPE 043 / T016] link to the feedback analytics dashboard */}
            <Button
              variant="outline"
              onClick={() => navigate('/sysadmin/feedback/metrics')}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Metrics
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* [SCOPE 061] Source filter — separate manual feedback from auto-captured errors */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 mr-1">Source</span>
          {([
            ['all', 'All'],
            ['manual', 'Manual feedback'],
            ['auto', 'Auto errors'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSourceFilter(value)}
              className={`px-3 py-1 rounded-full text-xs inline-flex items-center gap-1 ${
                sourceFilter === value ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {value === 'auto' && <AlertTriangle className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {['all', ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs capitalize ${
                filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* [SCOPE 110 / T014] Visibility — dismissed excluded by default, composable with the filters above */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 mr-1">Visibility</span>
          {([
            ['active', 'Active'],
            ['dismissed', 'Dismissed'],
            ['all', 'All'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setDismissedView(value)}
              className={`px-3 py-1 rounded-full text-xs inline-flex items-center gap-1 ${
                dismissedView === value ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {value === 'dismissed' && <EyeOff className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>

        {/* [SCOPE 110 / T013] Bulk action bar — present only when a selection exists */}
        {checkedIds.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-500/40 bg-slate-800/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-medium text-white">{checkedIds.size} selected</span>
            <span className="text-[11px] text-slate-400">
              ({checkedItems.filter(isAuto).length} auto · {checkedItems.filter((i) => !isAuto(i)).length} manual)
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk('dismiss')}
                className="border-slate-600 text-slate-200 hover:bg-slate-700 text-xs h-8"
              >
                <EyeOff className="h-3 w-3 mr-1" /> Dismiss
              </Button>
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk('undismiss')}
                className="border-slate-600 text-slate-200 hover:bg-slate-700 text-xs h-8"
              >
                <Eye className="h-3 w-3 mr-1" /> Undismiss
              </Button>
              <Button
                disabled={bulkBusy}
                onClick={openPurge}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8"
              >
                <Trash2 className="h-3 w-3 mr-1" /> Purge
              </Button>
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => setCheckedIds(new Set())}
                className="border-slate-600 text-slate-400 hover:bg-slate-700 text-xs h-8"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                {/* [SCOPE 110 / T013] select-all within the current filter */}
                {items.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleSelectAll}
                    title="Select all in this view"
                    className="h-4 w-4 accent-indigo-500 cursor-pointer"
                  />
                )}
                <span>Queue {loading ? '' : `(${items.length})`}</span>
                {checkedIds.size > 0 && (
                  <span className="text-xs font-normal text-indigo-300">· {checkedIds.size} selected</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No feedback in this view.</div>
              ) : (
                items.map((it) => (
                  // [SCOPE 110 / T013] row = checkbox + clickable detail selector (no nested buttons)
                  <div
                    key={it.id}
                    className={`flex items-start gap-2 p-3 rounded-lg border ${
                      checkedIds.has(it.id)
                        ? 'border-indigo-500/70 bg-indigo-500/5'
                        : selected?.id === it.id
                          ? 'border-indigo-500 bg-slate-700/50'
                          : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(it.id)}
                      onChange={() => toggleCheck(it.id)}
                      className="mt-0.5 h-4 w-4 accent-indigo-500 cursor-pointer flex-shrink-0"
                    />
                    <button
                      onClick={() => {
                        setSelected(it);
                        setNote('');
                        setQuestion(it.clarificationquestion ?? '');
                        setDeclineReason('');
                        setScopeTitle('');
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isAuto(it) ? (
                          <AlertTriangle className="h-4 w-4 text-orange-400 flex-shrink-0" />
                        ) : it.type === 'bug' ? (
                          <Bug className="h-4 w-4 text-rose-400 flex-shrink-0" />
                        ) : (
                          <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0" />
                        )}
                        <span className="text-sm text-white truncate flex-1">{it.title}</span>
                        {/* [SCOPE 110 / T014] explicit source badge — no title-prefix guessing */}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                            isAuto(it) ? 'bg-orange-500/15 text-orange-300' : 'bg-sky-500/15 text-sky-300'
                          }`}
                        >
                          {isAuto(it) ? 'Auto' : 'Manual'}
                        </span>
                        {/* [SCOPE 061] recurring auto-errors stand out via an occurrence multiplier */}
                        {isAuto(it) && (it.occurrencecount ?? 1) > 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-400 flex-shrink-0">
                            ×{it.occurrencecount}
                          </span>
                        )}
                        {it.duplicateofid && <Copy className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_STYLE[it.status] ?? 'bg-slate-600 text-slate-200'}`}>
                          {it.status}
                        </span>
                        {/* [SCOPE 110 / T014] regression + dismissed markers */}
                        {it.reopenedat && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 inline-flex items-center gap-1">
                            <RotateCcw className="h-3 w-3" /> regression
                          </span>
                        )}
                        {it.dismissedat && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-600/40 text-slate-300 inline-flex items-center gap-1">
                            <EyeOff className="h-3 w-3" /> dismissed
                          </span>
                        )}
                        {it.severity && (
                          <span className={`text-[10px] capitalize ${SEVERITY_STYLE[it.severity] ?? 'text-slate-400'}`}>
                            {it.severity}
                          </span>
                        )}
                        {/* [SCOPE 061] auto-errors show last-seen; manual feedback shows submitted-at */}
                        <span className="text-[10px] text-slate-500 ml-auto">
                          {isAuto(it) && it.lastoccurredat ? `last ${fmt(it.lastoccurredat)}` : fmt(it.createdat)}
                        </span>
                      </div>
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Detail + actions */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            {!selected ? (
              <CardContent className="py-16 text-center text-slate-400">
                Select a submission to triage.
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    {selected.source === 'auto' || selected.type === 'error' ? (
                      <AlertTriangle className="h-5 w-5 text-orange-400" />
                    ) : selected.type === 'bug' ? (
                      <Bug className="h-5 w-5 text-rose-400" />
                    ) : (
                      <Lightbulb className="h-5 w-5 text-amber-400" />
                    )}
                    {selected.title}
                  </CardTitle>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span>ref {selected.id.slice(0, 8)}</span>
                    <span>AI: {selected.classification ?? '—'} / {selected.severity ?? '—'}</span>
                    <span>submitted {fmt(selected.createdat)}</span>
                    <span>first triaged {fmt(selected.firsttriagedat)}</span>
                    <span>notify: {selected.notificationchannel} ({selected.notifystatus})</span>
                    <span>artifact: {selected.artifactstatus}</span>
                  </div>
                  {/* [SCOPE 061] auto-captured error metadata — occurrence count, window, fingerprint */}
                  {selected.source === 'auto' && (
                    <div className="text-xs text-orange-300/90 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> auto-captured error
                      </span>
                      <span>occurrences ×{selected.occurrencecount ?? 1}</span>
                      <span>first {fmt(selected.firstoccurredat ?? null)}</span>
                      <span>last {fmt(selected.lastoccurredat ?? null)}</span>
                      {selected.errorfingerprint && <span>fingerprint {selected.errorfingerprint.slice(0, 12)}</span>}
                    </div>
                  )}
                  {selected.duplicateofid && (
                    <div className="text-xs text-amber-400 mt-1">
                      Linked as duplicate of {selected.duplicateofid.slice(0, 8)}
                    </div>
                  )}
                  {/* [SCOPE 110 / T014] regression — a closed error that recurred */}
                  {selected.reopenedat && (
                    <div className="text-xs text-amber-300 mt-1 inline-flex items-center gap-1">
                      <RotateCcw className="h-3 w-3" />
                      Regression — reopened {fmt(selected.reopenedat)}
                      {typeof selected.context?.reopenedfrom === 'string' && (
                        <span className="text-slate-400"> (was {String(selected.context.reopenedfrom)})</span>
                      )}
                    </div>
                  )}
                  {selected.dismissedat && (
                    <div className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
                      <EyeOff className="h-3 w-3" /> Dismissed {fmt(selected.dismissedat)}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Details — each field labelled; multi-line/long values render
                      in a readable monospace block with whitespace preserved. */}
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Details</div>
                    {selected.details && Object.keys(selected.details).length > 0 ? (
                      <div className="space-y-3">
                        {Object.entries(selected.details)
                          // [SCOPE 043 / T030] Amendment E — attachments get their own
                          // section below; left here they would be JSON.stringify'd into
                          // an unreadable blob.
                          .filter(([k]) => k !== 'attachments')
                          .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                          .map(([k, v]) => {
                            const text = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
                            const block = text.includes('\n') || text.length > 80;
                            return (
                              <div key={k}>
                                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{k}</div>
                                {block ? (
                                  <pre className="bg-slate-900/70 border border-slate-700/60 rounded-md p-3 text-[13px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-80 overflow-y-auto">
                                    {text}
                                  </pre>
                                ) : (
                                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{text}</p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">No structured details.</div>
                    )}
                  </div>

                  {/* [SCOPE 043 / T030] Amendment E — attachments (FR-023/FR-025).
                      The list payload carries metadata + a tail excerpt only; the
                      full text is one click away on the download route. */}
                  <FeedbackAttachments feedbackId={selected.id} details={selected.details} />

                  {/* Context — clean key/value chips */}
                  {selected.context && Object.keys(selected.context).length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Context</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(selected.context)
                          .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
                          .map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700/50 text-xs"
                            >
                              <span className="text-slate-500">{k}</span>
                              <span className="text-slate-300">{String(v)}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* [SCOPE 043 / T015] BEGIN — decision layer: disposition + accept-to-scope */}
                  <div className="border border-slate-700 rounded-lg p-3 bg-slate-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase text-slate-500">Decision</div>
                      {selected.linkedscopenumber ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                          <Rocket className="h-3 w-3" /> Scoped → {selected.linkedscopenumber}
                        </span>
                      ) : selected.scopeseed ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-400">
                          Seed queued ({selected.scopeseed.shortname}) — assigns on VS Code open
                        </span>
                      ) : null}
                    </div>

                    {/* AI proposal */}
                    {selected.aiproposeddisposition && (
                      <div className="text-xs text-slate-400 flex items-start gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                        <span>
                          AI proposes{' '}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${DISPOSITION_STYLE[selected.aiproposeddisposition] ?? 'text-slate-300'}`}>
                            {DISPOSITION_LABEL[selected.aiproposeddisposition] ?? selected.aiproposeddisposition}
                          </span>
                          {selected.dispositionrationale && <span className="text-slate-500"> — {selected.dispositionrationale}</span>}
                        </span>
                      </div>
                    )}

                    {/* Disposition buttons (set / override) */}
                    <div className="flex flex-wrap gap-2">
                      {DISPOSITIONS.map((d) => {
                        const active = selected.disposition === d;
                        return (
                          <Button
                            key={d}
                            variant="outline"
                            disabled={busy}
                            onClick={() => setDisposition(d)}
                            className={`text-xs h-8 capitalize border-slate-600 ${
                              active ? `${DISPOSITION_STYLE[d]} border-transparent` : 'text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {DISPOSITION_LABEL[d]}
                          </Button>
                        );
                      })}
                    </div>
                    {selected.disposition && (
                      <div className="text-[11px] text-slate-500">
                        Current: <span className="text-slate-300">{DISPOSITION_LABEL[selected.disposition] ?? selected.disposition}</span>
                        {selected.disposition !== selected.aiproposeddisposition && selected.aiproposeddisposition && (
                          <span className="text-amber-400/80"> (overrode AI)</span>
                        )}
                      </div>
                    )}

                    {/* Accept to scope */}
                    {!selected.scopeseed && !selected.linkedscopenumber && (
                      <div className="pt-1 border-t border-slate-700/60">
                        <div className="flex gap-2">
                          <input
                            value={scopeTitle}
                            onChange={(e) => setScopeTitle(e.target.value)}
                            placeholder={`Scope title (default: "${selected.title}")`}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                          />
                          <Button
                            disabled={busy}
                            onClick={() => void acceptToScope()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                          >
                            <Rocket className="h-3 w-3 mr-1" /> Accept to scope
                          </Button>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Seeds a draft scope from the customer&apos;s text; the kit assigns the number and writes the file on next VS Code open.
                        </div>
                      </div>
                    )}
                  </div>
                  {/* [SCOPE 043 / T015] END */}

                  {/* Clarification exchange */}
                  {selected.clarificationquestion && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded p-3 text-sm">
                      <div className="text-amber-400">Q: {selected.clarificationquestion}</div>
                      <div className="text-slate-300 mt-1">
                        A: {selected.clarificationanswer ?? <span className="text-slate-500">awaiting submitter</span>}
                      </div>
                    </div>
                  )}

                  {selected.status === 'declined' && selected.declinereason && (
                    <div className="text-sm text-rose-400">Declined: {selected.declinereason}</div>
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

                  {/* Send clarification */}
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-1">Ask for more info</div>
                    <div className="flex gap-2">
                      <input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Clarifying question (AI may have drafted one)…"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                      />
                      <Button
                        disabled={busy || !question.trim()}
                        onClick={() => void mutate('/clarify', 'POST', { question: question.trim() })}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
                      >
                        <Send className="h-3 w-3 mr-1" /> Send
                      </Button>
                    </div>
                  </div>

                  {/* Internal notes */}
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-1">Internal notes (wxperts only)</div>
                    {selected.internalnotes && (
                      <pre className="bg-slate-900/60 rounded p-2 text-xs text-slate-400 whitespace-pre-wrap mb-2">
                        {selected.internalnotes}
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

                  {/* Notification retry */}
                  {selected.notifystatus === 'failed' && (
                    <div className="flex items-center gap-2 text-sm text-rose-400">
                      Notification failed.
                      <Button
                        disabled={busy}
                        onClick={() => void mutate('/retry-notification', 'POST')}
                        className="bg-slate-600 hover:bg-slate-500 text-white text-xs h-7"
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* [SCOPE 110 / T014] Purge confirmation — states the composition; any
          human-submitted record demands the typed word DELETE and lists titles. */}
      {purge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-rose-400" /> Purge {purge.ids.length} record{purge.ids.length === 1 ? '' : 's'}
              </h2>
              <button onClick={() => setPurge(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              This permanently deletes {purge.ids.length} record{purge.ids.length === 1 ? '' : 's'}
              {' '}({purge.ids.length - purge.humanTitles.length} automatic · {purge.humanTitles.length} human-submitted).
              Every deletion is audited. This cannot be undone.
            </p>
            {purge.humanTitles.length > 0 && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide text-rose-400 mb-1">
                  Human-submitted reports in this set
                </div>
                <ul className="max-h-32 overflow-y-auto rounded border border-rose-500/30 bg-rose-500/5 p-2 text-sm text-slate-200 list-disc list-inside space-y-0.5">
                  {purge.humanTitles.map((t, i) => (
                    <li key={i} className="truncate">{t}</li>
                  ))}
                </ul>
                <label className="mt-3 block text-xs text-slate-400">
                  Type <span className="font-mono font-semibold text-rose-300">DELETE</span> to confirm
                </label>
                <input
                  autoFocus
                  value={purge.text}
                  onChange={(e) => setPurge((p) => (p ? { ...p, text: e.target.value } : p))}
                  placeholder="DELETE"
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white font-mono"
                />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => setPurge(null)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm h-9"
              >
                Cancel
              </Button>
              <Button
                disabled={bulkBusy || (purge.humanTitles.length > 0 && purge.text !== 'DELETE')}
                onClick={() => void confirmPurge()}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm h-9"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Purge permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// [SCOPE 043 / T006] END
