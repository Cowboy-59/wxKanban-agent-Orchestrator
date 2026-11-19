import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Progress } from './ui/Progress';
import { Crown, Users, FolderOpen, HardDrive, Check } from 'lucide-react';

interface TierInfo {
  tier: string;
  limits: {
    maxUsers: number;
    maxProjects: number;
    maxStorageGB: number;
    features: string[];
  };
  usage: {
    users: number;
    projects: number;
    storageGB: number;
  };
}

interface TierInfoCardProps {
  tierInfo: TierInfo;
  onUpgrade?: () => void;
  loading?: boolean;
}

const TIER_NAMES: Record<string, string> = {
  FREE: 'Free',
  SMALL_BUSINESS: 'Small Business',
  CONSULTANT: 'Consultant',
  ENTERPRISE: 'Enterprise',
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'text-slate-400',
  SMALL_BUSINESS: 'text-blue-400',
  CONSULTANT: 'text-purple-400',
  ENTERPRISE: 'text-amber-400',
};

export const TierInfoCard: React.FC<TierInfoCardProps> = ({
  tierInfo,
  onUpgrade,
  loading = false,
}) => {
  const { tier, limits, usage } = tierInfo;
  const tierName = TIER_NAMES[tier] || tier;
  const tierColor = TIER_COLORS[tier] || 'text-slate-400';

  const userPercentage = Math.min((usage.users / limits.maxUsers) * 100, 100);
  const projectPercentage = Math.min((usage.projects / limits.maxProjects) * 100, 100);
  const storagePercentage = Math.min((usage.storageGB / limits.maxStorageGB) * 100, 100);

  const isNearUserLimit = userPercentage >= 80;
  const isNearProjectLimit = projectPercentage >= 80;
  const isNearStorageLimit = storagePercentage >= 80;

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-slate-700 rounded w-1/3"></div>
            <div className="h-4 bg-slate-700 rounded w-1/2"></div>
            <div className="space-y-2">
              <div className="h-2 bg-slate-700 rounded"></div>
              <div className="h-2 bg-slate-700 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Crown className={`h-5 w-5 ${tierColor}`} />
              {tierName} Plan
            </CardTitle>
            <CardDescription className="text-slate-400">
              Your current subscription tier
            </CardDescription>
          </div>
          {tier !== 'ENTERPRISE' && onUpgrade && (
            <Button
              onClick={onUpgrade}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Crown className="mr-2 h-4 w-4" />
              Upgrade
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Users Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <Users className="h-4 w-4" />
              <span>Team Members</span>
            </div>
            <span className={`font-medium ${isNearUserLimit ? 'text-red-400' : 'text-slate-300'}`}>
              {usage.users} / {limits.maxUsers === 999 ? 'Unlimited' : limits.maxUsers}
            </span>
          </div>
          {limits.maxUsers !== 999 && (
            <Progress
              value={userPercentage}
              className={`h-2 ${isNearUserLimit ? 'bg-red-900' : 'bg-slate-700'}`}
            />
          )}
          {isNearUserLimit && (
            <p className="text-xs text-red-400">
              You're near your user limit. Upgrade to add more team members.
            </p>
          )}
        </div>

        {/* Projects Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <FolderOpen className="h-4 w-4" />
              <span>Projects</span>
            </div>
            <span className={`font-medium ${isNearProjectLimit ? 'text-red-400' : 'text-slate-300'}`}>
              {usage.projects} / {limits.maxProjects === 999 ? 'Unlimited' : limits.maxProjects}
            </span>
          </div>
          {limits.maxProjects !== 999 && (
            <Progress
              value={projectPercentage}
              className={`h-2 ${isNearProjectLimit ? 'bg-red-900' : 'bg-slate-700'}`}
            />
          )}
        </div>

        {/* Storage Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <HardDrive className="h-4 w-4" />
              <span>Storage</span>
            </div>
            <span className={`font-medium ${isNearStorageLimit ? 'text-red-400' : 'text-slate-300'}`}>
              {usage.storageGB} GB / {limits.maxStorageGB === 1000 ? '1 TB' : `${limits.maxStorageGB} GB`}
            </span>
          </div>
          {limits.maxStorageGB !== 1000 && (
            <Progress
              value={storagePercentage}
              className={`h-2 ${isNearStorageLimit ? 'bg-red-900' : 'bg-slate-700'}`}
            />
          )}
        </div>

        {/* Features List */}
        <div className="pt-4 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Available Features</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {limits.features.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-slate-400">
                <Check className="h-4 w-4 text-green-500" />
                <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TierInfoCard;
