import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext.js";


interface AuditConfig {
  id: string;
  companyid: string;
  soc2enabled: boolean;
  hipaaenabled: boolean;
  hitrustenabled: boolean;
  gdprenabled: boolean;
  autoauditondeploy: boolean;
  autoauditschedule: "daily" | "weekly" | "monthly";
  auditseveritythreshold: "low" | "medium" | "high" | "critical";
  failoncritical: boolean;
  auditreportretentiondays: number;
  createdat: string;
  updatedat: string;
}

interface AuditConfigPanelProps {
  onChange?: () => void;
  /**
   * SPEC-112 / FR-001 — when supplied, edits that project's own configuration.
   * When omitted the panel edits the COMPANY row, which is the template new
   * projects inherit at creation, not a setting that governs existing projects.
   */
  projectId?: string;
}

export const AuditConfigPanel: React.FC<AuditConfigPanelProps> = ({ onChange, projectId }) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<AuditConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const configUrl = projectId
    ? `/api/audit/config?projectId=${encodeURIComponent(projectId)}`
    : "/api/audit/config";

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(configUrl, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load config");
      const data = await response.json();
      setConfig(data.data);
    } catch (err) {
      setError("Failed to load audit configuration");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  const handleToggle = (field: keyof AuditConfig) => {
    if (!config) return;
    setConfig({ ...config, [field]: !config[field] });
  };

  const handleChange = (field: keyof AuditConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(configUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          soc2enabled: config.soc2enabled,
          hipaaenabled: config.hipaaenabled,
          hitrustenabled: config.hitrustenabled,
          gdprenabled: config.gdprenabled,
          autoauditondeploy: config.autoauditondeploy,
          autoauditschedule: config.autoauditschedule,
          auditseveritythreshold: config.auditseveritythreshold,
          failoncritical: config.failoncritical,
          auditreportretentiondays: config.auditreportretentiondays,
        }),
      });

      if (!response.ok) throw new Error("Failed to save config");
      const data = await response.json();
      setConfig(data.data);
      setSuccess("Configuration saved successfully");
      onChange?.();
    } catch (err) {
      setError("Failed to save configuration");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return <div className="p-4">Loading configuration...</div>;
  }

  if (!config) {
    return <div className="p-4 text-red-600">Failed to load configuration</div>;
  }

  const isAdmin = user?.usertype === "ADMIN";

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-1">
        {projectId ? "Project Compliance" : "Company Compliance Defaults"}
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        {projectId
          ? "Frameworks enforced for this project. Inherited from the company defaults when the project was created, and adjustable here."
          : "Defaults applied to newly created projects. Changing these does not alter existing projects — set those in each project's own Compliance tab."}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">{success}</div>
      )}

      <div className="space-y-6">
        {/* Framework Enablement */}
        <div>
          <h3 className="text-lg font-medium mb-3">Compliance Frameworks</h3>
          <p className="text-sm text-gray-600 mb-3">
            {projectId
              ? "Frameworks this project is audited against. Several may apply at once."
              : "Frameworks new projects will start with. Several may apply at once."}{" "}
            All are disabled by default. wxKanban covers the secure-development
            controls of each framework, not your wider management system.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.soc2enabled}
                onChange={() => handleToggle("soc2enabled")}
                disabled={!isAdmin}
                className="h-4 w-4 text-blue-600"
              />
              <div>
                <span className="font-medium">SOC 2</span>
                <p className="text-xs text-gray-500">Service Organization Control 2</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.hipaaenabled}
                onChange={() => handleToggle("hipaaenabled")}
                disabled={!isAdmin}
                className="h-4 w-4 text-blue-600"
              />
              <div>
                <span className="font-medium">HIPAA</span>
                <p className="text-xs text-gray-500">Health Insurance Portability and Accountability Act</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.hitrustenabled}
                onChange={() => handleToggle("hitrustenabled")}
                disabled={!isAdmin}
                className="h-4 w-4 text-blue-600"
              />
              <div>
                <span className="font-medium">HITRUST</span>
                <p className="text-xs text-gray-500">Health Information Trust Alliance</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={config.gdprenabled}
                onChange={() => handleToggle("gdprenabled")}
                disabled={!isAdmin}
                className="h-4 w-4 text-blue-600"
              />
              <div>
                <span className="font-medium">GDPR</span>
                <p className="text-xs text-gray-500">General Data Protection Regulation</p>
              </div>
            </label>
          </div>
        </div>

        {/* Automation Settings */}
        <div>
          <h3 className="text-lg font-medium mb-3">Automation Settings</h3>
          <div className="space-y-4">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={config.autoauditondeploy}
                onChange={() => handleToggle("autoauditondeploy")}
                disabled={!isAdmin}
                className="h-4 w-4 text-blue-600"
              />
              <span>Run audit automatically on deployment</span>
            </label>

            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium w-48">Audit Schedule:</span>
              <select
                value={config.autoauditschedule}
                onChange={(e) => handleChange("autoauditschedule", e.target.value)}
                disabled={!isAdmin}
                className="border rounded px-3 py-1"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium w-48">Severity Threshold:</span>
              <select
                value={config.auditseveritythreshold}
                onChange={(e) => handleChange("auditseveritythreshold", e.target.value)}
                disabled={!isAdmin}
                className="border rounded px-3 py-1"
              >
                <option value="low">Low (All findings)</option>
                <option value="medium">Medium and above</option>
                <option value="high">High and above</option>
                <option value="critical">Critical only</option>
              </select>
            </div>

            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={config.failoncritical}
                onChange={() => handleToggle("failoncritical")}
                disabled={!isAdmin}
                className="h-4 w-4 text-blue-600"
              />
              <span>Fail deployment on critical findings</span>
            </label>

            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium w-48">Report Retention (days):</span>
              <input
                type="number"
                min={30}
                max={2555}
                value={config.auditreportretentiondays}
                onChange={(e) => handleChange("auditreportretentiondays", parseInt(e.target.value))}
                disabled={!isAdmin}
                className="border rounded px-3 py-1 w-24"
              />
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        )}

        {!isAdmin && (
          <p className="text-sm text-gray-500 italic">
            Only administrators can modify audit configuration.
          </p>
        )}
      </div>
    </div>
  );
};
