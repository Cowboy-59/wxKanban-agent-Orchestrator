// [SCOPE 066 / T006] BEGIN — FaqPanel: read-only published FAQs + an "ask a question"
// form. Reused on the User Dashboard and Project Detail. Reads GET /api/faq and posts
// to POST /api/faq/questions; only published, answered FAQs are returned by the server.
import { useEffect, useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { useTranslation } from '~/client/i18n'; // [SCOPE 066] FAQ i18n

interface FaqItem {
  id: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  locale: string;
}

export default function FaqPanel({ className = '' }: { className?: string }) {
  const { t, locale } = useTranslation();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askMsg, setAskMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // Fetch FAQs for the active language; fall back to English if none exist yet
      // for this locale so the panel is never empty for a non-English user.
      let res = await fetch(`/api/faq?locale=${encodeURIComponent(locale)}`, { credentials: 'include' });
      let data = res.ok ? await res.json() : { faqs: [] };
      if ((data.faqs?.length ?? 0) === 0 && locale !== 'en-US') {
        res = await fetch('/api/faq?locale=en-US', { credentials: 'include' });
        if (res.ok) data = await res.json();
      }
      setFaqs(data.faqs ?? []);
    } catch {
      /* leave */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [locale]);

  const submit = async () => {
    const q = question.trim();
    if (q.length < 5) {
      setAskMsg(t('faqPage.panel.tooShort'));
      return;
    }
    setAsking(true);
    setAskMsg('');
    try {
      const res = await fetch('/api/faq/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: q, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAskMsg(data.error || t('faqPage.panel.submitError'));
        return;
      }
      setQuestion('');
      setAskMsg(data.message || t('faqPage.panel.thanks'));
    } catch {
      setAskMsg(t('faqPage.panel.submitError'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card className={`bg-slate-800/50 border-slate-700 ${className}`}>
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-400" />
          {t('faqPage.panel.heading')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {loading ? (
            <div className="text-slate-400 text-sm">{t('faqPage.panel.loading')}</div>
          ) : faqs.length === 0 ? (
            <div className="text-slate-400 text-sm">{t('faqPage.panel.empty')}</div>
          ) : (
            faqs.map((f) => {
              const open = openId === f.id;
              return (
                <div key={f.id} className="rounded-lg border border-slate-700 bg-slate-800/40">
                  <button
                    onClick={() => setOpenId(open ? null : f.id)}
                    className="w-full flex items-center justify-between gap-2 p-3 text-left"
                  >
                    <span className="text-sm text-white">{f.title}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="px-3 pb-3 space-y-2">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{f.content}</p>
                      {f.fileurl && (
                        <video src={f.fileurl} controls className="w-full rounded-lg border border-slate-700" />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="text-xs uppercase text-slate-500">{t('faqPage.panel.askPrompt')}</div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={t('faqPage.panel.placeholder')}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
          />
          <div className="flex items-center gap-2">
            <Button disabled={asking} onClick={() => void submit()} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
              {asking ? t('faqPage.panel.sending') : t('faqPage.panel.submit')}
            </Button>
            {askMsg && <span className="text-xs text-slate-400">{askMsg}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
// [SCOPE 066 / T006] END
