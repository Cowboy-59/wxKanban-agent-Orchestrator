import { useRef, useState } from 'react';
import { X, FileDown, Loader2, AlertCircle, UploadCloud, Link2 } from 'lucide-react';
import { validateImportUrl, IMPORT_ALLOWED_HOSTS } from '~/shared/url-allowlist';
import { streamAnalyze } from './analyzeStream';

const ACCEPTED_EXT = ['.md', '.txt', '.html', '.htm', '.pdf', '.docx'];
// base64 inflates ~1.34x; keep the raw-file cap comfortably under the 2mb
// HTTP envelope while the server enforces the real 500k-char ceiling.
const MAX_FILE_BYTES = 1_400_000;

interface ImportDialogProps {
  draftId: string;
  onClose: () => void;
  onComplete: () => void;
  /** When set, pre-loads the dialog with text handed off from an over-limit paste. */
  seedText?: string | null;
}

type Tab = 'file' | 'url';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Spec 025 T027 / FR-014 — "Import" modal with two tabs: From File (drag-drop
 * for .md/.txt/.html/.pdf/.docx) and From URL (validated against the shared host
 * allowlist). Streams the AI section-mapping with chunk progress and, on
 * completion, signals the parent to open the review pane.
 */
export default function ImportDialog({
  draftId,
  onClose,
  onComplete,
  seedText,
}: ImportDialogProps) {
  const [tab, setTab] = useState<Tab>(seedText ? 'file' : 'file');
  const [file, setFile] = useState<File | null>(
    seedText ? new File([seedText], 'pasted-content.txt', { type: 'text/plain' }) : null,
  );
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlCheck = url.trim() ? validateImportUrl(url) : null;

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    const ok = ACCEPTED_EXT.some((e) => f.name.toLowerCase().endsWith(e));
    if (!ok) {
      setError(`Unsupported file type. Accepted: ${ACCEPTED_EXT.join(', ')}`);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError(`File is too large (${(f.size / 1_000_000).toFixed(1)}MB). Max ~1.4MB.`);
      return;
    }
    setFile(f);
  };

  const runStream = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setProgress(null);
    const { promise, abort } = streamAnalyze(
      `/api/overview/draft/${draftId}/import`,
      body,
      {
        onProgress: (current: number, total: number) => setProgress({ current, total }),
        onDone: () => {
          setBusy(false);
          onComplete();
        },
        onError: (msg: string) => {
          setBusy(false);
          setError(msg);
        },
      },
    );
    abortRef.current = abort;
    await promise;
  };

  const handleImportFile = async () => {
    if (!file || busy) return;
    try {
      const payload = await readFileAsBase64(file);
      await runStream({
        source: 'file',
        filename: file.name,
        mimetype: file.type || undefined,
        payload,
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not read file');
    }
  };

  const handleImportUrl = async () => {
    if (!urlCheck?.ok || busy) return;
    await runStream({ source: 'url', url: urlCheck.url });
  };

  const handleClose = () => {
    abortRef.current?.();
    onClose();
  };

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={
        tab === t
          ? 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-300'
          : 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 my-12">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Import</h2>
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

        <div className="px-6 pt-3 border-b border-gray-200 dark:border-gray-700 flex gap-2">
          {tabBtn('file', 'From File', <UploadCloud className="w-4 h-4" />)}
          {tabBtn('url', 'From URL', <Link2 className="w-4 h-4" />)}
        </div>

        <div className="px-6 py-5 space-y-3">
          {tab === 'file' ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={
                  'rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition ' +
                  (dragging
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400')
                }
              >
                <UploadCloud className="w-7 h-7 mx-auto text-gray-400 mb-2" />
                {file ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{file.name}</span>{' '}
                    <span className="text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Drag a file here, or click to choose
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">{ACCEPTED_EXT.join(' · ')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXT.join(',')}
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </>
          ) : (
            <>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/blob/main/README.md"
                disabled={busy}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              {urlCheck && !urlCheck.ok && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{urlCheck.error}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Allowed hosts: {IMPORT_ALLOWED_HOSTS.join(', ')}. Public sources only.
              </p>
            </>
          )}

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progress && progress.total > 1
                ? `Analyzing chunk ${progress.current} of ${progress.total}…`
                : 'Analyzing content…'}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={tab === 'file' ? handleImportFile : handleImportUrl}
            disabled={busy || (tab === 'file' ? !file : !urlCheck?.ok)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Import &amp; analyze
          </button>
        </div>
      </div>
    </div>
  );
}
