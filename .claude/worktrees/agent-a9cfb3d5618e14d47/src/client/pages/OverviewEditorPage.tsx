import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Send, Loader2, AlertCircle, MessageSquareText } from 'lucide-react';
import EmbeddedOverviewEditor from '../components/overview/EmbeddedOverviewEditor';
import InterviewChatPanel from '../components/overview/InterviewChatPanel';
import PasteAnalyzeDialog from '../components/overview/PasteAnalyzeDialog';
import ImportDialog from '../components/overview/ImportDialog';

interface DraftLoadResponse {
  draftid: string;
  content: string;
  status: string;
  proposalid: string | null;
  projectid: string | null;
  title: string | null;
  priority: string | null;
  estimatedeffort: string | null;
  updatedat: string;
}

export default function OverviewEditorPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // D3 one-way mirror — content from dialog passed via router state to avoid round-trip
  const seededContent =
    typeof location.state === 'object' &&
    location.state &&
    'seedContent' in location.state &&
    typeof (location.state as { seedContent: unknown }).seedContent === 'string'
      ? (location.state as { seedContent: string }).seedContent
      : null;

  const seededInterview =
    typeof location.state === 'object' &&
    location.state !== null &&
    'startInterview' in location.state &&
    Boolean((location.state as { startInterview: unknown }).startInterview);

  const [content, setContent] = useState(seededContent ?? '');
  const [originalContent, setOriginalContent] = useState(seededContent ?? '');
  const [loading, setLoading] = useState(seededContent === null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>('draft');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [chatOpen, setChatOpen] = useState(seededInterview);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Alternative entry modes (FR-013 paste / FR-014 import). On completion the
  // mapped sections are persisted to the transcript; we bump chatRefreshKey to
  // remount the review pane so it re-hydrates and shows the new proposals.
  const [showPaste, setShowPaste] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importSeed, setImportSeed] = useState<string | null>(null);
  const [chatRefreshKey, setChatRefreshKey] = useState(0);

  // Proposal metadata, carried with the draft (FR-015 D1)
  const [title, setTitle] = useState<string>('');
  const [priority, setPriority] = useState<string>('medium');
  const [estimatedeffort, setEstimatedEffort] = useState<string>('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submittedProposalId, setSubmittedProposalId] = useState<string | null>(null);

  const isEditingExisting = proposalId !== null;
  // Spec 025 FR-016 / FR-017 — project-mode draft, opened from the dashboard
  // ReportLinkCard. "Done editing" calls /finalize (A13) which upserts
  // projectdocuments. Distinct from proposal flow.
  const isProjectMode = projectId !== null && proposalId === null;

  // Load draft on mount (skip if seeded from dialog — D3 mirror)
  useEffect(() => {
    if (!draftId || seededContent !== null) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/overview/draft/${draftId}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Failed to load draft (${res.status})`);
        }
        const data = (await res.json()) as DraftLoadResponse;
        if (cancelled) return;
        setContent(data.content);
        setOriginalContent(data.content);
        setStatus(data.status);
        setLastSavedAt(new Date(data.updatedat));
        if (data.title) setTitle(data.title);
        if (data.priority) setPriority(data.priority);
        if (data.estimatedeffort) setEstimatedEffort(data.estimatedeffort);
        if (data.proposalid) setProposalId(data.proposalid);
        if (data.projectid) setProjectId(data.projectid);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load draft');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId, seededContent]);

  // If seeded from dialog, push the seed to the server immediately so subsequent
  // PUTs have a baseline to CAS against
  useEffect(() => {
    if (!draftId || seededContent === null) return;
    let cancelled = false;
    (async () => {
      try {
        setSaving(true);
        await fetch(`/api/overview/draft/${draftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: seededContent }),
        });
        if (!cancelled) setLastSavedAt(new Date());
      } catch {
        // best-effort; user can still save manually
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, seededContent]);

  const dirty = content !== originalContent;

  /**
   * Persist a specific content value. Used by both the manual Save button (with
   * the current `content` state) and by the autosave path / section-approve
   * path which need to save a value computed synchronously.
   */
  const persistContent = async (value: string, opts: { quiet?: boolean } = {}): Promise<void> => {
    if (!draftId) return;
    try {
      if (!opts.quiet) setSaving(true);
      setError(null);
      const res = await fetch(`/api/overview/draft/${draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      const data = (await res.json()) as { content: string; updatedat: string };
      setOriginalContent(data.content);
      setLastSavedAt(new Date(data.updatedat));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      if (!opts.quiet) setSaving(false);
    }
  };

  const handleSave = async () => {
    await persistContent(content);
  };

  // Debounced autosave (FR-008): 2s after the last content change, persist quietly.
  useEffect(() => {
    if (loading || status === 'accepted') return;
    if (content === originalContent) return;
    const timer = window.setTimeout(() => {
      void persistContent(content, { quiet: true });
    }, 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, originalContent, loading, status]);

  const submitProposalToServer = async (
    overrides: { title?: string; priority?: string; estimatedeffort?: string } = {},
  ): Promise<void> => {
    if (!draftId) return;
    if (dirty) await persistContent(content);

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview/draft/${draftId}/submit-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(overrides),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Submit failed (${res.status})`);
      }
      const data = (await res.json()) as { proposalid: string; status: string };
      setStatus(data.status);
      setSubmittedProposalId(data.proposalid);
      setShowSubmitModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDoneEditing = async () => {
    // For an already-submitted draft, the autosave + on-approve saves keep
    // overviewdrafts.content current AND PUT mirrors it to projectproposals.
    // "Done editing" just flushes any unsaved typing and navigates back.
    if (dirty) await persistContent(content);
    navigate(-1);
  };

  // Spec 025 FR-017 / A13 — project-mode "Done editing" promotes the draft
  // content into projectdocuments (doctype='ProjectOverview'). DB only — no
  // disk write; the kit pulls on workspace open (FR-018, kit-side scope).
  const handleFinalizeProject = async () => {
    if (!draftId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview/draft/${draftId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Finalize failed (${res.status})`);
      }
      setOriginalContent(content);
      setLastSavedAt(new Date());
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finalize failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitProposal = async () => {
    // If we already have title from the dialog/draft, submit directly.
    // Otherwise, pop the modal so the user fills it in.
    if (title.trim()) {
      await submitProposalToServer();
    } else {
      setShowSubmitModal(true);
    }
  };

  const handleModalSubmit = async () => {
    // Persist the entered metadata back to the draft AND submit in one go.
    if (!title.trim()) return;
    if (draftId) {
      // Save metadata first so refreshing the page after submit shows it
      await fetch(`/api/overview/draft/${draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content,
          title: title.trim(),
          priority,
          estimatedeffort: estimatedeffort.trim(),
        }),
      });
    }
    await submitProposalToServer({
      title: title.trim(),
      priority,
      estimatedeffort: estimatedeffort.trim(),
    });
  };

  const mergeSectionIntoContent = (
    current: string,
    heading: string,
    sectionContent: string,
  ): string => {
    const headingLine = `## ${heading}`;
    const headingRegex = new RegExp(`(^|\\n)## ${heading}\\b[^\\n]*\\n`, 'i');
    const match = current.match(headingRegex);
    if (match) {
      const startIdx = current.indexOf(match[0]) + match[0].length;
      const tail = current.slice(startIdx);
      const nextHeadingRel = tail.search(/\n## /);
      const endIdx = nextHeadingRel === -1 ? current.length : startIdx + nextHeadingRel;
      return current.slice(0, startIdx) + sectionContent.trim() + '\n' + current.slice(endIdx);
    }
    const sep = current.trim() ? '\n\n' : '';
    return `${current}${sep}${headingLine}\n${sectionContent.trim()}\n`;
  };

  const handleApproveSection = (
    _sectionKey: string,
    sectionContent: string,
    heading: string,
  ) => {
    const merged = mergeSectionIntoContent(content, heading, sectionContent);
    setContent(merged);
    // Immediate save — section approval is deliberate and should never
    // be lost to debounce slop or tab-close before autosave fires.
    void persistContent(merged, { quiet: true });
  };

  // Paste / import finished and persisted the mapping to the transcript — open
  // the review pane (remounted so it re-hydrates) to approve the proposals.
  const handleAnalysisComplete = () => {
    setShowPaste(false);
    setShowImport(false);
    setImportSeed(null);
    setChatRefreshKey((k) => k + 1);
    setChatOpen(true);
  };

  const handleBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard and go back?')) {
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/admin/dashboard');
    }
  };

  const formattedSavedAt = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const saveStatus = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved — autosaving…'
      : formattedSavedAt
        ? `Saved ${formattedSavedAt}`
        : 'Saved';

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden relative">
      {/* Top bar */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3 flex items-center gap-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex flex-col">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">
            Project Overview Editor
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isProjectMode ? (
              <span className="inline-flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                Editing project overview
              </span>
            ) : isEditingExisting ? (
              <span className="inline-flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                Editing proposal
              </span>
            ) : null}
            Draft {draftId?.slice(0, 8)}… · status:{' '}
            <span className="font-medium">{status}</span> · {saveStatus}
          </span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setChatOpen((s) => !s)}
          disabled={saving || submitting}
          className={
            chatOpen
              ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 disabled:opacity-50'
              : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50'
          }
        >
          <MessageSquareText className="w-4 h-4" />
          {chatOpen ? 'Hide BA' : 'Interview'}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || submitting || !dirty}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>

        <button
          type="button"
          onClick={
            isProjectMode
              ? handleFinalizeProject
              : isEditingExisting
                ? handleDoneEditing
                : handleSubmitProposal
          }
          disabled={saving || submitting || !content.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          title={
            isProjectMode
              ? 'Promote this content into the project’s ProjectOverview document and return to the dashboard'
              : isEditingExisting
                ? 'Save any pending changes and return to the proposals list'
                : 'Create a proposal from this overview'
          }
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isProjectMode || isEditingExisting ? 'Done editing' : 'Submit Proposal'}
        </button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Content area — editor + optional chat sidebar */}
      <main className="flex-1 flex overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading draft…
          </div>
        ) : (
          <>
            <div
              className={
                chatOpen
                  ? 'flex-1 px-6 py-6 overflow-y-auto'
                  : 'flex-1 px-6 py-6 overflow-y-auto'
              }
              style={chatOpen ? { width: '75%' } : undefined}
            >
              <div className="max-w-5xl mx-auto">
                <EmbeddedOverviewEditor
                  value={content}
                  onChange={setContent}
                  draftId={draftId}
                  onInterview={() => setChatOpen(true)}
                  onPaste={() => setShowPaste(true)}
                  onImport={() => {
                    setImportSeed(null);
                    setShowImport(true);
                  }}
                  disabled={saving || submitting || status === 'accepted'}
                />
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Full 3/4 + 1/4 AIPane layout (FR-001) lands with G7 T025. This page is
                  the minimum viable Expand target — same EmbeddedOverviewEditor as
                  the dialog, with persistence wired through{' '}
                  <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                    /api/overview/draft/:id
                  </code>
                  . The chat sidebar on the right is the BA interview (FR-004); approved
                  sections are inserted into the editor on the left under their headings.
                </p>
              </div>
            </div>
            {chatOpen && draftId && (
              <div
                className="h-full min-h-0"
                style={{ width: '25%', minWidth: '320px' }}
              >
                <InterviewChatPanel
                  key={chatRefreshKey}
                  draftId={draftId}
                  onApproveSection={handleApproveSection}
                  onClose={() => setChatOpen(false)}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Success banner — proposal created */}
      {submittedProposalId && (
        <div className="absolute top-16 right-6 max-w-sm rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Proposal submitted ✓
          </p>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
            New proposal id: <code>{submittedProposalId.slice(0, 8)}…</code>. The
            draft is now <span className="font-medium">submitted</span>.
          </p>
          <button
            type="button"
            onClick={() => setSubmittedProposalId(null)}
            className="text-xs text-green-700 dark:text-green-300 hover:underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Submit-proposal metadata modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 my-12">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Submit Proposal
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                A few details about the proposal before it enters the queue.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleModalSubmit();
              }}
              className="px-6 py-5 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., AI Async Communication"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                  autoFocus
                />
              </div>
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
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
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
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste-to-analyze dialog (FR-013) */}
      {showPaste && draftId && (
        <PasteAnalyzeDialog
          draftId={draftId}
          onClose={() => setShowPaste(false)}
          onComplete={handleAnalysisComplete}
          onHandoffToImport={(seed: string) => {
            setShowPaste(false);
            setImportSeed(seed);
            setShowImport(true);
          }}
        />
      )}

      {/* Import-from-file-or-URL dialog (FR-014) */}
      {showImport && draftId && (
        <ImportDialog
          draftId={draftId}
          seedText={importSeed}
          onClose={() => {
            setShowImport(false);
            setImportSeed(null);
          }}
          onComplete={handleAnalysisComplete}
        />
      )}
    </div>
  );
}
