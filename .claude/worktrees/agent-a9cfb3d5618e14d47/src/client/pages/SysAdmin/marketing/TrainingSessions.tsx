// [SCOPE 066 / T004] SysAdmin Marketing — Training Sessions management. Upcoming
// online training sessions are marketingassets rows (category='trainingsession',
// type='page', global companyid NULL): the registration URL lives in `fileurl` and
// the schedule/description is a JSON blob in `content` ({ startsAt, timezone,
// description }). Only published sessions with a future startsAt appear on the public
// /docs "Training Sessions" section (GET /api/help/training-sessions).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';

interface SessionAsset {
  id: string;
  assetkey: string;
  locale: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  status: string;
  updatedat: string;
}

interface SessionMeta {
  startsAt?: string;
  timezone?: string;
  description?: string;
}

const STATUSES = ['draft', 'published'] as const;

const blankForm = {
  assetkey: '',
  locale: 'en-US',
  title: '',
  startsAtLocal: '',
  timezone: '',
  description: '',
  registerUrl: '',
  status: 'draft',
};

// content is a JSON blob; parse defensively so a malformed row never crashes the UI.
function parseMeta(content: string | null): SessionMeta {
  if (!content) return {};
  try {
    return JSON.parse(content) as SessionMeta;
  } catch {
    return {};
  }
}

// <input type="datetime-local"> uses naive local time; convert to/from ISO (UTC).
function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// [SCOPE 066 / T004] BEGIN — Training Sessions management component
export default function MarketingTrainingSessions() {
  const navigate = useNavigate();
  const [items, setItems] = useState<SessionAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SessionAsset | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/assets?category=trainingsession', { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setItems(data.assets ?? []);
    } catch {
      /* leave */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = () => {
    setEditing(null);
    setForm(blankForm);
  };

  const startEdit = (s: SessionAsset) => {
    const meta = parseMeta(s.content);
    setEditing(s);
    setForm({
      assetkey: s.assetkey,
      locale: s.locale,
      title: s.title,
      startsAtLocal: isoToLocalInput(meta.startsAt),
      timezone: meta.timezone ?? '',
      description: meta.description ?? '',
      registerUrl: s.fileurl ?? '',
      status: s.status,
    });
  };

  const save = async () => {
    if (!form.title.trim()) {
      alert('A session title is required.');
      return;
    }
    const startsAt = localInputToIso(form.startsAtLocal);
    if (!startsAt) {
      alert('A valid start date & time is required.');
      return;
    }
    setBusy(true);
    const key =
      form.assetkey.trim() ||
      `session-${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)}-${startsAt.slice(0, 10)}`;
    const content = JSON.stringify({
      startsAt,
      timezone: form.timezone.trim(),
      description: form.description.trim(),
    });
    const body = {
      assetkey: key,
      locale: form.locale.trim(),
      type: 'page',
      category: 'trainingsession',
      title: form.title.trim(),
      content,
      fileurl: form.registerUrl.trim() || undefined,
      status: form.status,
    };
    try {
      const url = editing
        ? `/api/sysadmin/marketing/assets/${editing.id}`
        : '/api/sysadmin/marketing/assets';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Save failed');
        return;
      }
      if (!editing && data.asset) setEditing(data.asset);
      void load();
    } catch {
      alert('Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: SessionAsset) => {
    if (!confirm(`Delete this training session?\n\n"${s.title}"`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/assets/${s.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        alert('Delete failed');
        return;
      }
      if (editing?.id === s.id) startNew();
      void load();
    } catch {
      alert('Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const whenLabel = (s: SessionAsset): string => {
    const meta = parseMeta(s.content);
    if (!meta.startsAt) return 'no date';
    const d = new Date(meta.startsAt);
    return Number.isNaN(d.getTime()) ? 'no date' : d.toLocaleString();
  };

  const isPast = (s: SessionAsset): boolean => {
    const meta = parseMeta(s.content);
    const ms = meta.startsAt ? Date.parse(meta.startsAt) : NaN;
    return !Number.isNaN(ms) && ms < Date.now();
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Training Sessions" onRefresh={() => void load()} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-indigo-400" />
                Sessions {loading ? '' : `(${items.length})`}
              </CardTitle>
              <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[65vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No sessions yet — create one.</div>
              ) : (
                items.map((s) => (
                  <div
                    key={s.id}
                    className={`w-full flex items-center gap-2 p-3 rounded-lg border ${
                      editing?.id === s.id ? 'border-indigo-500 bg-slate-700/50' : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <button onClick={() => startEdit(s)} className="flex-1 text-left min-w-0">
                      <div className="text-sm text-white truncate">{s.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {whenLabel(s)}
                        {isPast(s) && <span className="text-amber-400 ml-1">· past</span>}
                        <span className="text-indigo-300 ml-1">{s.locale}</span>
                      </div>
                    </button>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.status === 'published' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>
                      {s.status}
                    </span>
                    <button onClick={() => void remove(s)} className="text-slate-500 hover:text-red-400 p-1" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700 self-start">
            <CardHeader>
              <CardTitle className="text-white text-base">{editing ? 'Edit session' : 'New session'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Title">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Getting started with wxKanban" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start (your local time)">
                  <input type="datetime-local" value={form.startsAtLocal} onChange={(e) => setForm({ ...form, startsAtLocal: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Timezone label">
                  <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={inputCls} placeholder="CT / 3pm ET" />
                </Field>
              </div>
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} className={inputCls} placeholder="What this session covers…" />
              </Field>
              <Field label="Registration URL">
                <input value={form.registerUrl} onChange={(e) => setForm({ ...form, registerUrl: e.target.value })} className={inputCls} placeholder="https://…" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Locale">
                  <input value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className={inputCls} placeholder="en-US" />
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <div className="text-[10px] text-slate-500">
                Only <span className="text-emerald-300">published</span> sessions with a <span className="text-white">future</span> start show on the public page. The start time is stored in UTC; the timezone label is shown to visitors as-is.
              </div>
              <div className="flex gap-2 pt-1">
                <Button disabled={busy} onClick={() => void save()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm flex-1">
                  {editing ? 'Save' : 'Create'}
                </Button>
                {editing && (
                  <Button variant="outline" onClick={startNew} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">New</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
// [SCOPE 066 / T004] END
