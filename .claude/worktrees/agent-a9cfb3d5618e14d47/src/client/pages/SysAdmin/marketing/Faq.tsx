// [SCOPE 066 / T004] SysAdmin Marketing — FAQ management: published/draft FAQs,
// an unanswered-question queue, an editor (question + answer + optional video),
// and an AI "Generate default FAQs" action. FAQs are marketingassets rows with
// category='faq' (global, companyid NULL); an unanswered question = empty content.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Trash2, HelpCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';

interface Faq {
  id: string;
  assetkey: string;
  locale: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  status: string;
  updatedat: string;
}

const STATUSES = ['draft', 'published'] as const;

const blankForm = {
  assetkey: '',
  locale: 'en-US',
  title: '',
  content: '',
  fileurl: '',
  status: 'draft',
};

// A FAQ is "unanswered" when it has no answer body yet.
const isUnanswered = (f: Faq) => !f.content || f.content.trim() === '';

// [SCOPE 066 / T004] BEGIN — FAQ management component
export default function MarketingFaq() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/assets?category=faq', { credentials: 'include' });
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

  const startEdit = (f: Faq) => {
    setEditing(f);
    setForm({
      assetkey: f.assetkey,
      locale: f.locale,
      title: f.title,
      content: f.content ?? '',
      fileurl: f.fileurl ?? '',
      status: f.status,
    });
  };

  const save = async () => {
    if (!form.title.trim()) {
      alert('A question (title) is required.');
      return;
    }
    setBusy(true);
    // Derive a stable assetkey from the question for new FAQs.
    const key =
      form.assetkey.trim() ||
      `faq-${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)}`;
    const body = {
      assetkey: key,
      locale: form.locale.trim(),
      type: 'page',
      category: 'faq',
      title: form.title.trim(),
      content: form.content.trim() || undefined,
      fileurl: form.fileurl.trim() || undefined,
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

  const remove = async (f: Faq) => {
    if (!confirm(`Delete this ${isUnanswered(f) ? 'question' : 'FAQ'}?\n\n"${f.title}"`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/assets/${f.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        alert('Delete failed');
        return;
      }
      if (editing?.id === f.id) startNew();
      void load();
    } catch {
      alert('Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!confirm('Generate a batch of default FAQs with AI? They will be added as drafts for you to review.')) return;
    setBusy(true);
    setSeedMsg('Generating…');
    try {
      const res = await fetch('/api/sysadmin/marketing/assets/faq/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count: 12 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSeedMsg(data.error || 'Generation failed.');
        return;
      }
      setSeedMsg(`Added ${data.created ?? 0} draft FAQ(s).`);
      void load();
    } catch {
      setSeedMsg('Generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const unanswered = items.filter(isUnanswered);
  const answered = items.filter((f) => !isUnanswered(f));

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — FAQ" onRefresh={() => void load()} />

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => void generate()} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
            <Sparkles className="h-3 w-3 mr-1" /> Generate default FAQs
          </Button>
          {seedMsg && <span className="text-xs text-slate-400">{seedMsg}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lists */}
          <div className="lg:col-span-2 space-y-6">
            {/* Unanswered queue */}
            <Card className="bg-slate-800/50 border-amber-700/50">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-amber-400" />
                  Unanswered questions {loading ? '' : `(${unanswered.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[35vh] overflow-y-auto">
                {loading ? (
                  <div className="text-slate-400 text-sm">Loading…</div>
                ) : unanswered.length === 0 ? (
                  <div className="text-slate-400 text-sm">No unanswered questions.</div>
                ) : (
                  unanswered.map((f) => (
                    <div
                      key={f.id}
                      className={`w-full flex items-center gap-2 p-3 rounded-lg border ${
                        editing?.id === f.id ? 'border-amber-500 bg-slate-700/50' : 'border-slate-700 bg-slate-800/40'
                      }`}
                    >
                      <button onClick={() => startEdit(f)} className="flex-1 text-left text-sm text-white truncate">
                        {f.title}
                      </button>
                      <Button onClick={() => startEdit(f)} className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7">Answer</Button>
                      <button onClick={() => void remove(f)} className="text-slate-500 hover:text-red-400 p-1" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Published / draft FAQs */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white text-base">FAQs {loading ? '' : `(${answered.length})`}</CardTitle>
                <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                  <Plus className="h-3 w-3 mr-1" /> New
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[45vh] overflow-y-auto">
                {loading ? (
                  <div className="text-slate-400 text-sm">Loading…</div>
                ) : answered.length === 0 ? (
                  <div className="text-slate-400 text-sm">No FAQs yet — write one or generate defaults.</div>
                ) : (
                  answered.map((f) => (
                    <div
                      key={f.id}
                      className={`w-full flex items-center gap-2 p-3 rounded-lg border ${
                        editing?.id === f.id ? 'border-indigo-500 bg-slate-700/50' : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                      }`}
                    >
                      <button onClick={() => startEdit(f)} className="flex-1 text-left min-w-0">
                        <div className="text-sm text-white truncate">{f.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {f.status}
                          {f.fileurl && ' · video ✓'}
                          <span className="text-indigo-300 ml-1">{f.locale}</span>
                        </div>
                      </button>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${f.status === 'published' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>
                        {f.status}
                      </span>
                      <button onClick={() => void remove(f)} className="text-slate-500 hover:text-red-400 p-1" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Editor */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700 self-start">
            <CardHeader>
              <CardTitle className="text-white text-base">{editing ? (isUnanswered(editing) ? 'Answer question' : 'Edit FAQ') : 'New FAQ'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Question">
                <textarea value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} rows={2} className={inputCls} placeholder="How do I start a project?" />
              </Field>
              <Field label="Answer (markdown)">
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={7} className={inputCls} placeholder="Write the answer…" />
              </Field>
              <Field label="Answer video URL (optional)">
                <input value={form.fileurl} onChange={(e) => setForm({ ...form, fileurl: e.target.value })} className={inputCls} placeholder="https://…" />
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
                Only <span className="text-emerald-300">published</span> FAQs with an answer show to users.
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
