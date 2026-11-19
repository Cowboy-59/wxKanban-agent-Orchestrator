import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Lightbulb, AlertCircle } from 'lucide-react';
import EmbeddedOverviewEditor from '../overview/EmbeddedOverviewEditor';

interface AddProposalDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddProposalDialog({ open, onClose, onCreated }: AddProposalDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [estimatedeffort, setEstimatedEffort] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);
  const navigate = useNavigate();

  const lazyCreateAndNavigate = async (
    currentValue: string,
    extraState: Record<string, unknown> = {},
  ) => {
    const res = await fetch('/api/overview/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mode: 'proposal',
        content: currentValue,
        // Carry the dialog's metadata through so the editor page can
        // submit-proposal without re-asking. FR-015.
        title: title.trim() || undefined,
        priority,
        estimatedeffort: estimatedeffort.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Failed to create overview draft');
    }
    const data = (await res.json()) as { draftid: string };
    onClose();
    navigate(`/overview/${data.draftid}`, {
      state: { seedContent: currentValue, ...extraState },
    });
  };

  const handleExpand = async (currentValue: string) => {
    try {
      setExpanding(true);
      setSubmitError(null);
      await lazyCreateAndNavigate(currentValue);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to expand to full screen');
    } finally {
      setExpanding(false);
    }
  };

  const handleInterview = async (currentValue: string) => {
    try {
      setExpanding(true);
      setSubmitError(null);
      await lazyCreateAndNavigate(currentValue, { startInterview: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start interview');
    } finally {
      setExpanding(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setSubmitting(true);
      setSubmitError(null);

      // Step 1: lazy-create overview draft with the description as seed content
      const createRes = await fetch('/api/overview/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'proposal',
          content: description,
          title: title.trim(),
          priority,
          estimatedeffort: estimatedeffort.trim() || undefined,
        }),
      });
      if (!createRes.ok) {
        const data = (await createRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Failed to create overview draft');
      }
      const draft = (await createRes.json()) as { draftid: string };

      // Step 2: submit-proposal — atomically creates projectproposals row
      // and finalizes the draft (proposalid set, status='submitted').
      const submitRes = await fetch(`/api/overview/draft/${draft.draftid}/submit-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!submitRes.ok) {
        const data = (await submitRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Failed to submit proposal');
      }

      // Reset form and close
      setTitle('');
      setDescription('');
      setPriority('medium');
      setEstimatedEffort('');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create proposal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            New Project Proposal
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {submitError && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Mobile App Redesign"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            {/* Description — embedded mini-editor (FR-015) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description / Project Overview
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  This becomes the project's overview document on accept.
                </span>
              </div>
              <EmbeddedOverviewEditor
                value={description}
                onChange={setDescription}
                onExpand={handleExpand}
                onInterview={handleInterview}
                disabled={submitting || expanding}
              />
            </div>

            {/* Priority + Effort row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Estimated Effort
                </label>
                <input
                  type="text"
                  value={estimatedeffort}
                  onChange={(e) => setEstimatedEffort(e.target.value)}
                  placeholder="e.g., 2 weeks"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Submit Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
