// [SCOPE 048 / T006] Shared sub-navigation for the SysAdmin Marketing area.
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

const TABS = [
  // [SCOPE 064 / T002] Overview (first) + [SCOPE 064 / T008] Newsletter (last)
  { label: 'Overview', path: '/sysadmin/marketing/overview' },
  { label: 'Leads', path: '/sysadmin/marketing' },
  { label: 'Campaigns', path: '/sysadmin/marketing/campaigns' },
  { label: 'Assets', path: '/sysadmin/marketing/assets' },
  { label: 'Banners', path: '/sysadmin/marketing/banners' }, // [SCOPE 070 / T003]
  { label: 'Feature Snippets', path: '/sysadmin/marketing/feature-snippets' }, // [SCOPE 096]
  { label: 'Posts', path: '/sysadmin/marketing/posts' },
  { label: 'Newsletter', path: '/sysadmin/marketing/newsletter' },
  { label: 'Welcome', path: '/sysadmin/marketing/welcome' }, // [SCOPE 109 / T006]
  { label: 'AI Studio', path: '/sysadmin/marketing/ai-studio' }, // [SCOPE 065 / T005-T007]
  { label: 'FAQ', path: '/sysadmin/marketing/faq' }, // [SCOPE 066 / T004]
  { label: 'Training Sessions', path: '/sysadmin/marketing/training-sessions' }, // [SCOPE 066 / T004]
  { label: 'Bio', path: '/sysadmin/marketing/bio' }, // [SCOPE 100 / T009]
];

// [SCOPE 048 / T006] BEGIN — MarketingTabs header + sub-nav
export function MarketingHeader({
  title,
  onRefresh,
}: {
  title: string;
  onRefresh?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/sysadmin/dashboard')}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
        </div>
        {onRefresh && (
          <Button
            variant="outline"
            onClick={onRefresh}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        )}
      </div>
      <div className="flex gap-2 border-b border-slate-700">
        {TABS.map((t) => {
          const active =
            t.path === '/sysadmin/marketing'
              ? pathname === t.path
              : pathname.startsWith(t.path);
          return (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                active
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
// [SCOPE 048 / T006] END
