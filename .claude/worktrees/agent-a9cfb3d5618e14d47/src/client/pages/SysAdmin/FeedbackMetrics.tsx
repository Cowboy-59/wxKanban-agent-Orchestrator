// [SCOPE 043 / T016] Feedback analytics dashboard (FR-016) — wxperts platform
// admins see decision coverage, time-to-disposition, AI disposition accuracy,
// scope conversion, and volume trend. All tiles derive from feedbacksubmissions
// (+ cockpit/active-users families are added when their capture lands).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

interface FeedbackMetrics {
  total: number;
  decisionCoverage: { open: number; dispositioned: number; scoped: number };
  byStatus: Record<string, number>;
  byDisposition: Record<string, number>;
  medianTimeToDispositionHours: number | null;
  aiAccuracy: { judged: number; accepted: number; overridden: number; acceptRate: number | null };
  scopeConversion: { byClassification: Record<string, number>; bySeverity: Record<string, number> };
  volumeTrend: Array<{ month: string; bug: number; suggestion: number }>;
}

const fmtPct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);
const fmtHours = (h: number | null) =>
  h == null ? '—' : h < 48 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`;

// [SCOPE 043 / T016] BEGIN — small presentational helpers
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Bars({ data }: { data: Array<{ label: string; bug: number; suggestion: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.bug + d.suggestion));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-16 text-xs text-slate-400">{d.label}</div>
          <div className="flex-1 flex h-5 rounded overflow-hidden bg-slate-900">
            <div className="bg-rose-500/70" style={{ width: `${(d.bug / max) * 100}%` }} title={`${d.bug} bug`} />
            <div className="bg-amber-500/70" style={{ width: `${(d.suggestion / max) * 100}%` }} title={`${d.suggestion} suggestion`} />
          </div>
          <div className="w-14 text-right text-xs text-slate-400">{d.bug + d.suggestion}</div>
        </div>
      ))}
    </div>
  );
}

function KeyVals({ map }: { map: Record<string, number> }) {
  const entries = Object.entries(map);
  if (entries.length === 0) return <div className="text-sm text-slate-500">No data yet.</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <span key={k} className="px-2 py-1 rounded bg-slate-900/60 text-xs text-slate-300 capitalize">
          {k}: <span className="text-white font-medium">{v}</span>
        </span>
      ))}
    </div>
  );
}
// [SCOPE 043 / T016] END

// [SCOPE 043 / T016] BEGIN — FeedbackMetrics dashboard component
export default function FeedbackMetrics() {
  const navigate = useNavigate();
  const [m, setM] = useState<FeedbackMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sysadmin/feedback/metrics', { credentials: 'include' });
      if (res.status === 401) return navigate('/login');
      if (res.status === 403) return navigate('/dashboard');
      const data = await res.json();
      setM(data.metrics ?? null);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cov = m?.decisionCoverage;
  const covTotal = cov ? cov.open + cov.dispositioned + cov.scoped : 0;

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/sysadmin/feedback')}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Feedback
            </Button>
            <h1 className="text-2xl font-bold text-white">Feedback Analytics</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : !m ? (
          <div className="text-slate-400">No metrics available.</div>
        ) : (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Total feedback" value={String(m.total)} />
              <Stat
                label="Decision coverage"
                value={covTotal ? `${Math.round(((cov!.dispositioned + cov!.scoped) / covTotal) * 100)}%` : '—'}
                sub={cov ? `${cov.open} open · ${cov.dispositioned} dispositioned · ${cov.scoped} scoped` : undefined}
              />
              <Stat label="Median time-to-disposition" value={fmtHours(m.medianTimeToDispositionHours)} />
              <Stat
                label="AI disposition accuracy"
                value={fmtPct(m.aiAccuracy.acceptRate)}
                sub={`${m.aiAccuracy.accepted}/${m.aiAccuracy.judged} accepted · ${m.aiAccuracy.overridden} overridden`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Volume trend */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-base">Volume trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {m.volumeTrend.length === 0 ? (
                    <div className="text-sm text-slate-500">No data yet.</div>
                  ) : (
                    <>
                      <Bars data={m.volumeTrend.map((v) => ({ label: v.month, bug: v.bug, suggestion: v.suggestion }))} />
                      <div className="flex gap-4 mt-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-500/70 inline-block" /> bug</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500/70 inline-block" /> suggestion</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Status + disposition breakdown */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-base">By status &amp; disposition</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-2">Status</div>
                    <KeyVals map={m.byStatus} />
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-2">Disposition</div>
                    <KeyVals map={m.byDisposition} />
                  </div>
                </CardContent>
              </Card>

              {/* Scope conversion */}
              <Card className="bg-slate-800/50 border-slate-700 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white text-base">Scope conversion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-2">By classification</div>
                    <KeyVals map={m.scopeConversion.byClassification} />
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-2">By severity</div>
                    <KeyVals map={m.scopeConversion.bySeverity} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-slate-600">
              Cockpit/MCP activity and active-user families land with their capture layer (043 v2 deferred set).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
// [SCOPE 043 / T016] END
