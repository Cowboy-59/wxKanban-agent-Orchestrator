import { useRef, useState } from 'react';
import { X, ClipboardPaste, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { streamAnalyze } from './analyzeStream';

const PASTE_SOFT_CAP = 10_000;
const PASTE_WARN_AT = 9_000;

interface PasteAnalyzeDialogProps {
  draftId: string;
  onClose: () => void;
  /** Called when the AI mapping finished + persisted; parent opens the review pane. */
  onComplete: () => void;
  /** Called when the user chooses to hand off over-limit content to import. */
  onHandoffToImport: (seed: string) => void;
}

/**
 * Spec 025 T026 / FR-013 — "Paste to analyze" modal. Accepts pasted text/
 * markdown with a 10k soft cap; over-limit content hands off to import (never
 * truncated). On submit it streams the AI section-mapping and, on completion,
 * signals the parent to open the review pane where each proposed section can be
 * approved into the editor.
 */
export default function PasteAnalyzeDialog({
  draftId,
  onClose,
  onComplete,
  onHandoffToImport,
}: PasteAnalyzeDialogProps) {
  const [content, setContent] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const overLimit = content.length > PASTE_SOFT_CAP;
  const counterClass =
    content.length > PASTE_SOFT_CAP
      ? 'text-red-600 dark:text-red-400'
      : content.length >= PASTE_WARN_AT
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-400 dark:text-gray-500';

  const handleAnalyze = async () => {
    if (!content.trim() || overLimit || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setPreview('');

    const { promise, abort } = streamAnalyze(
      `/api/overview/draft/${draftId}/paste-analyze`,
      { content },
      {
        onDelta: (d: string) => setPreview((p) => p + d),
        onDone: () => {
          setAnalyzing(false);
          onComplete();
        },
        onError: (msg: string) => {
          setAnalyzing(false);
          setError(msg);
        },
      },
    );
    abortRef.current = abort;
    await promise;
  };

  const handleClose = () => {
    abortRef.current?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 my-12">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Paste to analyze
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Paste existing notes, an email, or a doc. The BA will map it onto the
            six overview sections for you to review and approve.
          </p>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your content here…"
            disabled={analyzing}
            rows={10}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y font-mono"
            autoFocus
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Plain text or Markdown. Images aren't read here.
            </span>
            <span className={counterClass}>
              {content.length.toLocaleString()} / {PASTE_SOFT_CAP.toLocaleString()}
            </span>
          </div>

          {overLimit && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                That's too large to paste safely. Switch to file import — your text
                will carry over as a <code>.txt</code> file.
                <button
                  type="button"
                  onClick={() => onHandoffToImport(content)}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Switch to Import
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {analyzing && (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mapping content to sections…
              </div>
              {preview && (
                <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap max-h-40 overflow-y-auto font-sans">
                  {preview.slice(-1200)}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={analyzing}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!content.trim() || overLimit || analyzing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}
