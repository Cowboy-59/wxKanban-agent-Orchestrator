/**
 * KitManager Component
 * 
 * Project Kit management UI for Spec 011: New Project — AI-Ready Project Provisioning
 * 
 * Features:
 * - View kit status
 * - Generate/regenerate kit
 * - Download kit
 * - View kit files list
 */

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  RefreshCw,
  Package,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileCode,
  Settings,
  Terminal,
  Shield,
  Copy,
  Check,
} from "lucide-react";



interface KitStatus {
  kitId?: string;
  status: "not_found" | "generating" | "ready" | "failed";
  primaryAi?: string;
  kitVersion?: string;
  downloadCount?: number;
  generatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Spec 011 Access Control: true if ADMIN or assigned to the project.
  // Drives visibility of Generate / Check Prerequisites / Download buttons.
  canManage?: boolean;
  // Hosted-MCP base URL (spec 028) — used to render the exact .env entries.
  mcpBaseUrl?: string;
}

interface KitFile {
  path: string;
  type: string;
  size?: number;
}

interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

interface PreflightResponse {
  ready: boolean;
  checks: PreflightCheck[];
  missing: string[];
  requiredAtRuntime: string[];
}

interface KitManagerProps {
  projectId: string;
  projectName?: string;
  isAdmin: boolean;
}

export function KitManager({ projectId, projectName, isAdmin }: KitManagerProps) {

  const [kitStatus, setKitStatus] = useState<KitStatus | null>(null);
  const [kitFiles, setKitFiles] = useState<KitFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<PreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightChecked, setPreflightChecked] = useState(false);






  const getToken = () => localStorage.getItem("wxkanban_token");

  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };


  const fetchKitStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/projects/${projectId}/kit`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setKitStatus(null);
          return;
        }
        throw new Error(`Failed to fetch kit status: ${res.status}`);
      }

      const data = await res.json();
      setKitStatus(data);

      // If kit is ready, fetch files
      if (data.status === "ready" && data.kitId) {
        await fetchKitFiles(data.kitId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kit status");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchKitFiles = async (_kitId: string) => {
    try {
      // This would be a new endpoint to list kit files
      // For now, we'll show the standard kit structure with 017 MCP
      const standardFiles: KitFile[] = [
        { path: "_wxAI/commands/task-push.md", type: "command" },
        { path: "_wxAI/commands/task-done.md", type: "command" },
        { path: "_wxAI/commands/createSpecs.md", type: "command" },
        { path: "_wxAI/commands/autofix-tests.md", type: "command" },
        { path: "_wxAI/commands/autofix-translation.md", type: "command" },
        { path: "_wxAI/commands/sync-cpl.md", type: "command" },
        { path: "_wxAI/commands/sync-starter-kit.md", type: "command" },
        { path: "_wxAI/settings.json", type: "wxai" },
        { path: "_wxAI/rules/constitution.md", type: "wxai" },
        { path: "_wxAI/scripts/sync-global.sh", type: "wxai" },
        { path: "mcp-server/src/server.ts", type: "mcp" },
        { path: "mcp-server/src/index.ts", type: "mcp" },
        { path: "mcp-server/package.json", type: "mcp" },
        { path: "ai-settings.json", type: "config" },
        { path: "AI.md", type: "context" },
        { path: ".wxkanban-project.json", type: "config" },
        { path: "ProjectOverview.md", type: "template" },
        { path: "ProjectInit.zip", type: "template" },
      ];


      setKitFiles(standardFiles);
    } catch (err) {
      console.error("Failed to fetch kit files:", err);
    }
  };

  const generateKit = async () => {
    // No client-side role guard — server enforces access per spec 011 Access
    // Control (ADMIN or assigned user). The button is only rendered when
    // canManage is true, so reaching this function implies intent.

    try {
      setGenerating(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`/api/projects/${projectId}/kit/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ primaryAi: "blackboxai" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate kit");
      }

      setSuccess("Kit generation started. This may take a few moments.");
      setKitStatus((prev) =>
        prev
          ? { ...prev, status: "generating" }
          : {
              kitId: "",
              status: "generating",
              primaryAi: "blackboxai",
              kitVersion: "1.0.0",
              downloadCount: 0,
              generatedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
      );

      // Poll for status
      pollKitStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate kit");
    } finally {
      setGenerating(false);
    }
  };

  const pollKitStatus = () => {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setError("Kit generation timed out. Please refresh to check status.");
        return;
      }

      try {
        const res = await fetch(`/api/projects/${projectId}/kit`, {
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders() },
        });

        if (res.ok) {
          const data = await res.json();
          setKitStatus(data);

          if (data.status === "ready") {
            clearInterval(interval);
            setSuccess("Kit is ready for download!");
            await fetchKitFiles(data.kitId);
          } else if (data.status === "failed") {
            clearInterval(interval);
            setError("Kit generation failed. Please try again.");
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 1000);
  };

  const checkPreflight = async (): Promise<PreflightResponse | null> => {
    try {
      setPreflightLoading(true);
      setError(null);

      const res = await fetch(`/api/projects/${projectId}/kit/preflight`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });

      const data = await res.json();
      setPreflightStatus(data);
      setPreflightChecked(true);

      if (!res.ok) {
        setError(
          data.error ||
            `Server prerequisites not met. Please fix the issues above before downloading.`
        );
        return null;
      }

      return data as PreflightResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check preflight");
      setPreflightStatus(null);
      return null;
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleDownloadClick = async () => {
    // Ensure prerequisites are validated right before download.
    if (!preflightChecked || !preflightStatus?.ready) {
      const result = await checkPreflight();
      if (!result?.ready) {
        return;
      }
    }

    await downloadKit();
  };

  const downloadKit = async () => {
    try {
      setDownloading(true);
      setError(null);

      const res = await fetch(`/api/projects/${projectId}/kit/download`, {
        credentials: "include",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download kit");
      }

      // Surface kit-source/version info to DevTools console so the user can
      // verify which path served the download (orchestrator-proxy vs legacy-db)
      // without having to inspect the Network tab response headers manually.
      const kitInfo = {
        source: res.headers.get("X-Kit-Source") ?? "(unset — legacy server)",
        version: res.headers.get("X-Kit-Version") ?? "(unset)",
        sha256: res.headers.get("X-Kit-Sha256") ?? "(n/a — only on orchestrator path)",
        contentType: res.headers.get("Content-Type"),
        contentDisposition: res.headers.get("Content-Disposition"),
      };
      // eslint-disable-next-line no-console
      console.info("[kit-download]", kitInfo);

      // Get the ZIP blob from response
      const blob = await res.blob();

      // Get filename from Content-Disposition header or use default
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `${projectName || "project"}-kit.zip`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Check for API token in header
      const token = res.headers.get("X-API-Token");
      if (token) {
        setApiToken(token);
      } else {
        setApiToken(null);
      }

      // Refresh status to update download count
      await fetchKitStatus();

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download kit");
    } finally {
      setDownloading(false);
    }
  };



  // The exact three-line .env the kit ships (hosted MCP, spec 028). Kept in lock-step
  // with the download handler in kitRoutes.ts so the copy/paste fallback is byte-identical
  // to the file the ZIP contains. The token is only known to the client right after a
  // download (X-API-Token header → apiToken state); otherwise we leave a clear placeholder.
  const mcpBaseUrl = kitStatus?.mcpBaseUrl || "https://mcp.wxperts.com";

  const buildEnvFile = () => `# wxKanban Project Environment (hosted MCP per spec 028)
WXKANBAN_MCP_BASE_URL=${mcpBaseUrl}
WXKANBAN_API_TOKEN=${apiToken ?? "<paste your API token — shown once when you download the kit>"}
WXKANBAN_PROJECT_ID=${projectId}
`;

  const copyEnvTemplate = () => {
    navigator.clipboard.writeText(buildEnvFile());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    fetchKitStatus();
  }, [fetchKitStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          Loading kit status...
        </span>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (kitStatus?.status) {
      case "ready":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "generating":
        return <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Package className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (kitStatus?.status) {
      case "ready":
        return "Ready for download";
      case "generating":
        return "Generating...";
      case "failed":
        return "Generation failed";
      default:
        return "No kit generated";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            AI Project Kit
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Complete AI-ready development environment for this project
          </p>
        </div>
        {getStatusIcon()}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-2">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Kit Ready to download. Extract the ZIP to your project directory.
              </p>

              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Includes ProjectInit.zip for new project setup.
              </p>
            </div>
          </div>
          {apiToken && (
            <div className="pl-8 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={apiToken}
                  readOnly
                  className="flex-1 text-xs bg-gray-900 text-gray-100 px-2 py-1.5 rounded font-mono border border-gray-700"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(apiToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy Token"}
                </button>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400">
                Save this token - it won't be shown again!
              </p>
            </div>
          )}

        </div>
      )}



      {/* Status Card */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Status
          </span>
          <span
            className={`text-sm font-medium ${
              kitStatus?.status === "ready"
                ? "text-green-600 dark:text-green-400"
                : kitStatus?.status === "generating"
                ? "text-yellow-600 dark:text-yellow-400"
                : kitStatus?.status === "failed"
                ? "text-red-600 dark:text-red-400"
                : "text-gray-600 dark:text-gray-400"
            }`}
          >
            {getStatusText()}
          </span>
        </div>

        {kitStatus?.status === "ready" && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Version
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {kitStatus.kitVersion}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Primary AI
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                {kitStatus.primaryAi}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Downloads
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {kitStatus.downloadCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Generated
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {kitStatus.generatedAt
                  ? new Date(kitStatus.generatedAt).toLocaleDateString()
                  : "N/A"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Preflight Results */}
      {preflightChecked && preflightStatus && (
        <div
          className={`p-4 rounded-lg border ${
            preflightStatus.ready
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
              : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          }`}
        >
          <div className="flex items-start gap-3">
            {preflightStatus.ready ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  preflightStatus.ready
                    ? "text-green-700 dark:text-green-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {preflightStatus.ready
                  ? "All prerequisites met. Ready to download kit."
                  : "Some prerequisites are missing. Please address the issues below:"}
              </p>
              {!preflightStatus.ready && preflightStatus.missing?.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p
                    className={`text-xs ${
                      preflightStatus.ready
                        ? "text-green-600 dark:text-green-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    <strong>Missing:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    {preflightStatus.missing?.map((item, idx) => (
                      <li
                        key={idx}
                        className={`text-xs ${
                          preflightStatus.ready
                            ? "text-green-600 dark:text-green-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preflightStatus.checks?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {preflightStatus.checks?.map((check, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {check.status === "pass" ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <span
                        className={`text-xs ${
                          check.status === "pass"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {check.name}: {check.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions — spec 011 Access Control: ADMIN OR assigned user.
          canManage is computed server-side in GET /api/projects/:id/kit.
          Fallback to isAdmin if the field is absent (old API response). */}
      {(kitStatus?.canManage ?? isAdmin) && (
        <div className="flex flex-wrap gap-3">
          {kitStatus?.status !== "generating" && (
            <button
              onClick={generateKit}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : kitStatus?.status === "ready" ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Package className="w-4 h-4" />
              )}
              {generating
                ? "Generating..."
                : kitStatus?.status === "ready"
                ? "Generate Kit"
                : "Generate Kit"}

            </button>
          )}

          {kitStatus?.status === "ready" && !preflightChecked && (
            <button
              onClick={checkPreflight}
              disabled={preflightLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {preflightLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {preflightLoading ? "Checking..." : "Check Prerequisites"}
            </button>
          )}

          {kitStatus?.status === "ready" && (
            <button
              onClick={handleDownloadClick}
              disabled={downloading || preflightLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {downloading || preflightLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloading ? "Downloading..." : preflightLoading ? "Checking..." : "Download Kit"}
            </button>
          )}

          {kitStatus?.status === "ready" && preflightChecked && !preflightStatus?.ready && (
            <button
              onClick={() => setPreflightChecked(false)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Check Again
            </button>
          )}


        </div>
      )}

      {/* Kit Contents */}

      {kitFiles.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Kit Contents
            </h4>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {kitFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                {file.type === "command" && (
                  <Terminal className="w-4 h-4 text-blue-500" />
                )}
                {file.type === "mcp" && (
                  <Settings className="w-4 h-4 text-purple-500" />
                )}

                {file.type === "config" && (
                  <FileCode className="w-4 h-4 text-yellow-500" />
                )}
                {file.type === "context" && (
                  <Shield className="w-4 h-4 text-green-500" />
                )}
                {file.type === "template" && (
                  <FileCode className="w-4 h-4 text-gray-500" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                  {file.path}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Environment Setup */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-indigo-900 dark:text-indigo-300 mb-2">
          Environment Setup
        </h4>
        <p className="text-xs text-indigo-700 dark:text-indigo-400 mb-3">
          The kit already includes a <code className="font-mono">.env</code> file at its root.
          If it didn&apos;t land on disk &mdash; on macOS, Finder hides dotfiles, so reveal
          them with <strong>Cmd&nbsp;+&nbsp;Shift&nbsp;+&nbsp;.</strong> &mdash; create a
          <code className="font-mono"> .env</code> in your project root and paste these exact entries:
        </p>
        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
            {buildEnvFile()}
          </pre>
          <button
            onClick={copyEnvTemplate}
            className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {!apiToken && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
            Your <code className="font-mono">WXKANBAN_API_TOKEN</code> is shown once when you
            download the kit (and is written into the kit&apos;s <code className="font-mono">.env</code>).
            Download again to reveal a fresh token if you need it here.
          </p>
        )}
      </div>

      {/* Documentation */}
      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
        <p>
          <strong className="text-gray-700 dark:text-gray-300">
            What&apos;s included:
          </strong>
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>AI-agnostic command files using project.* MCP tools</li>
          <li>017 MCP Project Hub server (6 core tools with event sourcing)</li>
          <li>Multi-AI settings (BLACKBOXAI, Claude, Cursor, Copilot)</li>
          <li>Project context and configuration files</li>
          <li>Encrypted database credentials</li>
        </ul>
        <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
          <strong>MCP Tools:</strong> capture_event, upsert_document, create_task, 
          update_task_status, link_doc_to_task, list_open_items
        </p>
      </div>

    </div>
  );
}
