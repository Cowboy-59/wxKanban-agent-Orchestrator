import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import { DocsVideoPlayer } from "../../components/docs/DocsVideoPlayer";

// [SCOPE 044 / T006] BEGIN — SysAdmin Docs management screen
interface DocRecord {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  videourl: string | null;
  posterurl: string | null;
  sortorder: number;
  status: string;
}

interface DocForm {
  title: string;
  summary: string;
  content: string;
  videourl: string;
  posterurl: string;
  sortorder: number;
  status: "active" | "draft";
}

const EMPTY_FORM: DocForm = {
  title: "",
  summary: "",
  content: "",
  videourl: "",
  posterurl: "",
  sortorder: 0,
  status: "draft",
};

/**
 * SysAdmin-only management screen for public landing-page Docs. Lists every docs
 * record (any status), supports create/edit (text, video URL, poster URL, order,
 * publish/draft) and delete. Wired to /api/sysadmin/docs.
 */
export default function SysAdminDocs() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DocForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocRecord | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sysadmin/docs", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        navigate("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("Failed to load docs");
      const body = await res.json();
      setDocs(body.docs ?? []);
    } catch {
      setError("Failed to load docs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (doc: DocRecord) => {
    setEditingId(doc.id);
    setForm({
      title: doc.title,
      summary: doc.summary ?? "",
      content: doc.content ?? "",
      videourl: doc.videourl ?? "",
      posterurl: doc.posterurl ?? "",
      sortorder: doc.sortorder,
      status: doc.status === "active" ? "active" : "draft",
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const url = editingId ? `/api/sysadmin/docs/${editingId}` : "/api/sysadmin/docs";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch {
      setError("Failed to save doc");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this doc? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/sysadmin/docs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      await load();
    } catch {
      setError("Failed to delete doc");
    }
  };

  const inputClass =
    "w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Docs Management</h1>
          <button
            onClick={() => navigate("/sysadmin/dashboard")}
            className="text-sm text-slate-300 hover:text-white"
          >
            ← SysAdmin Dashboard
          </button>
        </div>

        {error && <p className="mb-4 text-red-400">{error}</p>}

        {/* Editor */}
        <div className="mb-8 rounded-xl border border-slate-700 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-lg font-semibold">
            {editingId ? "Edit doc" : "New doc"}
          </h2>
          <div className="space-y-3">
            <input
              className={inputClass}
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              className={inputClass}
              placeholder="Summary — what the video covers (multi-line)"
              rows={3}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
            <textarea
              className={`${inputClass} font-mono`}
              placeholder="Documentation text (markdown)"
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                placeholder="Video URL (wxkanban S3)"
                value={form.videourl}
                onChange={(e) => setForm({ ...form, videourl: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Poster URL (wxkanban S3)"
                value={form.posterurl}
                onChange={(e) => setForm({ ...form, posterurl: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm">
                Order&nbsp;
                <input
                  type="number"
                  className="w-20 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                  value={form.sortorder}
                  onChange={(e) =>
                    setForm({ ...form, sortorder: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </label>
              <label className="text-sm">
                Status&nbsp;
                <select
                  className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as "active" | "draft" })
                  }
                >
                  <option value="draft">Draft (hidden)</option>
                  <option value="active">Published</option>
                </select>
              </label>
              <div className="ml-auto flex gap-2">
                {editingId && (
                  <button
                    onClick={startNew}
                    className="rounded-md border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving || !form.title}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <h2 className="mb-3 text-lg font-semibold">All docs</h2>
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-slate-400">No docs yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3"
              >
                <span className="w-10 text-center text-slate-500">{doc.sortorder}</span>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(doc)}
                  title="Preview how this looks on the public page"
                  className="min-w-0 flex-1 text-left group"
                >
                  <p className="truncate font-medium group-hover:text-blue-300">{doc.title}</p>
                  <p className="truncate text-xs text-slate-400">
                    /docs/{doc.slug} · <span className="text-slate-500 group-hover:text-blue-400">click to preview</span>
                  </p>
                </button>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    doc.status === "active"
                      ? "bg-green-900/50 text-green-300"
                      : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {doc.status === "active" ? "Published" : "Draft"}
                </span>
                <button
                  onClick={() => startEdit(doc)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(doc.id)}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Public-page preview — renders the doc exactly like /docs/:slug */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-white text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Public preview · /docs/{previewDoc.slug}
                {previewDoc.status !== "active" && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                    draft — not publicly visible
                  </span>
                )}
              </span>
              <button
                onClick={() => setPreviewDoc(null)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Close ✕
              </button>
            </div>
            <article className="px-6 py-8">
              <h1 className="text-3xl font-bold">{previewDoc.title}</h1>
              {previewDoc.summary && (
                <p className="mt-3 whitespace-pre-line text-slate-600">{previewDoc.summary}</p>
              )}
              <div
                className="prose prose-slate mt-6 max-w-none"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(previewDoc.content || "") as string,
                }}
              />
              <DocsVideoPlayer
                videourl={previewDoc.videourl}
                posterurl={previewDoc.posterurl}
                title={previewDoc.title}
              />
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
// [SCOPE 044 / T006] END
