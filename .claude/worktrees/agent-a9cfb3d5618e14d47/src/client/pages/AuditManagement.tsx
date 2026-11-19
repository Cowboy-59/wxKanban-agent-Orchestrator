import React, { useState, useEffect } from "react";
import {
  AuditConfigPanel,
  DocumentUpload,
  AuditExecutionPanel,
  ComplianceReportViewer,
  AuditTaskBrowser,
} from "../components/audit/index.js";
import { useAuth } from "~/client/context/AuthContext"; // [SCOPE 146 / T006]

interface WxKanbanDocument {
  id: string;
  documenttype: string;
  title: string;
  framework: string | null;
  status: string;
  extractedtasks: number;
  createdat: string;
  filename: string | null;
}

const FRAMEWORK_COLORS: Record<string, string> = {
  SOC2: "bg-blue-100 text-blue-800",
  HIPAA: "bg-green-100 text-green-800",
  HITRUST: "bg-purple-100 text-purple-800",
  GDPR: "bg-orange-100 text-orange-800",
};

type Tab = "config" | "documents" | "tasks" | "executions" | "reports";

const tabs: { id: Tab; label: string; description: string }[] = [
  {
    id: "config",
    label: "Configuration",
    description: "Enable compliance frameworks and set audit policies",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Upload and manage compliance framework documents",
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Browse extracted compliance tasks",
  },
  {
    id: "executions",
    label: "Executions",
    description: "Run audits and view execution history",
  },
  {
    id: "reports",
    label: "Reports",
    description: "View and manage compliance reports",
  },
];

export const AuditManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [refreshKey, setRefreshKey] = useState(0);

  // Document library state
  const [documents, setDocuments] = useState<WxKanbanDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setDocsLoading(true);
      setDocsError(null);
      const response = await fetch("/api/audit/documents?limit=50", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load documents");
      const data = await response.json();
      setDocuments(data.data ?? []);
    } catch {
      setDocsError("Failed to load documents");
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "documents") {
      void loadDocuments();
    }
  }, [activeTab]);

  const handleDocumentUploaded = () => {
    setRefreshKey((prev) => prev + 1);
    void loadDocuments();
  };

  const handleExtractTasks = async (docId: string) => {
    // [SCOPE 146 / T006] MODIFIED-BY — extraction now replaces the document's tasks; say so before it runs (FR-006)
    if (
      !window.confirm(
        "Re-extract this document? Its existing compliance tasks, and any Platform Self-Audit results recorded against them, will be replaced by a fresh extraction.",
      )
    )
      return;
    try {
      setExtractingId(docId);
      const response = await fetch(`/api/audit/documents/${docId}/extract`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Extraction failed");
      await loadDocuments();
    } catch {
      setDocsError("Failed to extract tasks from document");
    } finally {
      setExtractingId(null);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    try {
      const response = await fetch(`/api/audit/documents/${docId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Delete failed");
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setDocsError("Failed to delete document");
    }
  };

  // [SCOPE 146 / T006] MODIFIED-BY — the Platform Compliance Library and the Platform Self-Audit are
  // SYSADMIN only; anyone else sees a notice and the page makes no /api/audit calls (FR-007)
  const { user } = useAuth();
  if (user?.usertype !== "SYSADMIN") {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Audit Management</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          System Administrator access required. Compliance frameworks for a project are set on that
          project's Compliance tab.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
          Audit Management
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Automated compliance auditing against SOC2, HIPAA, HITRUST, and GDPR frameworks.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex space-x-6 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <div className="text-left">
                <div>{tab.label}</div>
                <div className="text-xs font-normal text-gray-400 dark:text-gray-500 mt-0.5 hidden sm:block">
                  {tab.description}
                </div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Configuration */}
        {activeTab === "config" && <AuditConfigPanel />}

        {/* Documents */}
        {activeTab === "documents" && (
          <div className="space-y-6">
            <DocumentUpload onUpload={handleDocumentUploaded} />

            {/* Document Library */}
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Document Library
                </h3>
                <button
                  onClick={() => void loadDocuments()}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Refresh
                </button>
              </div>

              {docsError && (
                <div className="mb-3 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
                  {docsError}
                </div>
              )}

              {docsLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 animate-pulse py-4">
                  Loading documents...
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                  No documents uploaded yet. Use the panel above to upload a compliance document.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Title
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Framework
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Status
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Tasks
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Created
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {documents.map((doc) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                            {doc.title}
                            {doc.filename && (
                              <span className="block text-xs text-gray-400 dark:text-gray-500 font-normal">
                                {doc.filename}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {doc.framework ? (
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  FRAMEWORK_COLORS[doc.framework] ??
                                  "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {doc.framework}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                doc.status === "active"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                              }`}
                            >
                              {doc.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-sm font-semibold ${
                                doc.extractedtasks > 0
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-gray-400 dark:text-gray-500"
                              }`}
                            >
                              {doc.extractedtasks}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                            {new Date(doc.createdat).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                onClick={() => void handleExtractTasks(doc.id)}
                                disabled={extractingId === doc.id}
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                                title="Extract compliance tasks from this document"
                              >
                                {extractingId === doc.id ? "Extracting..." : "Extract Tasks"}
                              </button>
                              <button
                                onClick={() => void handleDeleteDocument(doc.id)}
                                className="text-xs text-red-500 dark:text-red-400 hover:underline"
                                title="Delete document"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks */}
        {activeTab === "tasks" && <AuditTaskBrowser key={refreshKey} />}

        {/* Executions */}
        {activeTab === "executions" && <AuditExecutionPanel key={refreshKey} />}

        {/* Reports */}
        {activeTab === "reports" && <ComplianceReportViewer key={refreshKey} />}
      </div>
    </div>
  );
};

export default AuditManagement;
