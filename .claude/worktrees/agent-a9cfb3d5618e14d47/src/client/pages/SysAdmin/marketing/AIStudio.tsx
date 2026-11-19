// [SCOPE 065 / T005-T007] SysAdmin Marketing — AI Studio (social copy, SEO, translate, repurpose).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Share2, Search, Languages, Recycle, Copy } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MarketingHeader } from './MarketingTabs';

// All outputs are drafts for human review — nothing here posts, sends, or publishes.

interface SocialItem { channel: string; copy: string; hashtags: string[] }
interface SeoMeta { title: string; description: string; og: Record<string, string>; jsonld: unknown; copy?: string }
interface SeoFinding { severity: 'high' | 'medium' | 'low'; issue: string; fix: string }
interface SeoAuditResult { score: number; findings: SeoFinding[] }
interface Translation { locale: string; language: string; text: string | null }
interface RepurposeBundle { newsletterBlurb: string; social: SocialItem[]; summary: string }

const CHANNELS = ['linkedin', 'x', 'facebook', 'reddit', 'youtube'] as const;
type Channel = (typeof CHANNELS)[number];

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white';

// [SCOPE 065 / T005-T007] BEGIN — AI Studio component
export default function MarketingAIStudio() {
  const navigate = useNavigate();

  // Shared POST helper. Returns the parsed body on ok, else null (with an alert).
  const aiPost = async <T,>(path: string, payload: unknown): Promise<T | null> => {
    try {
      const res = await fetch(`/api/sysadmin/marketing/ai/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { navigate('/login'); return null; }
      if (res.status === 403) { navigate('/dashboard'); return null; }
      if (res.status === 429) { alert('Too many requests — give it a few seconds.'); return null; }
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { alert(data.error || 'AI generation failed — try again.'); return null; }
      return data as T;
    } catch {
      alert('AI generation failed — try again.');
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — AI Studio" />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Sparkles className="h-3 w-3 text-indigo-400" />
          Generation only — every result is a draft to review and copy. Nothing here posts or sends. (Claude)
        </div>
        <SocialTool aiPost={aiPost} />
        <SeoTool aiPost={aiPost} />
        <TranslateTool aiPost={aiPost} />
        <RepurposeTool aiPost={aiPost} />
      </div>
    </div>
  );
}

type Poster = <T,>(path: string, payload: unknown) => Promise<T | null>;

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function ToolCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <span className="text-indigo-400">{icon}</span> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function CopyBtn({ text }: { text: string }) {
  return (
    <button onClick={() => copy(text)} title="Copy" className="text-slate-400 hover:text-white shrink-0">
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Social copy (FR-007) ─────────────────────────────────────────────────────
function SocialTool({ aiPost }: { aiPost: Poster }) {
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<Channel[]>(['linkedin', 'x']);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<SocialItem[] | null>(null);

  const toggle = (c: Channel) =>
    setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const run = async () => {
    if (!message.trim() || channels.length === 0) { alert('Enter a message and pick at least one channel.'); return; }
    setBusy(true);
    const d = await aiPost<{ items: SocialItem[] }>('social', { message: message.trim(), channels });
    if (d) setItems(d.items);
    setBusy(false);
  };

  return (
    <ToolCard icon={<Share2 className="h-4 w-4" />} title="Social copy">
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
        placeholder="What's the message? (e.g. announce the July launch)" className={inputCls} />
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((c) => (
          <button key={c} onClick={() => toggle(c)}
            className={`text-xs px-2 py-1 rounded-full capitalize ${
              channels.includes(c) ? 'bg-indigo-600 text-white' : 'bg-slate-700/70 text-slate-300'
            }`}>
            {c}
          </button>
        ))}
      </div>
      <Button disabled={busy} onClick={() => void run()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
        {busy ? 'Generating…' : 'Generate copy'}
      </Button>
      {items?.map((it, i) => (
        <div key={i} className="rounded bg-slate-900/60 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase text-indigo-300">{it.channel}</span>
            <CopyBtn text={`${it.copy}\n\n${(it.hashtags ?? []).join(' ')}`} />
          </div>
          <p className="text-sm text-slate-200 whitespace-pre-line">{it.copy}</p>
          {it.hashtags?.length > 0 && <div className="text-xs text-slate-400">{it.hashtags.join(' ')}</div>}
        </div>
      ))}
    </ToolCard>
  );
}

// ── SEO generate + audit (FR-008 / FR-009) ───────────────────────────────────
function SeoTool({ aiPost }: { aiPost: Poster }) {
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [seo, setSeo] = useState<SeoMeta | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const [auditInput, setAuditInput] = useState('');
  const [audit, setAudit] = useState<SeoAuditResult | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const gen = async () => {
    if (!topic.trim()) { alert('Enter a page topic.'); return; }
    setGenBusy(true);
    const d = await aiPost<{ seo: SeoMeta }>('seo/generate', { topic: topic.trim(), keywords: keywords.trim() || undefined });
    if (d) setSeo(d.seo);
    setGenBusy(false);
  };

  const runAudit = async () => {
    const v = auditInput.trim();
    if (!v) { alert('Paste page HTML, or a windev.wxperts.com URL.'); return; }
    const isUrl = /^https?:\/\//i.test(v);
    setAuditBusy(true);
    const d = await aiPost<{ audit: SeoAuditResult }>('seo/audit', isUrl ? { url: v } : { html: v });
    if (d) setAudit(d.audit);
    setAuditBusy(false);
  };

  const sevCls: Record<SeoFinding['severity'], string> = {
    high: 'text-rose-400', medium: 'text-amber-400', low: 'text-slate-400',
  };

  return (
    <ToolCard icon={<Search className="h-4 w-4" />} title="SEO">
      <div className="text-[10px] uppercase text-slate-500">Generate metadata</div>
      <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Page topic" className={inputCls} />
      <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Target keywords (optional)" className={inputCls} />
      <Button disabled={genBusy} onClick={() => void gen()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
        {genBusy ? 'Generating…' : 'Generate SEO'}
      </Button>
      {seo && (
        <div className="rounded bg-slate-900/60 p-3 space-y-2 text-sm">
          <Row label="Title" value={seo.title} />
          <Row label="Description" value={seo.description} />
          <div className="flex items-start justify-between gap-2">
            <pre className="text-xs text-slate-300 overflow-x-auto flex-1">{JSON.stringify(seo.jsonld, null, 2)}</pre>
            <CopyBtn text={JSON.stringify(seo.jsonld)} />
          </div>
          {seo.copy && <Row label="Copy" value={seo.copy} />}
        </div>
      )}

      <div className="text-[10px] uppercase text-slate-500 pt-2">Audit a page</div>
      <textarea value={auditInput} onChange={(e) => setAuditInput(e.target.value)} rows={3}
        placeholder="Paste page HTML, or a https://windev.wxperts.com/… URL" className={`${inputCls} font-mono text-xs`} />
      <Button disabled={auditBusy} onClick={() => void runAudit()} variant="outline"
        className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 text-sm">
        {auditBusy ? 'Auditing…' : 'Audit'}
      </Button>
      {audit && (
        <div className="rounded bg-slate-900/60 p-3 space-y-2">
          <div className="text-sm text-white">Score: <span className="font-bold">{audit.score}</span>/100</div>
          {audit.findings?.map((f, i) => (
            <div key={i} className="text-xs">
              <span className={`uppercase font-semibold ${sevCls[f.severity]}`}>{f.severity}</span>
              <span className="text-slate-200"> — {f.issue}</span>
              <div className="text-slate-400">↳ {f.fix}</div>
            </div>
          ))}
        </div>
      )}
    </ToolCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div><span className="text-slate-500">{label}: </span><span className="text-slate-200">{value}</span></div>
      <CopyBtn text={value} />
    </div>
  );
}

// ── Translate into all 5 locales (FR-010) ────────────────────────────────────
function TranslateTool({ aiPost }: { aiPost: Poster }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Translation[] | null>(null);

  const run = async () => {
    if (!text.trim()) { alert('Enter copy to translate.'); return; }
    setBusy(true);
    const d = await aiPost<{ translations: Translation[] }>('translate', { text: text.trim() });
    if (d) setOut(d.translations);
    setBusy(false);
  };

  return (
    <ToolCard icon={<Languages className="h-4 w-4" />} title="Translate (5 languages)">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
        placeholder="English marketing copy to translate" className={inputCls} />
      <Button disabled={busy} onClick={() => void run()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
        {busy ? 'Translating…' : 'Translate all'}
      </Button>
      {out?.map((t) => (
        <div key={t.locale} className="rounded bg-slate-900/60 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase text-indigo-300">{t.language} · {t.locale}</span>
            {t.text && <CopyBtn text={t.text} />}
          </div>
          {t.text
            ? <p className="text-sm text-slate-200 whitespace-pre-line">{t.text}</p>
            : <p className="text-xs text-rose-400">Couldn't translate this language — try again.</p>}
        </div>
      ))}
    </ToolCard>
  );
}

// ── Repurpose one → many (FR-011) ────────────────────────────────────────────
function RepurposeTool({ aiPost }: { aiPost: Poster }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [bundle, setBundle] = useState<RepurposeBundle | null>(null);

  const run = async () => {
    if (!message.trim()) { alert('Enter a source message.'); return; }
    setBusy(true);
    const d = await aiPost<{ bundle: RepurposeBundle }>('repurpose', { message: message.trim() });
    if (d) setBundle(d.bundle);
    setBusy(false);
  };

  return (
    <ToolCard icon={<Recycle className="h-4 w-4" />} title="Repurpose (one → many)">
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
        placeholder="One source message to spin into newsletter + social + summary" className={inputCls} />
      <Button disabled={busy} onClick={() => void run()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
        {busy ? 'Working…' : 'Repurpose'}
      </Button>
      {bundle && (
        <div className="space-y-2">
          <div className="rounded bg-slate-900/60 p-3">
            <div className="flex items-center justify-between"><span className="text-xs uppercase text-indigo-300">Newsletter blurb</span><CopyBtn text={bundle.newsletterBlurb} /></div>
            <p className="text-sm text-slate-200 whitespace-pre-line">{bundle.newsletterBlurb}</p>
          </div>
          {bundle.social?.map((it, i) => (
            <div key={i} className="rounded bg-slate-900/60 p-3">
              <div className="flex items-center justify-between"><span className="text-xs uppercase text-indigo-300">{it.channel}</span><CopyBtn text={`${it.copy}\n\n${(it.hashtags ?? []).join(' ')}`} /></div>
              <p className="text-sm text-slate-200 whitespace-pre-line">{it.copy}</p>
              {it.hashtags?.length > 0 && <div className="text-xs text-slate-400">{it.hashtags.join(' ')}</div>}
            </div>
          ))}
          <div className="text-xs text-slate-400">Summary: {bundle.summary}</div>
        </div>
      )}
    </ToolCard>
  );
}
// [SCOPE 065 / T005-T007] END
