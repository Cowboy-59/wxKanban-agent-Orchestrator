// [SCOPE 048 / T006] SysAdmin Marketing — Campaigns list + editor.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';
import { aiPost } from './aiClient';

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  segment: string;
  startdate: string | null;
  launchdate: string | null;
  status: string;
  createdat: string;
}

const SEGMENTS = ['windev', 'careerchanger', 'broad'] as const;
const STATUSES = ['planned', 'active', 'completed', 'archived'] as const;

const blankForm = {
  name: '',
  goal: '',
  segment: 'windev',
  startdate: '',
  launchdate: '',
  status: 'planned',
};

// [SCOPE 048 / T006] BEGIN — Campaigns component
export default function MarketingCampaigns() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(''); // [SCOPE 065 / T011]

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/campaigns', { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setItems(data.campaigns ?? []);
    } catch {
      /* leave list */
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

  const startEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name,
      goal: c.goal ?? '',
      segment: c.segment,
      startdate: c.startdate ? c.startdate.slice(0, 10) : '',
      launchdate: c.launchdate ? c.launchdate.slice(0, 10) : '',
      status: c.status,
    });
  };

  // [SCOPE 065 / T011] BEGIN — AI goal assist (generate from name+segment / improve current)
  const aiGoal = async (mode: 'generate' | 'improve') => {
    if (mode === 'improve' && !form.goal.trim()) { alert('Write a goal first, or use Generate.'); return; }
    setAiBusy(mode);
    try {
      const d = await aiPost<{ goal: string }>('campaign/goal', {
        name: form.name.trim() || undefined,
        segment: form.segment,
        current: mode === 'improve' ? form.goal : undefined,
      });
      if (d) setForm((f) => ({ ...f, goal: d.goal }));
    } finally { setAiBusy(''); }
  };
  // [SCOPE 065 / T011] END

  const save = async () => {
    if (!form.name.trim()) {
      alert('Name is required.');
      return;
    }
    setBusy(true);
    const body = {
      name: form.name.trim(),
      goal: form.goal.trim() || undefined,
      segment: form.segment,
      startdate: form.startdate ? new Date(form.startdate).toISOString() : undefined,
      launchdate: form.launchdate ? new Date(form.launchdate).toISOString() : undefined,
      status: form.status,
    };
    try {
      const url = editing
        ? `/api/sysadmin/marketing/campaigns/${editing.id}`
        : '/api/sysadmin/marketing/campaigns';
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
      startNew();
      void load();
    } catch {
      alert('Save failed');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Campaigns" onRefresh={() => void load()} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base">
                Campaigns {loading ? '' : `(${items.length})`}
              </CardTitle>
              <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No campaigns yet.</div>
              ) : (
                items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => startEdit(c)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      editing?.id === c.id
                        ? 'border-indigo-500 bg-slate-700/50'
                        : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-400 capitalize">{c.segment}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 capitalize">{c.status}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      launch {fmt(c.launchdate)}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base">
                {editing ? 'Edit campaign' : 'New campaign'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Name">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Goal">
                <textarea value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} rows={3} className={inputCls} />
                {/* [SCOPE 065 / T011] AI goal assist */}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <Button disabled={!!aiBusy} onClick={() => void aiGoal('generate')}
                    className="bg-indigo-600/80 hover:bg-indigo-700 text-white text-xs h-7">
                    <Wand2 className="h-3 w-3 mr-1" /> {aiBusy === 'generate' ? 'Generating…' : 'AI goal'}
                  </Button>
                  <Button disabled={!!aiBusy} onClick={() => void aiGoal('improve')} variant="outline"
                    className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 text-xs h-7">
                    <Sparkles className="h-3 w-3 mr-1" /> {aiBusy === 'improve' ? 'Improving…' : 'Improve'}
                  </Button>
                </div>
              </Field>
              <Field label="Segment">
                <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className={inputCls}>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start"><input type="date" value={form.startdate} onChange={(e) => setForm({ ...form, startdate: e.target.value })} className={inputCls} /></Field>
                <Field label="Launch"><input type="date" value={form.launchdate} onChange={(e) => setForm({ ...form, launchdate: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <div className="flex gap-2 pt-1">
                <Button disabled={busy} onClick={() => void save()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm flex-1">
                  {editing ? 'Save' : 'Create'}
                </Button>
                {editing && (
                  <Button variant="outline" onClick={startNew} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
// [SCOPE 048 / T006] END
