// [SCOPE 064 / T002] SysAdmin Marketing — read-only Overview rollup.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users, Filter, Megaphone, FileText, CalendarClock, Globe, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { MarketingHeader } from './MarketingTabs';

interface KeyCount { key: string; count: number }
interface Overview {
  audience: {
    total: number; distinctEmails: number; duplicateEmails: number;
    handsOnCohort: number; invalidOrBlank: number; bySignuplist: KeyCount[];
  } | null;
  leads: { total: number; byStatus: KeyCount[]; bySegment: KeyCount[] } | null;
  campaigns: { total: number; byStatus: KeyCount[] } | null;
  assets: { total: number; byType: KeyCount[]; byStatus: KeyCount[] } | null;
  posts: { total: number; upcomingScheduled: number; byChannel: KeyCount[]; byStatus: KeyCount[] } | null;
  channels: {
    windevSiteUrl: string; windevSiteLive: boolean;
    landingDocsCount: number | null; engagementTracking: 'deferred';
  };
  generatedAt: string;
}

// [SCOPE 064 / T002] BEGIN — Marketing Overview component
export default function MarketingOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  // [SCOPE 065 / T007] AI next-best-action analysis
  const [analysis, setAnalysis] = useState<{ narrative: string; actions: string[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/overview', { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      setData(await res.json());
    } catch {
      /* leave previous */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [SCOPE 065 / T007] BEGIN — AI next-best-action analysis of the rollup
  const analyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/sysadmin/marketing/ai/overview/analyze', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 429) { alert('Too many requests — give it a few seconds.'); return; }
      if (!d.ok) { alert(d.error || 'Analysis failed — try again.'); return; }
      setAnalysis(d.analysis);
    } catch {
      alert('Analysis failed — try again.');
    } finally {
      setAnalyzing(false);
    }
  };
  // [SCOPE 065 / T007] END

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Overview" onRefresh={() => void load()} />

        {/* [SCOPE 065 / T007] AI next-best-action */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                AI read on where things stand &amp; what to do next
                <span className="text-xs text-slate-500">(Claude — guidance only)</span>
              </div>
              <Button
                disabled={analyzing}
                onClick={() => void analyze()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 shrink-0"
              >
                {analyzing ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze'}
              </Button>
            </div>
            {analysis && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-200 whitespace-pre-line">{analysis.narrative}</p>
                {analysis.actions?.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-sm text-slate-300">
                    {analysis.actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
                <div className="text-[10px] text-slate-600">AI-generated · review before acting.</div>
              </div>
            )}
          </CardContent>
        </Card>

        {loading && !data ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Audience */}
            <GroupCard icon={<Users className="h-4 w-4" />} title="Audience">
              {data?.audience ? (
                <>
                  <Headline value={data.audience.total} label="total contacts" />
                  <Stats
                    rows={[
                      ['Distinct emails', data.audience.distinctEmails],
                      ['Duplicates', data.audience.duplicateEmails],
                      ['Hands-on cohort', data.audience.handsOnCohort],
                      ['Invalid / blank', data.audience.invalidOrBlank],
                    ]}
                  />
                  <Breakdown title="By list" items={data.audience.bySignuplist} />
                </>
              ) : <Unavailable />}
            </GroupCard>

            {/* Lead funnel */}
            <GroupCard
              icon={<Filter className="h-4 w-4" />}
              title="Lead Funnel"
              onOpen={() => navigate('/sysadmin/marketing')}
            >
              {data?.leads ? (
                <>
                  <Headline value={data.leads.total} label="leads captured" />
                  <Breakdown title="By status" items={data.leads.byStatus} />
                  <Breakdown title="By segment" items={data.leads.bySegment} />
                </>
              ) : <Unavailable />}
            </GroupCard>

            {/* Campaigns */}
            <GroupCard
              icon={<Megaphone className="h-4 w-4" />}
              title="Campaigns"
              onOpen={() => navigate('/sysadmin/marketing/campaigns')}
            >
              {data?.campaigns ? (
                <>
                  <Headline value={data.campaigns.total} label="campaigns" />
                  <Breakdown title="By status" items={data.campaigns.byStatus} />
                </>
              ) : <Unavailable />}
            </GroupCard>

            {/* Assets */}
            <GroupCard
              icon={<FileText className="h-4 w-4" />}
              title="Assets"
              onOpen={() => navigate('/sysadmin/marketing/assets')}
            >
              {data?.assets ? (
                <>
                  <Headline value={data.assets.total} label="assets" />
                  <Breakdown title="By type" items={data.assets.byType} />
                  <Breakdown title="By status" items={data.assets.byStatus} />
                </>
              ) : <Unavailable />}
            </GroupCard>

            {/* Posts */}
            <GroupCard
              icon={<CalendarClock className="h-4 w-4" />}
              title="Posts"
              onOpen={() => navigate('/sysadmin/marketing/posts')}
            >
              {data?.posts ? (
                <>
                  <Headline value={data.posts.total} label="posts" />
                  <Stats rows={[['Upcoming scheduled', data.posts.upcomingScheduled]]} />
                  <Breakdown title="By channel" items={data.posts.byChannel} />
                  <Breakdown title="By status" items={data.posts.byStatus} />
                </>
              ) : <Unavailable />}
            </GroupCard>

            {/* Channels & sites */}
            <GroupCard icon={<Globe className="h-4 w-4" />} title="Channels & Sites">
              <div className="flex items-center justify-between text-sm">
                <a
                  href={data?.channels.windevSiteUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline"
                >
                  windev.wxperts.com
                </a>
                <span className={data?.channels.windevSiteLive ? 'text-emerald-400' : 'text-slate-500'}>
                  {data?.channels.windevSiteLive ? '● LIVE' : 'unknown'}
                </span>
              </div>
              <Stats
                rows={[['Landing-page docs', data?.channels.landingDocsCount ?? '—']]}
              />
              <div className="mt-3 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500">
                Engagement &amp; clicks — coming soon
              </div>
            </GroupCard>
          </div>
        )}

        {data?.generatedAt && (
          <div className="text-[10px] text-slate-600">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({
  icon, title, onOpen, children,
}: {
  icon: React.ReactNode; title: string; onOpen?: () => void; children: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <span className="text-indigo-400">{icon}</span>
          {title}
        </CardTitle>
        {onOpen && (
          <button
            onClick={onOpen}
            className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
          >
            Open <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Headline({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-bold text-white">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Stats({ rows }: { rows: [string, number | string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1">
          <span className="text-xs text-slate-400">{label}</span>
          <span className="text-sm text-white">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        </div>
      ))}
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: KeyCount[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it.key}
            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/70 text-slate-200"
          >
            {it.key} <span className="text-slate-400">{it.count.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Unavailable() {
  return <div className="text-sm text-slate-500">—  (source unavailable)</div>;
}
// [SCOPE 064 / T002] END
