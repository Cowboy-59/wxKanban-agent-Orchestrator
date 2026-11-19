// [SCOPE 070 / T003] Banner Studio — SysAdmin tab to create AI-composited, click-tracked
// banners: list + editor (prompt/copy/destination) + generate/render actions + live
// preview + export panel (PNG download, <a><img> snippet, raw URL). Mirrors Assets.tsx.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wand2, ImageDown, Copy, Move, Upload } from 'lucide-react';
import BannerLayoutEditor, { type OverlayMap } from './BannerLayoutEditor';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';

interface Banner {
  id: string;
  title: string;
  sizepreset: string;
  width: number;
  height: number;
  layout: string;
  prompt: string | null;
  headline: string | null;
  subhead: string | null;
  ctatext: string | null;
  // [SCOPE 070 / Amendment-B] v2 rich-overlay fields
  eyebrow: string | null;
  headlinesegments: { text: string; accent?: boolean }[] | null;
  badge: string | null;
  bulletslabel: string | null;
  bullets: string[] | null;
  ctaurl: string | null;
  overlayanchor: string | null;
  overlaylayout?: Record<string, { x: number; y: number; scale: number }> | null;
  bgversions?: { url: string; kind: string; instruction?: string; createdat?: string }[] | null;
  backgroundurl: string | null;
  renderedurl: string | null;
  status: string;
  targetsegment: string | null;
  slot: string | null;
  linkid: string | null;
  clickcount?: number;
  code?: string | null;
  updatedat: string;
}

interface ExportBundle {
  pngUrl: string;
  imgUrl: string;
  redirectUrl: string;
  anchorImgSnippet: string;
  width: number;
  height: number;
}

const SIZE_PRESETS = ['og', 'mrec', 'leaderboard', 'skyscraper', 'halfpage', 'mobile'] as const;
const PRESET_LABEL: Record<string, string> = {
  og: 'Social / OG 1200×630',
  mrec: 'Medium Rectangle 300×250',
  leaderboard: 'Leaderboard 728×90',
  skyscraper: 'Skyscraper 160×600',
  halfpage: 'Half Page 300×600',
  mobile: 'Mobile 320×50',
};
const SEGMENTS = ['windev', 'careerchanger', 'broad'] as const;
const ANCHORS = ['', 'left-center', 'left-top', 'left-bottom', 'center', 'center-bottom', 'right-center'] as const;

// Pre-filled with the launch-campaign defaults so a new banner opens ready to
// render — Tab through the fields to accept, or edit any of them. Editing an
// existing banner overrides these from the saved row (see openEditor).
const blankForm = {
  title: 'Launch leaderboard',
  sizepreset: 'og',
  prompt: 'abstract developer workspace, kanban board, soft depth of field, dark navy palette',
  headline: 'Unchain your WinDev, WebDev & Mobile projects',
  subhead: 'Convert your PCSoft app to a modern stack — with you, not for you.',
  ctatext: 'Start free →',
  // [SCOPE 070 / Amendment-B] v2 rich-overlay fields
  eyebrow: 'WINDEV · WEBDEV · MOBILE',
  headlinelines: 'Unchain your WinDev,\nWebDev & Mobile\n*projects.', // one line per row; prefix a line with * to render it in the accent colour
  badge: '★ COMING JULY 5TH',
  bulletslabel: 'Full conversion:',
  bullets: 'windows · pages · database · classes\nreports · queries · procedures…', // one bullet per row
  ctaurl: 'wxkanban.com',
  overlayanchor: 'left-center',
  overlaylayout: null as OverlayMap | null,
  destinationurl: 'https://wxkanban.com/registration?tier=CONSULTANT',
  targetsegment: 'broad',
  slot: 'home-hero',
};

// [SCOPE 070 / Amendment-B] convert between the textarea form and headlinesegments.
function linesToSegments(s: string): { text: string; accent?: boolean }[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('*') ? { text: l.slice(1).trim(), accent: true } : { text: l }));
}
function segmentsToLines(segs?: { text: string; accent?: boolean }[] | null): string {
  return (segs ?? []).map((s) => (s.accent ? `*${s.text}` : s.text)).join('\n');
}

// [SCOPE 070 / T003] BEGIN — BannerStudio component
export default function BannerStudio() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [exp, setExp] = useState<ExportBundle | null>(null);
  const [copied, setCopied] = useState('');
  const [direction, setDirection] = useState(''); // [SCOPE 070 / Amendment-B] AI edit instruction
  const [layoutOpen, setLayoutOpen] = useState(false); // [SCOPE 070 / Amendment-D] drag/resize editor
  // Move keyboard focus into the editor when a record (or New) is opened, so Tab
  // walks the form fields instead of cycling the list buttons behind it.
  const titleRef = useRef<HTMLInputElement>(null);
  const focusTitle = () =>
    requestAnimationFrame(() => titleRef.current?.focus());
  // [SCOPE 070 / Amendment-E] hidden file input for the custom-background upload.
  const bgFileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/sysadmin/marketing/banners${qs}`, { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setItems(data.banners ?? []);
    } catch {
      /* leave */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const startNew = () => {
    setEditing(null);
    setForm(blankForm);
    setExp(null);
    setMsg('');
    focusTitle();
  };

  const startEdit = async (b: Banner) => {
    setEditing(b);
    setExp(null);
    setMsg('');
    setForm({
      title: b.title,
      sizepreset: b.sizepreset,
      prompt: b.prompt ?? '',
      headline: b.headline ?? '',
      subhead: b.subhead ?? '',
      ctatext: b.ctatext ?? '',
      eyebrow: b.eyebrow ?? '',
      headlinelines: segmentsToLines(b.headlinesegments),
      badge: b.badge ?? '',
      bulletslabel: b.bulletslabel ?? '',
      bullets: (b.bullets ?? []).join('\n'),
      ctaurl: b.ctaurl ?? '',
      overlayanchor: b.overlayanchor ?? '',
      overlaylayout: b.overlaylayout ?? null,
      destinationurl: '',
      targetsegment: b.targetsegment ?? '',
      slot: b.slot ?? '',
    });
    focusTitle();
    // Pull the linked destination for the editor.
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${b.id}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setForm((f) => ({ ...f, destinationurl: data.link?.destinationurl ?? '' }));
        if (data.banner?.renderedurl) void loadExport(b.id);
      }
    } catch {
      /* leave */
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.destinationurl.trim()) {
      alert('Title and destination URL are required.');
      return;
    }
    setBusy(true);
    const segs = linesToSegments(form.headlinelines);
    const bulletItems = form.bullets
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Send EXPLICIT values (incl. empty string / empty array) for the editable
    // text/overlay fields so clearing a field actually persists. The PATCH handler
    // updates a field only when it's present in the body; sending `undefined` would
    // be dropped by JSON.stringify, leaving the old value in the DB. Enum fields
    // (targetsegment) still use `|| undefined` because the schema rejects "".
    const body = {
      title: form.title.trim(),
      sizepreset: form.sizepreset,
      prompt: form.prompt.trim(),
      headline: form.headline.trim(),
      subhead: form.subhead.trim(),
      ctatext: form.ctatext.trim(),
      eyebrow: form.eyebrow.trim(),
      headlinesegments: segs,
      badge: form.badge.trim(),
      bulletslabel: form.bulletslabel.trim(),
      bullets: bulletItems,
      ctaurl: form.ctaurl.trim(),
      overlayanchor: form.overlayanchor || undefined,
      overlaylayout: form.overlaylayout,
      destinationurl: form.destinationurl.trim(),
      targetsegment: form.targetsegment || undefined,
      slot: form.slot.trim(),
    };
    try {
      const url = editing
        ? `/api/sysadmin/marketing/banners/${editing.id}`
        : '/api/sysadmin/marketing/banners';
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
      if (data.banner) setEditing(data.banner);
      void load();
    } catch {
      alert('Save failed');
    } finally {
      setBusy(false);
    }
  };

  // Generate background / render — both require the banner saved first.
  const act = async (action: 'generate-bg' | 'render') => {
    if (!editing) {
      alert('Save the banner first.');
      return;
    }
    setBusy(true);
    setMsg(action === 'generate-bg' ? 'Generating background…' : 'Rendering…');
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${editing.id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Action failed.');
        return;
      }
      if (data.banner) setEditing(data.banner);
      setMsg(action === 'generate-bg' ? 'Background ready ✓' : 'Rendered ✓');
      if (action === 'render') void loadExport(editing.id);
      void load();
    } catch {
      setMsg('Action failed.');
    } finally {
      setBusy(false);
    }
  };

  // [SCOPE 070 / Amendment-E] Upload a custom background: presign → PUT to S3 → register
  // as a bgversion + activate. The bytes go straight to S3 (never through the API).
  const uploadBg = async (file: File) => {
    if (!editing) {
      alert('Save the banner first.');
      return;
    }
    setBusy(true);
    setMsg('Uploading background…');
    try {
      const presign = await fetch(
        `/api/sysadmin/marketing/banners/${editing.id}/background/upload-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            contentLength: file.size,
          }),
        },
      );
      const pdata = await presign.json().catch(() => ({}));
      if (!presign.ok) {
        setMsg(pdata.error || 'Could not get an upload URL.');
        return;
      }
      const put = await fetch(pdata.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) {
        setMsg('Upload to storage failed.');
        return;
      }
      const done = await fetch(
        `/api/sysadmin/marketing/banners/${editing.id}/background/upload-complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: pdata.publicUrl }),
        },
      );
      const ddata = await done.json().catch(() => ({}));
      if (!done.ok || !ddata.banner) {
        setMsg(ddata.error || 'Could not set the uploaded background.');
        return;
      }
      setEditing(ddata.banner);
      setMsg('Background uploaded ✓ — open Layout to arrange, then Render.');
      void load();
    } catch {
      setMsg('Upload failed.');
    } finally {
      setBusy(false);
      if (bgFileRef.current) bgFileRef.current.value = '';
    }
  };

  // [SCOPE 070 / Amendment-D] Persist a per-element drag/resize layout (or clear → auto).
  const saveLayout = async (overlaylayout: OverlayMap | null) => {
    if (!editing) return;
    const id = editing.id;
    setBusy(true);
    setMsg(overlaylayout ? 'Saving layout…' : 'Resetting layout…');
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ overlaylayout }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.banner) {
        setMsg(data.error || 'Layout save failed');
        return;
      }
      setForm((f) => ({ ...f, overlaylayout }));
      // Re-render immediately so the preview reflects the saved layout (and
      // confirms the save happened).
      setMsg('Rendering…');
      const rr = await fetch(`/api/sysadmin/marketing/banners/${id}/render`, {
        method: 'POST',
        credentials: 'include',
      });
      const rdata = await rr.json().catch(() => ({}));
      if (rr.ok && rdata.banner) {
        setEditing(rdata.banner);
        void loadExport(id);
        setMsg(overlaylayout ? 'Layout saved + rendered ✓' : 'Reset to auto + rendered ✓');
      } else {
        setEditing(data.banner);
        setMsg(`Layout saved ✓ — render failed: ${rdata.error || rr.status}`);
      }
      void load();
    } finally {
      setBusy(false);
    }
  };

  // [SCOPE 070 / Amendment-B] Direct an in-place AI edit of the current background.
  const editBg = async () => {
    if (!editing) {
      alert('Save the banner first.');
      return;
    }
    if (!direction.trim()) {
      alert('Describe the change you want.');
      return;
    }
    setBusy(true);
    setMsg('Editing background…');
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${editing.id}/edit-bg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ instruction: direction.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Edit failed.');
        return;
      }
      if (data.banner) setEditing(data.banner);
      setDirection('');
      setMsg('Background edited ✓ — render to bake it into the export.');
      void load();
    } catch {
      setMsg('Edit failed.');
    } finally {
      setBusy(false);
    }
  };

  // [SCOPE 070 / Amendment-B] Make a past background version the active one.
  const selectBg = async (url: string) => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${editing.id}/background/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.banner) setEditing(data.banner);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.banner) setEditing(data.banner);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!editing || !confirm('Delete this banner?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${editing.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        startNew();
        void load();
      }
    } finally {
      setBusy(false);
    }
  };

  const loadExport = async (id: string) => {
    try {
      const res = await fetch(`/api/sysadmin/marketing/banners/${id}/export`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setExp(data as ExportBundle);
    } catch {
      /* leave */
    }
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const previewUrl = editing?.renderedurl ?? editing?.backgroundurl ?? null;

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Banners" onRefresh={() => void load()} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-slate-500 mr-1">Status</span>
          {['all', 'draft', 'published', 'archived'].map((s) => (
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base">Banners {loading ? '' : `(${items.length})`}</CardTitle>
              <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[72vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No banners yet.</div>
              ) : (
                items.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => void startEdit(b)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      editing?.id === b.id ? 'border-indigo-500 bg-slate-700/50' : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white flex-1 truncate">{b.title}</span>
                      <span className="text-[10px] text-slate-400">{b.sizepreset}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                      <span className="capitalize">{b.status}</span>
                      {b.renderedurl && <span className="text-emerald-400">rendered ✓</span>}
                      <span className="text-indigo-300">{b.clickcount ?? 0} clicks</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor + preview + export */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-base">{editing ? 'Edit banner' : 'New banner'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Title"><input ref={titleRef} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Launch leaderboard" /></Field>
                  <Field label="Size preset">
                    <select value={form.sizepreset} onChange={(e) => setForm({ ...form, sizepreset: e.target.value })} className={inputCls}>
                      {SIZE_PRESETS.map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="AI background prompt">
                  <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={2} className={inputCls} placeholder="abstract developer workspace, kanban board, soft depth" />
                </Field>
                <Field label="Headline (single-line fallback)"><input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className={inputCls} /></Field>

                {/* [SCOPE 070 / Amendment-B] rich overlay */}
                <div className="border-t border-slate-700 pt-3 mt-1">
                  <div className="text-[11px] uppercase tracking-wide text-fuchsia-300 mb-2">Rich overlay</div>
                  <Field label="Eyebrow (small label above headline)"><input value={form.eyebrow} onChange={(e) => setForm({ ...form, eyebrow: e.target.value })} className={inputCls} placeholder="WINDEV · WEBDEV · MOBILE" /></Field>
                  <Field label="Headline lines — one per row; prefix a line with * for the accent colour">
                    <textarea value={form.headlinelines} onChange={(e) => setForm({ ...form, headlinelines: e.target.value })} rows={3} className={`${inputCls} font-mono text-[12px]`} placeholder={'Unchain your WinDev,\nWebDev & Mobile\n*projects.'} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Badge / pill"><input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} className={inputCls} placeholder="★ COMING JULY 5TH" /></Field>
                    <Field label="Overlay anchor">
                      <select value={form.overlayanchor} onChange={(e) => setForm({ ...form, overlayanchor: e.target.value })} className={inputCls}>
                        {ANCHORS.map((a) => <option key={a} value={a}>{a || '(default for size)'}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Bullets label"><input value={form.bulletslabel} onChange={(e) => setForm({ ...form, bulletslabel: e.target.value })} className={inputCls} placeholder="Full conversion:" /></Field>
                  <Field label="Bullet lines — one per row">
                    <textarea value={form.bullets} onChange={(e) => setForm({ ...form, bullets: e.target.value })} rows={2} className={`${inputCls} font-mono text-[12px]`} placeholder={'windows · pages · database · classes\nreports · queries · procedures…'} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Sub-line"><input value={form.subhead} onChange={(e) => setForm({ ...form, subhead: e.target.value })} className={inputCls} /></Field>
                  <Field label="CTA text"><input value={form.ctatext} onChange={(e) => setForm({ ...form, ctatext: e.target.value })} className={inputCls} placeholder="Start free →" /></Field>
                </div>
                <Field label="CTA URL (shown beside the button; click still tracked via /r/:code)"><input value={form.ctaurl} onChange={(e) => setForm({ ...form, ctaurl: e.target.value })} className={inputCls} placeholder="wxkanban.com" /></Field>
                <Field label="Destination URL (where the click goes)">
                  <input value={form.destinationurl} onChange={(e) => setForm({ ...form, destinationurl: e.target.value })} className={inputCls} placeholder="https://wxkanban.com/registration?tier=CONSULTANT" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Target segment">
                    <select value={form.targetsegment} onChange={(e) => setForm({ ...form, targetsegment: e.target.value })} className={inputCls}>
                      <option value="">(none)</option>
                      {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Slot (on-site placement)"><input value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })} className={inputCls} placeholder="home-hero" /></Field>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button disabled={busy} onClick={() => void save()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
                    {editing ? 'Save' : 'Create'}
                  </Button>
                  <Button disabled={busy || !editing} onClick={() => void act('generate-bg')} className="bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm">
                    <Wand2 className="h-3 w-3 mr-1" /> Generate background
                  </Button>
                  {/* [SCOPE 070 / Amendment-E] bring-your-own background image */}
                  <Button disabled={busy || !editing} onClick={() => bgFileRef.current?.click()} className="bg-slate-700 hover:bg-slate-600 text-white text-sm">
                    <Upload className="h-3 w-3 mr-1" /> Upload background
                  </Button>
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadBg(f);
                    }}
                  />
                  <Button disabled={busy || !editing} onClick={() => setLayoutOpen(true)} className="bg-amber-700 hover:bg-amber-600 text-white text-sm">
                    <Move className="h-3 w-3 mr-1" /> Layout
                  </Button>
                  <Button disabled={busy || !editing} onClick={() => void act('render')} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm">
                    <ImageDown className="h-3 w-3 mr-1" /> Render
                  </Button>
                  {editing && editing.status !== 'published' && (
                    <Button disabled={busy} onClick={() => void setStatus('published')} className="bg-sky-700 hover:bg-sky-600 text-white text-sm">Publish</Button>
                  )}
                  {editing && editing.status === 'published' && (
                    <Button disabled={busy} onClick={() => void setStatus('draft')} variant="outline" className="border-slate-600 text-slate-300 text-sm">Unpublish</Button>
                  )}
                  {editing && (
                    <Button disabled={busy} onClick={() => void del()} variant="outline" className="border-rose-700 text-rose-300 hover:bg-rose-900/30 text-sm">Delete</Button>
                  )}
                </div>
                {msg && <div className="text-xs text-slate-400">{msg}</div>}
                {!editing && <div className="text-xs text-amber-400">Create the banner first, then generate a background and render.</div>}
              </CardContent>
            </Card>

            {/* Preview */}
            {editing && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-base">Preview {editing.renderedurl ? `(${editing.width}×${editing.height})` : ''}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {previewUrl ? (
                    <div className="bg-slate-950 rounded p-3 overflow-auto">
                      <img src={previewUrl} alt="banner preview" style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }} />
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">No background yet — generate one, then render.</div>
                  )}

                  {/* [SCOPE 070 / Amendment-B] direct an AI edit of the current background */}
                  {editing.backgroundurl && (
                    <Field label="Direct the AI — change the background in place">
                      <div className="flex gap-2">
                        <textarea
                          value={direction}
                          onChange={(e) => setDirection(e.target.value)}
                          rows={2}
                          className={inputCls}
                          placeholder="warmer tone, add a subtle code grid, more empty space upper-left"
                        />
                        <Button disabled={busy} onClick={() => void editBg()} className="bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-xs self-start whitespace-nowrap">
                          <Wand2 className="h-3 w-3 mr-1" /> Apply edit
                        </Button>
                      </div>
                    </Field>
                  )}

                  {/* [SCOPE 070 / Amendment-B] background version history — click to make active */}
                  {editing.bgversions && editing.bgversions.length > 1 && (
                    <div>
                      <div className="text-xs uppercase text-slate-500 mb-1">Background versions (click to use)</div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {editing.bgversions.map((v, i) => (
                          <button
                            key={`${v.url}-${i}`}
                            onClick={() => void selectBg(v.url)}
                            title={v.instruction || v.kind}
                            className={`shrink-0 rounded border ${
                              editing.backgroundurl === v.url ? 'border-fuchsia-500' : 'border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            <img src={v.url} alt={`v${i + 1}`} style={{ width: 88, height: 56, objectFit: 'cover', display: 'block' }} />
                            <div className="text-[9px] text-slate-400 px-1 py-0.5 text-center">{v.kind}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Export */}
            {editing && exp && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-base">Export</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <a href={exp.pngUrl} download target="_blank" rel="noreferrer">
                      <Button className="bg-slate-700 hover:bg-slate-600 text-white text-sm"><ImageDown className="h-3 w-3 mr-1" /> Download PNG</Button>
                    </a>
                    <span className="text-xs text-indigo-300 self-center">{copied && `${copied} copied ✓`}</span>
                  </div>
                  <Field label="Click-tracked <a><img> snippet (paste into a site / email)">
                    <div className="flex gap-2">
                      <textarea readOnly value={exp.anchorImgSnippet} rows={3} className={`${inputCls} font-mono text-[11px]`} />
                      <Button onClick={() => copy(exp.anchorImgSnippet, 'Snippet')} className="bg-slate-700 hover:bg-slate-600 text-white text-xs self-start"><Copy className="h-3 w-3" /></Button>
                    </div>
                  </Field>
                  <Field label="Raw image URL">
                    <div className="flex gap-2">
                      <input readOnly value={exp.imgUrl} className={`${inputCls} font-mono text-[11px]`} />
                      <Button onClick={() => copy(exp.imgUrl, 'Image URL')} className="bg-slate-700 hover:bg-slate-600 text-white text-xs"><Copy className="h-3 w-3" /></Button>
                    </div>
                  </Field>
                  <Field label="Tracked redirect URL (/r/:code)">
                    <div className="flex gap-2">
                      <input readOnly value={exp.redirectUrl} className={`${inputCls} font-mono text-[11px]`} />
                      <Button onClick={() => copy(exp.redirectUrl, 'Redirect URL')} className="bg-slate-700 hover:bg-slate-600 text-white text-xs"><Copy className="h-3 w-3" /></Button>
                    </div>
                  </Field>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {layoutOpen && editing && (
        <BannerLayoutEditor
          width={editing.width}
          height={editing.height}
          layout={editing.layout}
          backgroundUrl={editing.backgroundurl}
          content={{
            eyebrow: form.eyebrow || null,
            headlinesegments: linesToSegments(form.headlinelines).length
              ? linesToSegments(form.headlinelines)
              : form.headline
                ? [{ text: form.headline }]
                : [],
            subhead: form.subhead || null,
            bulletslabel: form.bulletslabel || null,
            bullets: form.bullets
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
            badge: form.badge || null,
            ctatext: form.ctatext || null,
            ctaurl: form.ctaurl || null,
          }}
          value={form.overlaylayout}
          saving={busy}
          onSave={(m) => {
            void saveLayout(m);
            setLayoutOpen(false);
          }}
          onReset={() => void saveLayout(null)}
          onClose={() => setLayoutOpen(false)}
        />
      )}
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
// [SCOPE 070 / T003] END
