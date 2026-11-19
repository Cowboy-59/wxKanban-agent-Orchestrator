// [SCOPE 048 / T008] SysAdmin Marketing — Posts board + content calendar.
// Manual publishing: compose/schedule in-app, a human posts to the channel, then
// records the live URL and marks it published.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Wand2, LayoutTemplate } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';
import { aiPost } from './aiClient';

interface Post {
  id: string;
  campaignid: string;
  assetid: string | null;
  channel: string;
  content: string | null;
  locale: string;
  status: string;
  scheduledat: string | null;
  liveurl: string | null;
  publishedat: string | null;
}
interface Campaign { id: string; name: string }

const CHANNELS = ['facebook', 'x', 'linkedin', 'forum', 'youtube', 'blog'] as const;
const STATUSES = ['draft', 'scheduled', 'published'] as const;

const blankForm = {
  campaignid: '',
  channel: 'facebook',
  content: '',
  locale: 'en-US',
  status: 'draft',
  scheduledat: '',
  liveurl: '',
};

// [SCOPE 048 / T008] BEGIN — Posts board + calendar component
export default function MarketingPosts() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'board' | 'calendar'>('board');
  const [editing, setEditing] = useState<Post | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(''); // [SCOPE 065 / T011]
  const [layoutNotes, setLayoutNotes] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/sysadmin/marketing/posts', { credentials: 'include' }),
        fetch('/api/sysadmin/marketing/campaigns', { credentials: 'include' }),
      ]);
      if (pRes.status === 401 || cRes.status === 401) return navigate('/login');
      if (pRes.status === 403 || cRes.status === 403) return navigate('/dashboard');
      setPosts((await pRes.json()).posts ?? []);
      setCampaigns((await cRes.json()).campaigns ?? []);
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
    setForm({ ...blankForm, campaignid: campaigns[0]?.id ?? '' });
    setLayoutNotes([]);
  };

  const startEdit = (p: Post) => {
    setEditing(p);
    setForm({
      campaignid: p.campaignid,
      channel: p.channel,
      content: p.content ?? '',
      locale: p.locale,
      status: p.status,
      scheduledat: p.scheduledat ? p.scheduledat.slice(0, 16) : '',
      liveurl: p.liveurl ?? '',
    });
    setLayoutNotes([]);
  };

  // [SCOPE 065 / T011] BEGIN — post content + layout assist
  const aiContent = async (mode: 'generate' | 'improve') => {
    if (!form.campaignid) { alert('Pick a campaign first (gives the AI context).'); return; }
    if (mode === 'improve' && !form.content.trim()) { alert('Write some content first, or use Generate.'); return; }
    setAiBusy(mode);
    try {
      const d = await aiPost<{ content: string }>('post/content', {
        channel: form.channel,
        context: `Campaign: ${campaignName(form.campaignid)}`,
        locale: form.locale,
        instruction: mode === 'improve' ? `Improve this draft: ${form.content}` : undefined,
      });
      if (d) { setForm((f) => ({ ...f, content: d.content })); setLayoutNotes([]); }
    } finally { setAiBusy(''); }
  };

  const aiLayout = async () => {
    if (!form.content.trim()) { alert('Write or generate content first.'); return; }
    setAiBusy('layout');
    try {
      const d = await aiPost<{ content: string; notes: string[] }>('layout', {
        channel: form.channel,
        content: form.content,
      });
      if (d) { setForm((f) => ({ ...f, content: d.content })); setLayoutNotes(d.notes ?? []); }
    } finally { setAiBusy(''); }
  };
  // [SCOPE 065 / T011] END

  const save = async () => {
    if (!form.campaignid) {
      alert('Pick a campaign (create one first if none exist).');
      return;
    }
    setBusy(true);
    const body = {
      campaignid: form.campaignid,
      channel: form.channel,
      content: form.content.trim() || undefined,
      locale: form.locale,
      status: form.status,
      scheduledat: form.scheduledat ? new Date(form.scheduledat).toISOString() : undefined,
      liveurl: form.liveurl.trim() || undefined,
    };
    try {
      const url = editing ? `/api/sysadmin/marketing/posts/${editing.id}` : '/api/sysadmin/marketing/posts';
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

  const campaignName = (id: string) => campaigns.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  // Calendar buckets: scheduled posts grouped by date (yyyy-mm-dd).
  const byDate = new Map<string, Post[]>();
  for (const p of posts) {
    if (!p.scheduledat) continue;
    const day = new Date(p.scheduledat).toLocaleDateString();
    byDate.set(day, [...(byDate.get(day) ?? []), p]);
  }
  const calendarDays = [...byDate.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const PostCard = ({ p }: { p: Post }) => (
    <button
      onClick={() => startEdit(p)}
      className={`w-full text-left p-2 rounded border text-xs ${
        editing?.id === p.id ? 'border-indigo-500 bg-slate-700/50' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-white capitalize">{p.channel}</span>
        <span className="text-indigo-300">{p.locale}</span>
      </div>
      <div className="text-slate-400 mt-0.5 truncate">{campaignName(p.campaignid)}</div>
      {p.scheduledat && <div className="text-slate-500 mt-0.5">{fmt(p.scheduledat)}</div>}
      {p.liveurl && <a href={p.liveurl} target="_blank" rel="noreferrer" className="text-indigo-300 underline">live ↗</a>}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Posts" onRefresh={() => void load()} />

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['board', 'calendar'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded-full text-xs capitalize ${view === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
            <Plus className="h-3 w-3 mr-1" /> New post
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {loading ? (
              <div className="text-slate-400 text-sm">Loading…</div>
            ) : view === 'board' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {STATUSES.map((s) => {
                  const col = posts.filter((p) => p.status === s);
                  return (
                    <Card key={s} className="bg-slate-800/50 border-slate-700">
                      <CardHeader><CardTitle className="text-white text-sm capitalize">{s} ({col.length})</CardTitle></CardHeader>
                      <CardContent className="space-y-2 max-h-[65vh] overflow-y-auto">
                        {col.length === 0 ? <div className="text-slate-500 text-xs">—</div> : col.map((p) => <PostCard key={p.id} p={p} />)}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader><CardTitle className="text-white text-sm">Scheduled content calendar</CardTitle></CardHeader>
                <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {calendarDays.length === 0 ? (
                    <div className="text-slate-500 text-xs">No scheduled posts. Set a "scheduled" date on a post.</div>
                  ) : (
                    calendarDays.map((day) => (
                      <div key={day}>
                        <div className="text-xs uppercase text-indigo-300 mb-1">{day}</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {byDate.get(day)!.map((p) => <PostCard key={p.id} p={p} />)}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Editor */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700 h-fit">
            <CardHeader><CardTitle className="text-white text-base">{editing ? 'Edit post' : 'New post'}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Campaign">
                <select value={form.campaignid} onChange={(e) => setForm({ ...form, campaignid: e.target.value })} className={inputCls}>
                  <option value="">(select)</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Channel">
                  <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className={inputCls}>
                    {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Locale"><input value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className={inputCls} /></Field>
              </div>
              {/* [SCOPE 065 / T011] Post content + AI assist (wording + layout) */}
              <Field label="Content">
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={6}
                  placeholder="Post copy — write it, or let AI draft it from the campaign + channel."
                  className={inputCls}
                />
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <Button disabled={!!aiBusy} onClick={() => void aiContent('generate')}
                    className="bg-indigo-600/80 hover:bg-indigo-700 text-white text-xs h-7">
                    <Wand2 className="h-3 w-3 mr-1" /> {aiBusy === 'generate' ? 'Generating…' : 'AI draft'}
                  </Button>
                  <Button disabled={!!aiBusy} onClick={() => void aiContent('improve')} variant="outline"
                    className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 text-xs h-7">
                    <Sparkles className="h-3 w-3 mr-1" /> {aiBusy === 'improve' ? 'Improving…' : 'Improve'}
                  </Button>
                  <Button disabled={!!aiBusy} onClick={() => void aiLayout()} variant="outline"
                    className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 text-xs h-7">
                    <LayoutTemplate className="h-3 w-3 mr-1" /> {aiBusy === 'layout' ? 'Formatting…' : 'Layout'}
                  </Button>
                </div>
                {layoutNotes.length > 0 && (
                  <ul className="mt-2 list-disc list-inside space-y-0.5 text-[11px] text-slate-400">
                    {layoutNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                )}
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Scheduled at"><input type="datetime-local" value={form.scheduledat} onChange={(e) => setForm({ ...form, scheduledat: e.target.value })} className={inputCls} /></Field>
              <Field label="Live URL (after posting)"><input value={form.liveurl} onChange={(e) => setForm({ ...form, liveurl: e.target.value })} className={inputCls} placeholder="https://…" /></Field>
              <div className="flex gap-2 pt-1">
                <Button disabled={busy} onClick={() => void save()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm flex-1">
                  {editing ? 'Save' : 'Create'}
                </Button>
                {editing && <Button variant="outline" onClick={startNew} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">New</Button>}
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
// [SCOPE 048 / T008] END
