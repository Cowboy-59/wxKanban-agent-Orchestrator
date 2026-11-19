import React from 'react';
import { Progress } from './ui/Progress';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface InvitationProgressProps {
  batchId: string;
  total: number;
  sent: number;
  failed: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  failedEmails?: Array<{ email: string; reason: string }>;
  isRealTime?: boolean;
}

/**
 * InvitationProgress Component
 * Real-time progress display for bulk invitations with expandable failed list
 */
export const InvitationProgress: React.FC<InvitationProgressProps> = ({
  total,
  sent,
  failed,
  status,
  failedEmails = [],
  isRealTime = false,
}) => {
  const [showFailed, setShowFailed] = React.useState(false);
  
  const progress = total > 0 ? ((sent + failed) / total) * 100 : 0;
  const pending = total - sent - failed;

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'processing':
        return isRealTime ? 'Sending in real-time...' : 'Processing...';
      default:
        return 'Queued';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {getStatusText()}
          </span>
          {isRealTime && status === 'processing' && (
            <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full">
              Live
            </span>
          )}
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {sent + failed} of {total}
        </span>
      </div>

      <Progress value={progress} className="h-2 mb-4" />

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{sent}</p>
          <p className="text-xs text-green-700 dark:text-green-300">Sent</p>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{pending}</p>
          <p className="text-xs text-slate-700 dark:text-slate-300">Pending</p>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failed}</p>
          <p className="text-xs text-red-700 dark:text-red-300">Failed</p>
        </div>
      </div>

      {failed > 0 && failedEmails.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowFailed(!showFailed)}
            className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            {showFailed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showFailed ? 'Hide' : 'Show'} failed emails ({failed})
          </button>

          {showFailed && (
            <div className="mt-3 space-y-2">
              {failedEmails.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm"
                >
                  <span className="font-medium text-red-800 dark:text-red-200">{item.email}</span>
                  <span className="text-red-600 dark:text-red-400">{item.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvitationProgress;
