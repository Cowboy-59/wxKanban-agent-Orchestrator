import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface Phase {
  phase: string;
  status: 'COMPLETED' | 'CURRENT' | 'PENDING';
  description: string;
  enteredAt?: string;
  exitedAt?: string;
}

interface SpecificationLifecycleProps {
  specificationid: string;
  title?: string;
}

export const SpecificationLifecycleViewer: React.FC<SpecificationLifecycleProps> = ({
  specificationid,
  title = 'Specification Lifecycle',
}) => {
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [blockers, setBlockers] = useState('');

  // Fetch progress
  const { data: progressData, refetch: refetchProgress } = useQuery({
    queryKey: ['specificationProgress', specificationid],
    queryFn: async () => {
      const response = await fetch(`/api/specifications/${specificationid}/progress`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch progress');
      return response.json();
    },
  });

  // Transition mutation
  const transitionMutation = useMutation({
    mutationFn: async (toPhase: string) => {
      const currentPhase = progressData.currentPhase;

      const response = await fetch(`/api/specifications/${specificationid}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          fromPhase: currentPhase,
          toPhase,
          notes: notes || undefined,
          blockers: blockers ? blockers.split('\n').filter((b) => b.trim()) : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to transition phase');
      }

      return response.json();
    },
    onSuccess: () => {
      setShowTransitionModal(false);
      setNotes('');
      setBlockers('');
      refetchProgress();
    },
  });

  const progress = progressData?.success ? progressData : null;

  if (!progress) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getPhaseColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100';
      case 'CURRENT':
        return 'bg-blue-100';
      case 'PENDING':
        return 'bg-gray-100';
      default:
        return 'bg-gray-50';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-200 text-green-800';
      case 'CURRENT':
        return 'bg-blue-200 text-blue-800';
      case 'PENDING':
        return 'bg-gray-200 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const currentPhaseObj = progress.phases.find((p: Phase) => p.status === 'CURRENT');
  const nextPhases =
    currentPhaseObj && progress.phases
      ? progress.phases.filter(
          (p: Phase) =>
            !progress.completedPhases.includes(p.phase) &&
            p.phase !== progress.currentPhase
        )
      : [];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Phase {progress.phaseIndex + 1} of 6 • {progress.completionPercentage}% complete
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${getStatusBadgeColor(progress.currentPhase)}`}>
            {progress.currentPhase}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress.completionPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Phase Timeline */}
      <div className="space-y-3 mb-8">
        {progress.phases.map((phase: Phase, index: number) => (
          <div key={phase.phase} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getPhaseColor(phase.status)}`}
              >
                {phase.status === 'COMPLETED' ? '✓' : index + 1}
              </div>
              {index < progress.phases.length - 1 && (
                <div className={`w-0.5 h-12 ${phase.status === 'COMPLETED' ? 'bg-green-400' : 'bg-gray-300'}`}></div>
              )}
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-slate-900">{phase.phase}</h4>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeColor(phase.status)}`}>
                  {phase.status}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{phase.description}</p>
              {phase.enteredAt && (
                <p className="text-xs text-slate-500 mt-2">
                  Entered: {new Date(phase.enteredAt).toLocaleDateString()}
                  {phase.exitedAt && ` • Exited: ${new Date(phase.exitedAt).toLocaleDateString()}`}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Current Phase Details */}
      {currentPhaseObj && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-slate-900 mb-2">Current Phase: {currentPhaseObj.phase}</h4>
          <p className="text-sm text-slate-700 mb-4">{currentPhaseObj.description}</p>
          {nextPhases.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-900 mb-2">Valid Next Phases:</p>
              <ul className="space-y-1">
                {nextPhases.map((nextPhase: Phase) => (
                  <li key={nextPhase.phase} className="text-sm text-slate-700">
                    • {nextPhase.phase}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Transition Button */}
      {nextPhases.length > 0 && (
        <button
          onClick={() => setShowTransitionModal(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          Move to Next Phase
        </button>
      )}

      {/* Transition Modal */}
      {showTransitionModal && nextPhases.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Transition Phase</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-900 mb-2">
                Next Phase
              </label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {nextPhases.map((nextPhase: Phase) => (
                  <option key={nextPhase.phase} value={nextPhase.phase}>
                    {nextPhase.phase}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label htmlFor="notes" className="block text-sm font-medium text-slate-900 mb-1">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add phase transition notes..."
                maxLength={1000}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="blockers" className="block text-sm font-medium text-slate-900 mb-1">
                Blockers (optional - one per line)
              </label>
              <textarea
                id="blockers"
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="List any blockers or issues..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTransitionModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-900 hover:bg-slate-50 font-medium transition"
                disabled={transitionMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const nextPhase = nextPhases[0]?.phase;
                  if (nextPhase) {
                    transitionMutation.mutate(nextPhase);
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:bg-blue-400"
                disabled={transitionMutation.isPending}
              >
                {transitionMutation.isPending ? 'Transitioning...' : 'Transition'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecificationLifecycleViewer;
