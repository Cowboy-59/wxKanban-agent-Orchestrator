import { useState, useRef, useEffect } from 'react';
import {
  MessageSquareText,
  ClipboardPaste,
  FileDown,
  Maximize2,
  Minimize2,
  Eye,
  Edit3,
  Sparkles,
} from 'lucide-react';

interface EmbeddedOverviewEditorProps {
  value: string;
  onChange: (value: string) => void;
  draftId?: string | null;
  onExpand?: (currentValue: string) => void;
  /** When provided, clicking Interview triggers this callback instead of showing the feature-gate notice. */
  onInterview?: (currentValue: string) => void;
  /** When provided, clicking "Paste to analyze" opens the paste dialog (FR-013). */
  onPaste?: (currentValue: string) => void;
  /** When provided, clicking "Import" opens the import dialog (FR-014). */
  onImport?: (currentValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

type EntryMode = 'interview' | 'paste' | 'import';

// Shown only in the compact embedded context (the proposal dialog), where there
// is no draft to stream against yet. The full-screen editor wires real
// onPaste / onImport handlers, so these never fire there.
const EXPAND_HINTS: Record<EntryMode, string> = {
  interview: 'Expand to the full editor to start the BA interview.',
  paste: 'Expand to the full editor to paste content for analysis (FR-013).',
  import: 'Expand to the full editor to import a file or URL (FR-014).',
};

export default function EmbeddedOverviewEditor({
  value,
  onChange,
  onExpand,
  onInterview,
  onPaste,
  onImport,
  placeholder,
  disabled,
}: EmbeddedOverviewEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const gateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (gateTimerRef.current !== null) {
        window.clearTimeout(gateTimerRef.current);
      }
    };
  }, []);

  const showGate = (message: string) => {
    setGateMessage(message);
    if (gateTimerRef.current !== null) {
      window.clearTimeout(gateTimerRef.current);
    }
    gateTimerRef.current = window.setTimeout(() => {
      setGateMessage(null);
      gateTimerRef.current = null;
    }, 6000);
  };

  const handleEntryMode = (mode: EntryMode) => {
    if (mode === 'interview' && onInterview) {
      onInterview(value);
      return;
    }
    if (mode === 'paste' && onPaste) {
      onPaste(value);
      return;
    }
    if (mode === 'import' && onImport) {
      onImport(value);
      return;
    }
    showGate(EXPAND_HINTS[mode]);
  };

  const handleExpand = () => {
    if (onExpand) {
      // Used by the dialog: navigate to full-screen page
      onExpand(value);
      return;
    }
    // Used by the full-screen page: toggle the editor's vertical size
    setExpanded((s) => !s);
  };

  // Editor height: compact in dialog (200px); page can toggle between
  // compact and tall (70vh) via the Expand button.
  const editorHeight = expanded ? '70vh' : '200px';

  const renderPreview = () => {
    if (!value.trim()) {
      return (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Nothing to preview yet.
        </p>
      );
    }
    return (
      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
        {value}
      </pre>
    );
  };

  return (
    <div className="space-y-2">
      {/* Header row: AI mode buttons + expand */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mr-1"
          aria-hidden="true"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI assist:</span>
        </div>

        <button
          type="button"
          onClick={() => handleEntryMode('interview')}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition"
          title="Walk through six template sections with a Senior Business Analyst (FR-004)"
        >
          <MessageSquareText className="w-3.5 h-3.5" />
          Interview
        </button>

        <button
          type="button"
          onClick={() => handleEntryMode('paste')}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition"
          title="Paste existing notes/email/doc; AI maps to template sections (FR-013)"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Paste to analyze
        </button>

        <button
          type="button"
          onClick={() => handleEntryMode('import')}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition"
          title="Upload a file or fetch a GitHub/docs URL (FR-014)"
        >
          <FileDown className="w-3.5 h-3.5" />
          Import
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowPreview((s) => !s)}
          disabled={disabled || !value}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition"
          title={showPreview ? 'Switch to edit view' : 'Switch to preview'}
        >
          {showPreview ? (
            <>
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              Preview
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleExpand}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition"
          title={
            onExpand
              ? 'Open the full-screen editor for serious authoring'
              : expanded
                ? 'Collapse the editor back to compact size'
                : 'Expand the editor to fill the available space'
          }
        >
          {expanded ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              Collapse
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              Expand
            </>
          )}
        </button>
      </div>

      {/* Editor / Preview */}
      <div
        className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500"
      >
        {showPreview ? (
          <div
            className="px-3 py-2 overflow-y-auto"
            style={{ height: editorHeight }}
          >
            {renderPreview()}
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              placeholder ||
              'Describe the proposed project. Use AI assist above for an interview or to paste/import existing content.'
            }
            disabled={disabled}
            className="w-full px-3 py-2 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none font-mono text-sm leading-relaxed"
            style={{ height: editorHeight }}
          />
        )}
      </div>

      {/* Helper text + char count */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          Markdown supported. Tap{' '}
          <span className="font-medium">Expand</span> for the full editor.
        </span>
        <span>{value.length.toLocaleString()} chars</span>
      </div>

      {/* Feature-gate notice */}
      {gateMessage && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {gateMessage}
        </div>
      )}
    </div>
  );
}
