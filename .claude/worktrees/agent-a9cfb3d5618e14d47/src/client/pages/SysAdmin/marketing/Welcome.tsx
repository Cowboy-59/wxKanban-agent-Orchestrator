// [SCOPE 109 / T006] SysAdmin Marketing — Customer Welcome Message.
import { useEffect, useState, useCallback } from 'react';
import { Send, Mail, AlertTriangle, Users, RotateCcw, Eye, Eraser } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';

interface WelcomeView {
  id: string;
  subject: string;
  body: string;
  status: 'draft' | 'live';
  joinlink: string | null;
  publishedat: string | null;
  updatedat: string | null;
  capacity: number;
  consumed: number;
  remaining: number;
  lowcapacity: boolean;
  exhausted: boolean;
  lowthreshold: number;
  sentcount: number;
  failedcount: number;
  eligiblecount: number;
  senderconfigured: boolean;
  backfill: {
    running: boolean;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    stoppedreason: string | null;
  };
}

interface SendRow {
  id: string;
  email: string;
  status: string;
  error: string | null;
  trigger: string;
  sentat: string | null;
}

const API = '/api/sysadmin/marketing/welcome';

// [SCOPE 109 / T006] BEGIN — Welcome message component
export default function MarketingWelcome() {
  const [view, setView] = useState<WelcomeView | null>(null);
  const [form, setForm] = useState({ subject: '', body: '', joinlink: '', capacity: 0 });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState<SendRow[]>([]);

  const load = useCallback(async () => {
    const r = await fetch(API, { credentials: 'include' });
    if (!r.ok) return;
    const data: WelcomeView = await r.json();
    setView(data);
    if (!dirty) {
      setForm({
        subject: data.subject,
        body: data.body,
        joinlink: data.joinlink ?? '',
        capacity: data.capacity,
      });
    }
  }, [dirty]);

  const loadFailed = useCallback(async () => {
    const r = await fetch(`${API}/sends?status=failed`, { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    setFailed(d.sends ?? []);
  }, []);

  useEffect(() => {
    void load();
    void loadFailed();
  }, [load, loadFailed]);

  // Poll while a backfill runs so progress is visible (mirrors the newsletter).
  useEffect(() => {
    if (!view?.backfill?.running) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [view?.backfill?.running, load]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(API, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: form.subject,
        body: form.body,
        joinlink: form.joinlink || null,
        linkcapacity: Number(form.capacity) || 0,
      }),
    });
    setBusy(false);
    if (r.ok) {
      setDirty(false);
      setMsg('Saved.');
      await load();
    } else setMsg('Save failed.');
  };

  const act = async (path: string, body?: unknown, label = 'Done.') => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? label : d.error || 'Action failed.');
    await load();
    await loadFailed();
  };

  if (!view) {
    return (
      <div className="p-6 text-slate-400">
        <MarketingHeader />
        Loading…
      </div>
    );
  }

  const isLive = view.status === 'live';

  return (
    <div className="p-6 space-y-4">
      <MarketingHeader />

      {!view.senderconfigured && (
        <Banner tone="warn">
          The SES sender is not configured (<code>NEWSLETTER_FROM</code>) — nothing can be sent.
        </Banner>
      )}
      {view.exhausted && (
        <Banner tone="error">
          The join link is <strong>exhausted</strong> ({view.consumed}/{view.capacity} used). Welcomes are
          blocked until you raise the capacity or replace the link.
        </Banner>
      )}
      {view.lowcapacity && (
        <Banner tone="warn">
          Only <strong>{view.remaining}</strong> join-link uses remain (below {view.lowthreshold}). Raise the
          capacity or replace the link soon.
        </Banner>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" /> Welcome message
              <span
                className={`ml-2 text-[10px] px-2 py-0.5 rounded ${
                  isLive ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {isLive ? 'LIVE' : 'DRAFT'}
              </span>
            </CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setPreview((p) => !p)}>
              {preview ? <Eraser className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
              {preview ? 'Edit' : 'Preview'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Subject">
              <input
                className={inputCls}
                value={form.subject}
                onChange={(e) => {
                  setForm({ ...form, subject: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>

            {preview ? (
              <div
                className="bg-white text-slate-900 rounded p-4 text-sm min-h-[220px] overflow-auto"
                dangerouslySetInnerHTML={{ __html: renderPreview(form.body, form.joinlink) }}
              />
            ) : (
              <Field label="Body — use {{firstname}} and {{joinlink}} as placeholders">
                <textarea
                  className={`${inputCls} min-h-[220px] font-mono`}
                  value={form.body}
                  onChange={(e) => {
                    setForm({ ...form, body: e.target.value });
                    setDirty(true);
                  }}
                />
              </Field>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={save} disabled={busy || !dirty}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => act('/test', undefined, 'Test sent.')} disabled={busy}>
                <Send className="w-3 h-3 mr-1" /> Send test to me
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => act('/publish', undefined, 'Published — triggers are armed.')}
                disabled={busy || dirty || isLive}
                title={dirty ? 'Save your changes first' : undefined}
              >
                {isLive ? 'Live' : 'Publish'}
              </Button>
            </div>
            {msg && <p className="text-xs text-slate-400">{msg}</p>}
            {dirty && isLive && (
              <p className="text-[11px] text-amber-400">
                Saving an edit returns the message to draft — you'll need to publish again to re-arm the
                triggers.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">YappChatt join link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Join link">
                <input
                  className={inputCls}
                  value={form.joinlink}
                  placeholder="https://www.yappchatt.com/…"
                  onChange={(e) => {
                    setForm({ ...form, joinlink: e.target.value });
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Total capacity (uses)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.capacity}
                  onChange={(e) => {
                    setForm({ ...form, capacity: Number(e.target.value) });
                    setDirty(true);
                  }}
                />
              </Field>
              <div className="text-xs text-slate-300">
                <Stat label="Remaining" value={`${view.remaining} of ${view.capacity}`} emphasis={view.lowcapacity || view.exhausted} />
                <Stat label="Consumed" value={String(view.consumed)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" /> Reach
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-300 space-y-1">
              <Stat label="Welcomed" value={String(view.sentcount)} />
              <Stat label="Failed" value={String(view.failedcount)} emphasis={view.failedcount > 0} />
              <Stat label="Not yet welcomed" value={String(view.eligiblecount)} />
              <div className="pt-2 space-y-2">
                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy || !isLive || view.backfill.running || view.eligiblecount === 0}
                  onClick={() =>
                    act('/backfill', undefined, 'Backfill started.')
                  }
                >
                  {view.backfill.running
                    ? `Sending… ${view.backfill.sent}/${view.backfill.total}`
                    : `Send to ${view.eligiblecount} existing customers`}
                </Button>
                {view.backfill.stoppedreason && (
                  <p className="text-[11px] text-amber-400">Stopped: {view.backfill.stoppedreason}</p>
                )}
                {!isLive && (
                  <p className="text-[11px] text-slate-500">Publish the message to enable the backfill.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {failed.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Failed sends ({failed.length})
            </CardTitle>
            <Button size="sm" variant="secondary" disabled={busy || !isLive} onClick={() => act('/retry', {}, 'Retry finished.')}>
              <RotateCcw className="w-3 h-3 mr-1" /> Retry all
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto text-xs">
              <table className="w-full">
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left py-1">Email</th>
                    <th className="text-left">Trigger</th>
                    <th className="text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {failed.map((f) => (
                    <tr key={f.id} className="border-t border-slate-800">
                      <td className="py-1">{f.email}</td>
                      <td>{f.trigger}</td>
                      <td className="text-slate-400">{f.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
// [SCOPE 109 / T006] END

function renderPreview(body: string, joinlink: string): string {
  const withTokens = body
    .replace(/\{\{\s*firstname\s*\}\}/gi, 'Alex')
    .replace(/\{\{\s*joinlink\s*\}\}/gi, joinlink || '#');
  if (/<(p|div|h[1-6]|ul|ol|table|blockquote)\b/i.test(withTokens)) return withTokens;
  return withTokens
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p style="margin:0 0 16px">${b.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className={emphasis ? 'text-amber-400 font-medium' : 'text-white'}>{value}</span>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'error'
      ? 'border-red-800 bg-red-950 text-red-200'
      : 'border-amber-800 bg-amber-950 text-amber-200';
  return <div className={`rounded border px-3 py-2 text-xs ${cls}`}>{children}</div>;
}

const inputCls =
  'w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white disabled:opacity-60';
