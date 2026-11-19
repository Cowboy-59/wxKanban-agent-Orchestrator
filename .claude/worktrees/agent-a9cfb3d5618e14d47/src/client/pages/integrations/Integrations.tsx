import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "../../i18n"; // [SCOPE 052]

interface PMConnection {
  connectionid: string;
  pmsystem: string;
  syncstatus: "active" | "expired" | "failed";
  lastsyncsat?: string;
  createdat: string;
}

const PM_SYSTEMS = [
  { id: "jira", name: "Jira", color: "bg-blue-600" },
  { id: "monday", name: "Monday.com", color: "bg-purple-600" },
  { id: "asana", name: "Asana", color: "bg-red-600" },
  { id: "trello", name: "Trello", color: "bg-cyan-600" },
];

export default function IntegrationsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [connections, setConnections] = useState<PMConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success] = useState(searchParams.get("success") === "true");

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/pm-systems", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch connections");
      }

      const data = await response.json();
      setConnections(data.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load integrations",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (systemId: string) => {
    try {
      setError(null);
      const response = await fetch(
        `/api/pm-systems/${systemId}/authorize`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start OAuth flow");
      }
      const data = await response.json();
      const url = data?.data?.url;
      if (!url) {
        throw new Error("Server did not return an authorization URL");
      }
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start OAuth flow",
      );
    }
  };

  const handleDisconnect = async (systemId: string) => {
    if (!confirm(t("integrations.confirmDisconnect", { system: systemId }))) return;

    try {
      const response = await fetch(`/api/pm-systems/${systemId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      await fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            ← {t("tasks.back")}
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {t("integrations.title")}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {t("integrations.subtitle")}
              </p>
            </div>
            <button
              onClick={() => navigate("/tasks")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              {t("integrations.viewTasks")}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {success && (
          <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-green-700 dark:text-green-400">
              {t("integrations.connectedSuccess")}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-400">✗ {error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">{t("integrations.loading")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PM_SYSTEMS.map((system) => {
              const connection = connections.find(
                (c) => c.pmsystem === system.id,
              );

              return (
                <div
                  key={system.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-6"
                >
                  <div className="flex items-center mb-4">
                    <div
                      className={`${system.color} text-white rounded-lg p-3 mr-4`}
                    >
                      {system.name[0]}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {system.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {connection
                          ? t("integrations.connectedSince", { date: new Date(connection.createdat).toLocaleDateString() })
                          : t("integrations.notConnected")}
                      </p>
                    </div>
                  </div>

                  {connection && (
                    <div className="mb-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          connection.syncstatus === "active"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                            : connection.syncstatus === "expired"
                              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400"
                              : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400"
                        }`}
                      >
                        {connection.syncstatus === "active"
                          ? t("integrations.active")
                          : `⚠ ${connection.syncstatus}`}
                      </span>
                      {connection.lastsyncsat && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {t("tasks.lastSync")}{" "}
                          {new Date(connection.lastsyncsat).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {connection ? (
                    <button
                      onClick={() => handleDisconnect(system.id)}
                      className="w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 font-semibold py-2 px-4 rounded-lg transition"
                    >
                      {t("integrations.disconnect")}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(system.id)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      {t("integrations.connect")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
            {t("integrations.needHelp")}
          </h4>
          <p className="text-blue-700 dark:text-blue-400 text-sm">
            {t("integrations.helpText")}
          </p>
        </div>
      </div>
    </div>
  );
}
