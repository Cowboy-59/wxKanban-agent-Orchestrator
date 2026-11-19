// [SCOPE 055 / T008] Dedicated Stack tab — view, DEFINE, and structured-edit the
// project's ProjectStack (Stack & Style) document, using the SAME structured editor
// (StackEditor) offered at project creation. Loads via GET /api/projects/:id/documents,
// parses the stored markdown into structured data for editing, and saves the
// re-rendered markdown via PUT /api/projects/:id/stack (upsert — works whether or not
// a stack exists yet; markdown stays the source of truth and the kit re-materializes
// stack.md on next project open).
import { useState, useEffect, useCallback } from "react";
import { Code2, Pencil, Save, X, Loader2, Plus, Download } from "lucide-react";
import StackEditor from "~/client/components/Projects/StackEditor";
import {
  parseStackMarkdown,
  renderStackMarkdown,
  defaultStackData,
  STACK_DIMENSIONS,
  APP_TYPES,
  type ProjectStackData,
} from "~/shared/stack-defaults";

// Where a downloaded stack.md belongs: the root of the application/repository the
// kit reads (FR-005 / Amendment A). Shown to the user after a download so the manual
// drop lands in the same place the kit auto-materializes stack.md on project open.
const STACK_FILE_LOCATION = "the root of your application / repository folder (alongside package.json) — the same place the kit writes stack.md on project open";

// [SCOPE 055 / T008] BEGIN — StackTabView (view / define / structured-edit the ProjectStack doc)
interface ProjectDoc {
  id: string;
  doctype: string;
  title: string;
  content: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function StackTabView({ projectId }: { projectId: string }) {
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectStackData | null>(null);
  const [customizedDims, setCustomizedDims] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Failed to load documents");
      }
      const data = (await res.json()) as { documents: ProjectDoc[] };
      setDoc(data.documents.find((d) => d.doctype === "ProjectStack") ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stack");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Edit an existing stack: parse the stored markdown; treat all loaded dimensions
  // as already-chosen so switching app type does not clobber captured values.
  const startEdit = () => {
    if (!doc) return;
    const parsed = parseStackMarkdown(doc.content);
    setDraft(parsed);
    // Mark every loaded "<appType>:<dim>" as already-chosen.
    const seeded = new Set<string>();
    for (const t of APP_TYPES) {
      if (!parsed.appTypes.includes(t)) continue;
      for (const dim of STACK_DIMENSIONS) seeded.add(`${t}:${dim}`);
    }
    setCustomizedDims(seeded);
    setEditing(true);
  };

  // Define a first stack from the app-type defaults (nothing captured yet).
  const startDefine = () => {
    setDraft(defaultStackData(["web"]));
    setCustomizedDims(new Set());
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
  };

  // Download a `stack.md` file the user can drop into their application directory
  // (where the kit materializes it on open). Saved view downloads the persisted
  // doc; the editor downloads the in-progress draft rendered to canonical markdown.
  // After the download, tell the user exactly which directory the file belongs in.
  const handleDownload = (content: string) => {
    const blob = new Blob([content ?? ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stack.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloadHint(`Saved stack.md to your downloads. Move it to ${STACK_FILE_LOCATION}.`);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const content = renderStackMarkdown(draft);
      const res = await fetch(`/api/projects/${projectId}/stack`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Save failed");
      }
      const body = (await res.json()) as { document: ProjectDoc };
      setDoc(body.document);
      setEditing(false);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 p-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading stack…
      </div>
    );
  }

  // Editing / defining — show the full structured editor (same as project creation).
  if (editing && draft) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <Code2 className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
            {doc ? "Edit Stack & Style" : "Define Stack & Style"}
          </h2>
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
          <button
            type="button"
            onClick={() => handleDownload(renderStackMarkdown(draft))}
            disabled={saving}
            title="Download the current draft as stack.md"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3 h-3" /> Download stack.md
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {downloadHint && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
            <Download className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{downloadHint}</span>
          </div>
        )}
        <StackEditor
          data={draft}
          onChange={setDraft}
          customizedDims={customizedDims}
          onCustomizedDimsChange={setCustomizedDims}
          disabled={saving}
        />
      </div>
    );
  }

  // No stack captured yet — let the user define one right here.
  if (!doc) {
    return (
      <div className="max-w-2xl rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center">
        <Code2 className="w-6 h-6 mx-auto text-gray-400 dark:text-gray-500" />
        <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-100">
          No Stack &amp; Style defined for this project yet
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Define it here with the same controls used at project creation, or capture it
          with the <code>/buildstack</code> command in your editor.
        </p>
        <button
          type="button"
          onClick={startDefine}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <Plus className="w-3 h-3" /> Define stack
        </button>
        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  // View mode — rendered Stack & Style with an Edit button.
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Code2 className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
          {doc.title || "Stack & Style"}
        </h2>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        <button
          type="button"
          onClick={() => handleDownload(doc.content ?? "")}
          title="Download stack.md to place in your application directory"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Download className="w-3 h-3" /> Download stack.md
        </button>
        <button
          type="button"
          onClick={startEdit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </div>
      {downloadHint && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
          <Download className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{downloadHint}</span>
        </div>
      )}
      <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto">
        {doc.content || "(empty)"}
      </pre>
    </div>
  );
}
// [SCOPE 055 / T008] END
