// [SCOPE 064 / T008] SysAdmin Marketing — Newsletter compose + send.
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, Sparkles, Wand2, Eye, RotateCcw, Mail, Eraser } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';
import { SUPPORTED_LOCALES } from '../../../i18n';
import { VIRTUAL_SEGMENTS, isVirtualSegment } from '../../../../shared/newsletter-segments';

// [SCOPE 064 / T010] Amendment A — an issue targets marketing contacts, registered
// users, or both; when users are included it belongs to one opt-in category.
type Audience = 'marketing' | 'users' | 'both';
type UserCategory = 'updates' | 'promos';

interface Issue {
  id: string;
  subject: string;
  body: string;
  segment: string;
  audience: Audience;
  usercategory: UserCategory | null;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  recipientcount: number;
  sentcount: number;
  failedcount: number;
  createdat: string;
  sentat: string | null;
}
interface SendRow {
  id: string;
  email: string;
  status: string;
  error: string | null;
  sentat: string | null;
}

// Known marketingcontacts signuplists offered in the recipient-list dropdown.
const KNOWN_SEGMENTS = ['customer-import', 'launch-notify'];

const blankForm = {
  subject: '',
  body: '',
  segment: 'customer-import',
  audience: 'marketing' as Audience,
  usercategory: 'updates' as UserCategory,
};

// [SCOPE 064 / T008] BEGIN — Newsletter component
export default function MarketingNewsletter() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sends, setSends] = useState<SendRow[]>([]);
  // [SCOPE 064] Language for the "Send to me" review copy (en-US = source, no translation).
  const [testLocale, setTestLocale] = useState('en-US');
  // [SCOPE 064] Show the exact rendered email + recipient count for confirmation
  // before the real blast; the send only fires from the modal's Confirm button.
  const [confirmSend, setConfirmSend] = useState(false);
  // [SCOPE 065 / T004] AI assist state
  const [aiBrief, setAiBrief] = useState('');
  const [aiBusy, setAiBusy] = useState('');
  const [variants, setVariants] = useState<{ subjects: string[]; ctas: string[] } | null>(null);
  const [layoutNotes, setLayoutNotes] = useState<string[]>([]);
  // [SCOPE 065 / T012] Undo stack for AI edits + a rendered email preview toggle.
  const [history, setHistory] = useState<{ subject: string; body: string }[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Snapshot the current subject/body onto the undo stack (call before an AI edit).
  const pushHistory = (snap: { subject: string; body: string }) =>
    setHistory((h) => [...h, snap]);

  // Restore the most recent snapshot (undo the last AI edit / variant apply).
  const rollback = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setForm((f) => ({ ...f, subject: prev.subject, body: prev.body }));
    setHistory((h) => h.slice(0, -1));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/newsletter/issues', { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setItems(data.issues ?? []);
    } catch {
      /* leave list */
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  // [SCOPE 064 / T010] Re-preview the recipient count when the audience selection
  // changes on a saved draft, so the count tracks the live form.
  useEffect(() => {
    if (!editing) return;
    void previewRecipients(editing.id, {
      audience: form.audience,
      segment: form.segment,
      usercategory: form.usercategory,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, form.audience, form.segment, form.usercategory]);

  // [SCOPE 064 / T010] Preview the deduped recipient count for the current audience
  // selection (query overrides let it reflect an unsaved change to a saved draft).
  const previewRecipients = async (
    id: string,
    opts?: { audience: Audience; segment: string; usercategory: UserCategory },
  ) => {
    setRecipientCount(null);
    try {
      const qs = opts
        ? `?audience=${opts.audience}&segment=${encodeURIComponent(opts.segment)}&usercategory=${opts.usercategory}`
        : '';
      const res = await fetch(`/api/sysadmin/marketing/newsletter/issues/${id}/recipients${qs}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRecipientCount(data.count ?? null);
    } catch {
      /* leave null */
    }
  };

  const startNew = () => {
    setEditing(null);
    setForm(blankForm);
    setRecipientCount(null);
    setSends([]);
    setVariants(null);
    setAiBrief('');
    setLayoutNotes([]);
    setHistory([]);
    setShowPreview(false);
  };

  const startEdit = async (i: Issue) => {
    setEditing(i);
    const audience = i.audience ?? 'marketing';
    const usercategory = i.usercategory ?? 'updates';
    setForm({ subject: i.subject, body: i.body, segment: i.segment, audience, usercategory });
    setSends([]);
    setHistory([]);
    setShowPreview(false);
    void previewRecipients(i.id, { audience, segment: i.segment, usercategory });
    try {
      const res = await fetch(`/api/sysadmin/marketing/newsletter/issues/${i.id}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSends(data.sends ?? []);
    } catch {
      /* leave */
    }
  };

  // [SCOPE 065 / T004] BEGIN — newsletter AI assist (generate / improve / variants)
  const aiPost = async <T,>(path: string, payload: unknown): Promise<T | null> => {
    const res = await fetch(`/api/sysadmin/marketing/ai/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) { alert('Too many requests — give it a few seconds.'); return null; }
    if (!data.ok) { alert(data.error || 'AI generation failed — try again.'); return null; }
    return data as T;
  };

  const aiGenerate = async () => {
    if (!aiBrief.trim()) { alert('Enter a short brief for the AI to draft from.'); return; }
    const snap = { subject: form.subject, body: form.body };
    setAiBusy('generate');
    try {
      const d = await aiPost<{ draft: { subject: string; body: string } }>('newsletter/draft', { brief: aiBrief.trim() });
      if (d) { pushHistory(snap); setForm((f) => ({ ...f, subject: d.draft.subject, body: d.draft.body })); }
    } finally { setAiBusy(''); }
  };

  const aiImprove = async () => {
    if (!form.subject.trim() || !form.body.trim()) { alert('Need a subject and body to improve.'); return; }
    const snap = { subject: form.subject, body: form.body };
    setAiBusy('improve');
    try {
      const d = await aiPost<{ draft: { subject: string; body: string } }>('newsletter/improve', {
        subject: form.subject, body: form.body, instruction: aiBrief.trim() || undefined,
      });
      if (d) { pushHistory(snap); setForm((f) => ({ ...f, subject: d.draft.subject, body: d.draft.body })); }
    } finally { setAiBusy(''); }
  };

  const aiVariants = async () => {
    if (!form.subject.trim() || !form.body.trim()) { alert('Need a subject and body for variants.'); return; }
    setAiBusy('variants');
    try {
      const d = await aiPost<{ variants: { subjects: string[]; ctas: string[] } }>('newsletter/variants', {
        subject: form.subject, body: form.body,
      });
      if (d) setVariants(d.variants);
    } finally { setAiBusy(''); }
  };

  // [SCOPE 065 / T012] Layout is DETERMINISTIC — it turns exactly what you typed into
  // HTML email paragraphs. No AI, no titles, no rewording, no dropped text: it only
  // wraps blank-line-separated blocks in <p>, converts single newlines to <br>, and
  // makes URLs clickable. Idempotent — if the body already looks like HTML, it's left
  // untouched so re-running never mangles your markup.
  const formatToHtml = () => {
    if (!form.body.trim()) { alert('Nothing to format yet.'); return; }
    const alreadyHtml = /<(p|div|br|h[1-6]|ul|ol|li|table|tr|td|a|strong|em|span|img)\b/i.test(form.body);
    if (alreadyHtml) {
      setLayoutNotes(['This already contains HTML — left unchanged (Layout never rewrites your markup).']);
      return;
    }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const linkify = (s: string) =>
      s.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#4f46e5">${u}</a>`);
    const html = form.body
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => `<p style="margin:0 0 16px">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`)
      .join('\n');
    if (!html || html === form.body) return;
    pushHistory({ subject: form.subject, body: form.body });
    setForm((f) => ({ ...f, body: html }));
    setLayoutNotes(['Wrapped your text into HTML paragraphs — wording unchanged, nothing added or removed.']);
  };

  // [SCOPE 065] Deterministic inverse of Format-as-HTML: strip tags back to plain
  // text (block-close → blank line, <br> → newline, entities decoded). No AI, no
  // rewording — only the markup is removed. Undoable via Rollback.
  const stripFormatting = () => {
    if (!form.body.trim()) { alert('Nothing to clear yet.'); return; }
    if (!/<[a-z][\s\S]*?>/i.test(form.body)) {
      setLayoutNotes(['No HTML to remove — the body is already plain text.']);
      return;
    }
    const text = form.body
      .replace(/\r\n/g, '\n')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '') // drop all remaining tags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&') // decode ampersand last to avoid double-decoding
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
    if (text === form.body) return;
    pushHistory({ subject: form.subject, body: form.body });
    setForm((f) => ({ ...f, body: text }));
    setLayoutNotes(['Removed HTML formatting — plain text only, wording unchanged.']);
  };
  // [SCOPE 065 / T004] END

  // [SCOPE 064 / T011] "Send to me" — one review copy to the logged-in sysadmin's email.
  const sendToMe = async () => {
    if (!form.subject.trim() || !form.body.trim()) { alert('Need a subject and body to send a test.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/newsletter/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: form.subject, body: form.body, locale: testLocale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'Test send failed'); return; }
      const label = SUPPORTED_LOCALES.find((l) => l.code === testLocale)?.label ?? testLocale;
      if (testLocale !== 'en-US' && data.translated === false) {
        alert(`Review copy sent to ${data.to}, but translation to ${label} failed — sent in English.`);
      } else {
        alert(`Review copy sent to ${data.to}${testLocale !== 'en-US' ? ` in ${label}` : ''}.`);
      }
    } catch {
      alert('Test send failed');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const includesMarketing = form.audience === 'marketing' || form.audience === 'both';
    if (!form.subject.trim() || !form.body.trim()) {
      alert('Subject and body are required.');
      return;
    }
    if (includesMarketing && !form.segment.trim()) {
      alert('A marketing segment is required for the marketing audience.');
      return;
    }
    setBusy(true);
    const body = {
      subject: form.subject.trim(),
      body: form.body,
      audience: form.audience,
      segment: includesMarketing ? form.segment.trim() : undefined,
      usercategory: form.audience === 'marketing' ? undefined : form.usercategory,
    };
    try {
      const url = editing
        ? `/api/sysadmin/marketing/newsletter/issues/${editing.id}`
        : '/api/sysadmin/marketing/newsletter/issues';
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
      if (data.issue) void startEdit(data.issue);
      void load();
    } catch {
      alert('Save failed');
    } finally {
      setBusy(false);
    }
  };

  // [SCOPE 064] Open the confirmation modal (shows the actual rendered email +
  // recipient count). The real send only fires from doSend() below.
  const send = () => {
    if (!editing) return;
    if (!form.subject.trim() || !form.body.trim()) { alert('Need a subject and body to send.'); return; }
    setConfirmSend(true);
  };

  const doSend = async () => {
    if (!editing) return;
    setConfirmSend(false);
    setBusy(true);
    const id = editing.id;
    try {
      const res = await fetch(`/api/sysadmin/marketing/newsletter/issues/${id}/send`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Send failed to start');
        return;
      }
      alert('Send started — recipients are being processed in the background.');
      void load();
      setEditing((cur) => (cur && cur.id === id ? { ...cur, status: 'sending' } : cur));
      // [SCOPE 064] Background send finishes asynchronously; poll until it leaves
      // 'sending' so the status flips to sent/failed (and counts update) without a
      // manual refresh. Fire-and-forget — does not hold the button busy.
      void pollUntilDone(id);
    } catch {
      alert('Send failed to start');
    } finally {
      setBusy(false);
    }
  };

  // [SCOPE 064] Poll an in-flight issue until the background send completes, then
  // reflect the final status (sent/failed) + send record in the UI.
  const pollUntilDone = async (id: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const r = await fetch(`/api/sysadmin/marketing/newsletter/issues/${id}`, { credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.issue && d.issue.status !== 'sending') {
          void load();
          setEditing((cur) => (cur && cur.id === id ? d.issue : cur));
          setSends(d.sends ?? []);
          return;
        }
      } catch {
        // transient — keep polling
      }
    }
  };

  // [SCOPE 064] Revert a sent/failed issue back to draft so it can be edited and
  // re-sent (a sent issue is otherwise locked — the send route only accepts a draft).
  const revertToDraft = async () => {
    if (!editing) return;
    if (!confirm(`Revert "${editing.subject}" back to draft? You can then edit it and send again.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/newsletter/issues/${editing.id}/revert`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'Revert failed'); return; }
      void load();
      if (data.issue) void startEdit(data.issue);
    } catch {
      alert('Revert failed');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
  const isDraft = !editing || editing.status === 'draft';
  // [SCOPE 064 / T014] True when a saved issue's segment isn't one of the built-in
  // lists (legacy/custom signuplist) — the picker then carries it as its own option so
  // the value is preserved instead of rendering blank.
  const isUnlistedSegment =
    !KNOWN_SEGMENTS.includes(form.segment) && !isVirtualSegment(form.segment);

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Newsletter" onRefresh={() => void load()} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Issue list */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-base">
                Issues {loading ? '' : `(${items.length})`}
              </CardTitle>
              <Button onClick={startNew} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-slate-400 text-sm">No issues yet.</div>
              ) : (
                items.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => void startEdit(i)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      editing?.id === i.id
                        ? 'border-indigo-500 bg-slate-700/50'
                        : 'border-slate-700 bg-slate-800/40 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white flex-1 truncate">{i.subject}</span>
                      <StatusBadge status={i.status} />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {audienceLabel(i)} · {fmt(i.createdat)}
                      {i.status === 'sent' && ` · sent ${i.sentcount}/${i.recipientcount}, failed ${i.failedcount}`}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Compose / detail */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base">
                {editing ? (isDraft ? 'Edit draft' : `Issue — ${editing.status}`) : 'New issue'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Subject">
                <input
                  value={form.subject}
                  disabled={!isDraft}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className={inputCls}
                />
              </Field>
              {/* [SCOPE 064 / T010] Amendment A — audience picker (marketing / users / both). */}
              <Field label="Audience">
                <select
                  value={form.audience}
                  disabled={!isDraft}
                  onChange={(e) => setForm({ ...form, audience: e.target.value as Audience })}
                  className={inputCls}
                >
                  <option value="marketing">Marketing contacts</option>
                  <option value="users">Registered users</option>
                  <option value="both">Both (deduped by email)</option>
                </select>
              </Field>
              {(form.audience === 'users' || form.audience === 'both') && (
                <Field label="User category">
                  <select
                    value={form.usercategory}
                    disabled={!isDraft}
                    onChange={(e) => setForm({ ...form, usercategory: e.target.value as UserCategory })}
                    className={inputCls}
                  >
                    <option value="updates">Product updates &amp; announcements</option>
                    <option value="promos">Offers &amp; promotions</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Only registered users opted into this category receive the issue.
                  </p>
                </Field>
              )}
              {(form.audience === 'marketing' || form.audience === 'both') && (
                <Field label="Recipient list (marketingcontacts)">
                  {/* [SCOPE 064 / T014] A real <select>, consistent with the Audience and
                      User-category dropdowns above, so every list — including the virtual
                      "Hands-on" cohort — is visible at a glance. This replaced a
                      datalist-backed free-text input: because the field is pre-filled
                      (customer-import), the datalist filtered its own suggestions down to
                      that single value, leaving the other lists undiscoverable. */}
                  <select
                    value={form.segment}
                    disabled={!isDraft}
                    onChange={(e) => setForm({ ...form, segment: e.target.value })}
                    className={inputCls}
                  >
                    {KNOWN_SEGMENTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    {VIRTUAL_SEGMENTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                    {/* A saved issue carrying a signuplist we don't list (legacy/custom)
                        still shows its own value rather than silently rendering blank
                        and switching the issue's audience on the next save. */}
                    {isUnlistedSegment && (
                      <option value={form.segment}>{form.segment || '(none)'}</option>
                    )}
                  </select>
                  {isVirtualSegment(form.segment) && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      {VIRTUAL_SEGMENTS.find((s) => s.value === form.segment)?.hint}
                    </p>
                  )}
                </Field>
              )}
              {/* [SCOPE 065 / T012] Body field with an Edit ⇄ Preview toggle (second view = exactly what recipients see). */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs uppercase text-slate-500">Body (HTML)</div>
                  <div className="flex items-center gap-3">
                    {/* [SCOPE 065 / T012] Deterministic: wraps your exact text as email HTML — no AI, no titles, no rewrite. */}
                    {isDraft && (
                      <button
                        type="button"
                        onClick={formatToHtml}
                        title="Wrap your text as HTML email paragraphs — your wording is never changed"
                        className="text-[11px] text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
                      >
                        <Wand2 className="h-3 w-3" /> Format as HTML
                      </button>
                    )}
                    {/* [SCOPE 065] Deterministic inverse — strip HTML back to plain text. */}
                    {isDraft && (
                      <button
                        type="button"
                        onClick={stripFormatting}
                        title="Strip HTML back to plain text — your wording is never changed"
                        className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1"
                      >
                        <Eraser className="h-3 w-3" /> Remove formatting
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPreview((p) => !p)}
                      className="text-[11px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" /> {showPreview ? 'Edit HTML' : 'Preview email'}
                    </button>
                  </div>
                </div>
                {showPreview ? (
                  <iframe
                    title="Email preview"
                    srcDoc={previewHtml(form.subject, form.body)}
                    className="w-full h-96 rounded border border-slate-700 bg-white"
                  />
                ) : (
                  <textarea
                    value={form.body}
                    disabled={!isDraft}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    rows={10}
                    className={`${inputCls} font-mono text-xs`}
                  />
                )}
              </div>

              {/* [SCOPE 065 / T004] AI assist — drafts populate the fields above; review before saving */}
              {isDraft && (
                <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-indigo-300">
                    <Sparkles className="h-3 w-3" /> AI assist <span className="text-slate-500">(Claude — review before saving)</span>
                  </div>
                  <input
                    value={aiBrief}
                    onChange={(e) => setAiBrief(e.target.value)}
                    placeholder="Brief for Generate, or focus note for Improve (e.g. 'shorter, more urgent')"
                    className={inputCls}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={!!aiBusy} onClick={() => void aiGenerate()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                      <Wand2 className="h-3 w-3 mr-1" /> {aiBusy === 'generate' ? 'Generating…' : 'Generate'}
                    </Button>
                    <Button disabled={!!aiBusy} onClick={() => void aiImprove()} variant="outline" className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 text-xs h-8">
                      {aiBusy === 'improve' ? 'Improving…' : 'Improve'}
                    </Button>
                    <Button disabled={!!aiBusy} onClick={() => void aiVariants()} variant="outline" className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 text-xs h-8">
                      {aiBusy === 'variants' ? 'Thinking…' : 'Variants'}
                    </Button>
                    {/* [SCOPE 065 / T012] Undo the last AI edit — restores subject + body. */}
                    <Button
                      disabled={!!aiBusy || history.length === 0}
                      onClick={rollback}
                      variant="outline"
                      className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 text-xs h-8"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Rollback{history.length ? ` (${history.length})` : ''}
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    These are <span className="text-indigo-300">suggestions</span> — they only change the draft when you click them. Use <span className="text-amber-300">Rollback</span> to undo, and <span className="text-indigo-300">Preview email</span> to see exactly what recipients get. Your saved draft is never changed on its own.
                  </p>
                  {layoutNotes.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-400 pt-1">
                      {layoutNotes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                  {variants && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <div className="text-[10px] uppercase text-slate-500 mb-1">Subject options (click to use)</div>
                        <div className="flex flex-col gap-1">
                          {variants.subjects.map((s, i) => (
                            <button key={i}
                              onClick={() => { pushHistory({ subject: form.subject, body: form.body }); setForm((f) => ({ ...f, subject: s })); }}
                              className="text-left text-xs px-2 py-1 rounded bg-slate-900/60 text-slate-200 hover:bg-slate-700/60">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-slate-500 mb-1">CTA options</div>
                        <div className="flex flex-wrap gap-1">
                          {variants.ctas.map((c, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/70 text-slate-200">{c}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editing && (
                <div className="flex items-center justify-between rounded bg-slate-900/60 px-3 py-2 text-sm">
                  <span className="text-slate-400">Recipients (deduped, valid, not unsubscribed)</span>
                  <span className="text-white">{recipientCount ?? '…'}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {isDraft && (
                  <Button disabled={busy} onClick={() => void save()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
                    {editing ? 'Update Draft' : 'Create draft'}
                  </Button>
                )}
                {/* [SCOPE 064 / T011] Send a single review copy to yourself before the real blast. */}
                {/* [SCOPE 064] Pick the language to proof the localized copy the same way a real send translates it. */}
                {isDraft && (
                  <div className="flex items-center gap-1">
                    <select
                      value={testLocale}
                      onChange={(e) => setTestLocale(e.target.value)}
                      disabled={busy}
                      title="Language for the review copy"
                      className="rounded-md border border-emerald-500/40 bg-slate-800 text-emerald-200 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {SUPPORTED_LOCALES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                    <Button disabled={busy} onClick={() => void sendToMe()} variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-sm">
                      <Mail className="h-3 w-3 mr-1" /> Send to me
                    </Button>
                  </div>
                )}
                {editing && editing.status === 'draft' && (
                  <Button disabled={busy} onClick={() => void send()} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
                    <Send className="h-3 w-3 mr-1" /> Send
                  </Button>
                )}
                {/* [SCOPE 064] Sent/failed issues are locked; revert to draft to edit & re-send. */}
                {editing && editing.status !== 'draft' && (
                  <Button disabled={busy} onClick={() => void revertToDraft()} variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-sm">
                    <RotateCcw className="h-3 w-3 mr-1" /> Revert to draft
                  </Button>
                )}
                {editing && (
                  <Button variant="outline" onClick={startNew} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm">
                    Close
                  </Button>
                )}
              </div>

              {sends.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs uppercase text-slate-500 mb-1">Send record ({sends.length})</div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {sends.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-900/50">
                        <span className="text-slate-300 truncate">{s.email}</span>
                        <span className={s.status === 'sent' ? 'text-emerald-400' : 'text-rose-400'}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* [SCOPE 064] Pre-send confirmation — shows the exact rendered email and the
          recipient count; the real blast only fires from Confirm. Cancel stops it. */}
      {confirmSend && editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmSend(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-700 bg-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-700">
              <h3 className="text-white text-base font-semibold">Confirm send</h3>
              <p className="text-xs text-slate-400 mt-1">
                This is the exact email that will go out to{' '}
                <span className="text-emerald-300 font-medium">{recipientCount ?? '…'}</span>{' '}
                recipient{recipientCount === 1 ? '' : 's'} ({audienceLabel(editing)}). Non-English
                members receive an auto-translated copy.
              </p>
            </div>
            <div className="p-4 overflow-y-auto">
              <iframe
                title="Email to be sent"
                srcDoc={previewHtml(form.subject, form.body)}
                className="w-full h-[55vh] rounded border border-slate-700 bg-white"
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-700 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmSend(false)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => void doSend()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
              >
                <Send className="h-3 w-3 mr-1" /> Send to {recipientCount ?? '…'} recipient
                {recipientCount === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// [SCOPE 065 / T012] Render the composed issue as recipients would see it in their
// inbox — a faux subject bar + the body in the same shell the send service uses. The
// unsubscribe link is inert here (real links are per-recipient, added at send time).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// [SCOPE 064] Mirror the server's toEmailHtml so preview == what's actually sent:
// a plain-text/line-broken body renders with its breaks instead of collapsing to
// one blob. A body with real block structure is trusted as-is.
function bodyToEmailHtml(body: string): string {
  if (/<(p|div|h[1-6]|ul|ol|table|blockquote)\b/i.test(body)) return body;
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p style="margin:0 0 16px">${block.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function previewHtml(subject: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#1e293b;background:#f1f5f9">
<div style="max-width:640px;margin:0 auto;background:#ffffff">
  <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Subject</div>
    <div style="font-size:15px;font-weight:600;color:#0f172a">${escapeHtml(subject) || '(no subject)'}</div>
  </div>
  <div style="padding:16px;line-height:1.5">
    ${bodyToEmailHtml(body)}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
    <p style="font-size:12px;color:#94a3b8">You received this because you're subscribed. <a href="#" style="color:#94a3b8" onclick="return false">Unsubscribe</a>. <span style="color:#cbd5e1">(preview)</span></p>
  </div>
</div></body></html>`;
}

// [SCOPE 064 / T010] Short audience descriptor for the issue list.
function audienceLabel(i: Issue): string {
  const cat = i.usercategory === 'promos' ? 'offers' : 'updates';
  switch (i.audience) {
    case 'users':
      return `users · ${cat}`;
    case 'both':
      return `both · ${i.segment} + users(${cat})`;
    default:
      return i.segment || 'marketing';
  }
}

const inputCls =
  'w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white disabled:opacity-60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: Issue['status'] }) {
  const cls: Record<Issue['status'], string> = {
    draft: 'bg-slate-700 text-slate-300',
    sending: 'bg-amber-600/30 text-amber-300',
    sent: 'bg-emerald-600/30 text-emerald-300',
    failed: 'bg-rose-600/30 text-rose-300',
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${cls[status]}`}>{status}</span>;
}
// [SCOPE 064 / T008] END
