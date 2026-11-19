import React, { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Trash2, X, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface ComplianceDocument {
  id: string;
  title: string;
  documenttype: string;
  framework: string | null;
  description: string | null;
  filename: string | null;
  status: string;
  extractedtasks: number;
  version: string | null;
  createdat: string;
}

interface DocumentUploadProps {
  enabledFrameworks?: string[];
  onUpload?: (document: {
    id: string;
    title: string;
    documenttype: string;
    framework?: string;
  }) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_FRAMEWORKS = ["SOC2", "HIPAA", "HITRUST", "GDPR"];

const FRAMEWORK_BADGE: Record<string, string> = {
  SOC2:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  HIPAA:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  HITRUST: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  GDPR:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

const STATUS_BADGE: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  draft:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const DOCUMENT_TYPES = [
  { value: "compliance_framework", label: "Compliance Framework" },
  { value: "audit_policy",         label: "Audit Policy" },
  { value: "procedure",            label: "Procedure Document" },
  { value: "evidence",             label: "Evidence Document" },
  { value: "other",                label: "Other" },
];

// ── Main component (formerly bare upload form, now full manager) ─────────────

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  enabledFrameworks,
  onUpload,
}) => {
  const { user } = useAuth();
  // [SCOPE 146 / T006] MODIFIED-BY — the library is platform-wide, so upload and delete are SYSADMIN
  // only (was company ADMIN, whose deletes reached every tenant) (FR-007)
  const canManageLibrary = user?.usertype === "SYSADMIN";
  const visibleFrameworks =
    enabledFrameworks && enabledFrameworks.length > 0 ? enabledFrameworks : ALL_FRAMEWORKS;

  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setListError(null);
      const res = await fetch("/api/audit/documents", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
      const json = await res.json();
      setDocuments(json.data ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleUploadSuccess = async (doc: {
    id: string;
    title: string;
    documenttype: string;
    framework?: string;
  }) => {
    try {
      await fetch(`/api/audit/documents/${doc.id}/extract`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Non-fatal — document is uploaded, extraction can be retried later
    }
    setShowUploadModal(false);
    void loadDocuments();
    onUpload?.(doc);
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/audit/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDocuments((docs) => docs.filter((d) => d.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDocs = documents.filter(
    (d) => !d.framework || visibleFrameworks.includes(d.framework),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Compliance Documents
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
            {visibleFrameworks.length < ALL_FRAMEWORKS.length && (
              <> • Frameworks: {visibleFrameworks.join(", ")}</>
            )}
          </p>
        </div>
        {canManageLibrary && (
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        )}
      </div>

      {listError && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
          {listError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading documents…
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No compliance documents yet.
            {canManageLibrary && " Click 'Upload Document' to add one."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr className="text-left text-gray-700 dark:text-gray-300">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Framework</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Tasks</th>
                <th className="px-4 py-2 font-medium">Uploaded</th>
                <th className="px-4 py-2 font-medium w-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredDocs.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                >
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    <div className="font-medium">{doc.title}</div>
                    {doc.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 max-w-md">
                        {doc.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {doc.framework ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          FRAMEWORK_BADGE[doc.framework] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {doc.framework}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_BADGE[doc.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      {doc.extractedtasks ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(doc.createdat).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {canManageLibrary && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showUploadModal && (
        <UploadModal
          enabledFrameworks={visibleFrameworks}
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDeleteModal
          document={documents.find((d) => d.id === confirmDeleteId)}
          isDeleting={deletingId === confirmDeleteId}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDelete(confirmDeleteId)}
        />
      )}
    </div>
  );
};

// ── Upload Modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  enabledFrameworks: string[];
  onClose: () => void;
  onSuccess: (doc: {
    id: string;
    title: string;
    documenttype: string;
    framework?: string;
  }) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({
  enabledFrameworks,
  onClose,
  onSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    documenttype: "compliance_framework",
    framework: enabledFrameworks[0] || "",
    description: "",
    version: "1.0",
    filecontent: "",
    filename: "",
  });

  const handleFile = async (file: File) => {
    const content = await readFileAsText(file);
    setFormData((prev) => ({
      ...prev,
      filecontent: content,
      filename: file.name,
      title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
    }));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, []);

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.filecontent.trim()) {
      setError("Title and content are required");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const res = await fetch("/api/audit/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          documenttype: formData.documenttype,
          title: formData.title,
          description: formData.description,
          filename: formData.filename || undefined,
          filecontent: formData.filecontent,
          framework: formData.framework || undefined,
          version: formData.version,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }

      const result = await res.json();
      onSuccess(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upload Compliance Document
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-2"
              placeholder="Document title"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Document Type
              </label>
              <select
                value={formData.documenttype}
                onChange={(e) => setFormData({ ...formData, documenttype: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-2"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Framework
              </label>
              <select
                value={formData.framework}
                onChange={(e) => setFormData({ ...formData, framework: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-2"
              >
                <option value="">None / Generic</option>
                {enabledFrameworks.map((fw) => (
                  <option key={fw} value={fw}>
                    {fw}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-2"
              rows={2}
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Content
            </label>
            <textarea
              value={formData.filecontent}
              onChange={(e) => setFormData({ ...formData, filecontent: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-2 font-mono text-xs"
              rows={6}
              placeholder="Paste markdown content here, or drop a file below"
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
              isDragging
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-gray-300 dark:border-gray-600"
            }`}
          >
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="hidden"
              id="audit-doc-file"
              accept=".md,.txt,.json,.yaml,.yml"
            />
            <label
              htmlFor="audit-doc-file"
              className="cursor-pointer text-sm text-gray-600 dark:text-gray-400"
            >
              {formData.filename ? (
                <span>
                  Loaded: <span className="font-medium">{formData.filename}</span> — drop another
                  to replace
                </span>
              ) : (
                <>
                  Drag and drop a file here, or{" "}
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                    click to select
                  </span>
                </>
              )}
              <div className="text-xs text-gray-500 mt-1">Markdown · Text · JSON · YAML</div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading || !formData.title || !formData.filecontent}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded"
          >
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? "Uploading…" : "Upload & Extract Tasks"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Confirm Delete ───────────────────────────────────────────────────────────

interface ConfirmDeleteModalProps {
  document?: ComplianceDocument;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  document,
  isDeleting,
  onCancel,
  onConfirm,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    onClick={onCancel}
  >
    <div
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Delete document?
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This will permanently delete{" "}
          <span className="font-medium text-gray-900 dark:text-white">{document?.title}</span>
          {document?.extractedtasks
            ? ` and remove ${document.extractedtasks} extracted compliance task${
                document.extractedtasks === 1 ? "" : "s"
              }`
            : ""}
          . This cannot be undone.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
        <button
          type="button"
          onClick={onCancel}
          disabled={isDeleting}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded"
        >
          {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isDeleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </div>
);

// ── Helpers ──────────────────────────────────────────────────────────────────

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
