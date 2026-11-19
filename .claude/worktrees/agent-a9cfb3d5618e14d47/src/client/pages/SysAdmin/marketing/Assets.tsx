// [SCOPE 048 / T007] SysAdmin Marketing — Asset library: filterable grid, locale
// variants grouped by assetkey, text editor, and presigned binary upload.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';

interface Asset {
  id: string;
  assetkey: string;
  locale: string;
  type: string;
  category: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  targetsegment: string | null;
  campaignid: string | null;
  status: string;
  updatedat: string;
}

const TYPES = ['post', 'page', 'video', 'synopsis', 'image', 'download', 'guide'] as const;
const CATEGORIES = ['open', 'training', 'faq', 'migrationguides'] as const;
const SEGMENTS = ['windev', 'careerchanger', 'broad'] as const;
const STATUSES = ['draft', 'scheduled', 'published'] as const;
const TEXT_TYPES = new Set(['post', 'page', 'synopsis']);

const blankForm = {
  assetkey: '',
  locale: 'en-US',
  type: 'post',
  category: 'open',
  title: '',
  content: '',
  targetsegment: '',
  status: 'draft',
};

// [SCOPE 048 / T007] BEGIN — Assets component
export default function MarketingAssets() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/sysadmin/marketing/assets${qs}`, { credentials: 'include' });
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
  }, [categoryFilter, typeFilter]);

  const startNew = () => {
    setEditing(null);
    setForm(blankForm);
    setUploadMsg('');
  };

  const startEdit = (a: Asset) => {
    setEditing(a);
    setUploadMsg('');
    setForm({
      assetkey: a.assetkey,
      locale: a.locale,
      type: a.type,
      category: a.category ?? 'open',
      title: a.title,
      content: a.content ?? '',
      targetsegment: a.targetsegment ?? '',
      status: a.status,
    });
  };

  const save = async () => {
    if (!form.assetkey.trim() || !form.title.trim()) {
      alert('Asset key and title are required.');
      return;
    }
    setBusy(true);
    const body = {
      assetkey: form.assetkey.trim(),
      locale: form.locale.trim(),
      type: form.type,
      category: form.category,
      title: form.title.trim(),
      content: TEXT_TYPES.has(form.type) ? form.content : undefined,
      targetsegment: form.targetsegment || undefined,
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

  // Presigned upload: request URL -> PUT binary to S3 -> PATCH fileurl.
  const onUpload = async (file: File) => {
    if (!editing) {
      alert('Save the asset first, then upload its file.');
      return;
    }
    setBusy(true);
    setUploadMsg('Requesting upload URL…');
    try {
      const presign = await fetch(`/api/sysadmin/marketing/assets/${editing.id}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename: file.name, contentType: file.type, contentLength: file.size }),
      });
      const pdata = await presign.json().catch(() => ({}));
      if (!presign.ok) {
        setUploadMsg(pdata.error || 'Could not get upload URL.');
        return;
      }
      setUploadMsg('Uploading to storage…');
      const put = await fetch(pdata.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) {
        setUploadMsg('Upload to storage failed.');
        return;
      }
      await fetch(`/api/sysadmin/marketing/assets/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fileurl: pdata.publicUrl }),
      });
      setUploadMsg('Uploaded ✓');
      void load();
    } catch {
      setUploadMsg('Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const isText = TEXT_TYPES.has(form.type);

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Assets" onRefresh={() => void load()} />

        {/* Primary separation: asset library section (open vs training) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-slate-500 mr-1">Section</span>
          {['all', ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs capitalize ${
                categoryFilter === cat ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-slate-500 mr-1">Type</span>
          {['all', ...TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-full text-xs capitalize ${
                typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Grid */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base">Assets {loading ? '' : `(${items.length})`}</CardTitle>
              <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No assets yet.</div>
              ) : (
                items.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => startEdit(a)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      editing?.id === a.id ? 'border-indigo-500 bg-slate-700/50' : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {TEXT_TYPES.has(a.type) ? <FileText className="h-4 w-4 text-slate-400" /> : <ImageIcon className="h-4 w-4 text-slate-400" />}
                      <span className="text-sm text-white flex-1 truncate">{a.title}</span>
                      {a.category === 'training' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600/30 text-emerald-300 capitalize">training</span>
                      )}
                      <span className="text-[10px] text-slate-400 capitalize">{a.type}</span>
                      <span className="text-[10px] text-indigo-300">{a.locale}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      key: {a.assetkey} · {a.status}
                      {a.fileurl && ' · file ✓'}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base">{editing ? 'Edit asset' : 'New asset'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Asset key"><input value={form.assetkey} onChange={(e) => setForm({ ...form, assetkey: e.target.value })} className={inputCls} placeholder="launch-post" /></Field>
                <Field label="Locale"><input value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className={inputCls} placeholder="en-US" /></Field>
              </div>
              <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Section">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                    {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Target segment">
                <select value={form.targetsegment} onChange={(e) => setForm({ ...form, targetsegment: e.target.value })} className={inputCls}>
                  <option value="">(none)</option>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {isText ? (
                <Field label="Content (markdown)">
                  <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} className={inputCls} />
                </Field>
              ) : (
                <Field label="Binary file">
                  {editing?.fileurl && (
                    <a href={editing.fileurl} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 break-all block mb-1">{editing.fileurl}</a>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600">
                      <Upload className="h-3 w-3" /> Choose file
                    </span>
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
                  </label>
                  {uploadMsg && <div className="text-xs text-slate-400 mt-1">{uploadMsg}</div>}
                  {!editing && <div className="text-xs text-amber-400 mt-1">Save the asset first to enable upload.</div>}
                </Field>
              )}
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
// [SCOPE 048 / T007] END
