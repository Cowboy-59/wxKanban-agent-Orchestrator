import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface TimerWidgetProps {
  projectid: string;
  taskid?: string;
  onTimerStart?: (entryid: string) => void;
  onTimerStop?: (duration: number) => void;
}

interface ActiveTimer {
  entryid: string;
  projectid: string;
  taskid?: string;
  starttime: string;
  elapsedSeconds: number;
  description?: string;
  billable: boolean;
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({
  projectid,
  taskid,
  onTimerStart,
  onTimerStop,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(true);

  // Fetch active timer
  const { data: timerData, refetch: refetchTimer } = useQuery({
    queryKey: ['activeTimer'],
    queryFn: async () => {
      const response = await fetch('/api/time-tracking/active', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch active timer');
      return response.json();
    },
    refetchInterval: 1000, // Update every second
  });

  const activeTimer = timerData?.activeTimer as ActiveTimer | null;

  // Update elapsed time
  useEffect(() => {
    if (activeTimer) {
      const startTime = new Date(activeTimer.starttime).getTime();
      const now = new Date().getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedSeconds(elapsed);

      // Check if timer exceeds 8 hours
      if (elapsed > 8 * 3600) {
        alert('Timer has been running for more than 8 hours. Please consider stopping it.');
      }
    }
  }, [activeTimer]);

  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/time-tracking/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          projectid,
          taskid,
          description: description || undefined,
          billable,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start timer');
      }
      return response.json();
    },
    onSuccess: (data) => {
      refetchTimer();
      setDescription('');
      if (onTimerStart) {
        onTimerStart(data.timeEntry.entryid);
      }
    },
  });

  // Stop timer mutation
  const stopTimerMutation = useMutation({
    mutationFn: async (entryid: string) => {
      const response = await fetch(`/api/time-tracking/stop/${entryid}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop timer');
      }
      return response.json();
    },
    onSuccess: (data) => {
      refetchTimer();
      if (onTimerStop) {
        onTimerStop(data.timeEntry.duration);
      }
    },
  });

  const handleStartTimer = () => {
    if (activeTimer) {
      alert('You already have a timer running. Stop it first.');
      return;
    }
    startTimerMutation.mutate();
  };

  const handleStopTimer = () => {
    if (activeTimer) {
      stopTimerMutation.mutate(activeTimer.entryid);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (activeTimer) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Timer Running</h3>
          <div className="animate-pulse w-3 h-3 bg-red-500 rounded-full"></div>
        </div>

        <div className="text-4xl font-mono font-bold text-red-600 mb-4 text-center">
          {formatTime(elapsedSeconds)}
        </div>

        {activeTimer.description && (
          <p className="text-sm text-slate-600 mb-4 p-2 bg-white rounded border border-slate-200">
            {activeTimer.description}
          </p>
        )}

        <div className="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={activeTimer.billable}
            disabled
            className="rounded border-slate-300"
          />
          <label className="text-sm text-slate-600">
            {activeTimer.billable ? 'Billable' : 'Non-billable'}
          </label>
        </div>

        <button
          onClick={handleStopTimer}
          disabled={stopTimerMutation.isPending}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          {stopTimerMutation.isPending ? 'Stopping...' : 'Stop Timer'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Start Timer</h3>

      <div className="space-y-4">
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-900 mb-1">
            Description (optional)
          </label>
          <input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you working on?"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={500}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="billable"
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor="billable" className="text-sm text-slate-700">
            Mark as billable
          </label>
        </div>

        <button
          onClick={handleStartTimer}
          disabled={startTimerMutation.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          {startTimerMutation.isPending ? 'Starting...' : 'Start Timer'}
        </button>
      </div>
    </div>
  );
};

export default TimerWidget;
