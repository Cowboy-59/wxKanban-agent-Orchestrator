import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "~/client/context/AuthContext";
import EmbeddedOverviewEditor from "~/client/components/overview/EmbeddedOverviewEditor";
import {
  X,
  FolderPlus,
  AlertCircle,
  Loader2,
  DollarSign,
  Clock,
  Link,
  Shield,
  Users,
} from "lucide-react";
import {
  defaultStackData,
  type ProjectStackData,
} from "~/shared/stack-defaults";
import StackEditor from "~/client/components/Projects/StackEditor"; // [SCOPE 055 / T008]
import ThemeStudio from "~/client/components/Projects/ThemeStudio"; // [SCOPE 062 / T011]
import { WXKANBAN_DEFAULT_THEME, type ProjectTheme } from "~/shared/theme-tokens"; // [SCOPE 062 / T011]

interface TeamMember {
  userid: string;
  fullname: string | null;
  email: string;
}

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: { id: string; name: string }) => void;
  proposal?: { id: string; title: string; description: string | null } | null;
}

type PhaseKey =
  | "Design"
  | "Implementation"
  | "QA"
  | "HumanTesting"
  | "Beta"
  | "Release";

const PHASE_KEYS: PhaseKey[] = [
  "Design",
  "Implementation",
  "QA",
  "HumanTesting",
  "Beta",
  "Release",
];

const PHASE_DISPLAY_LABELS: Record<PhaseKey, string> = {
  Design: "Design",
  Implementation: "Implementation",
  QA: "QA",
  HumanTesting: "Human Testing",
  Beta: "Beta",
  Release: "Release",
};

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVE", label: "Archive" },
  { value: "BRANCHED", label: "Branched" },
] as const;

const PM_OPTIONS = [
  { value: "jira", label: "Jira" },
  { value: "monday", label: "Monday.com" },
  { value: "asana", label: "Asana" },
  { value: "trello", label: "Trello" },
] as const;

const COMPLIANCE_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "HIPAA", label: "HIPAA" },
  { value: "SOC2", label: "SOC 2" },
  { value: "HITRUST", label: "HITRUST" },
  { value: "GDPR", label: "GDPR" },
] as const;

type PhaseAssignments = Record<PhaseKey, string>;

interface FormState {
  name: string;
  description: string;
  status: string;
  hourlyrate: string;
  allocatedhours: string;
  pmsystems: string[];
  compliance: string[];
  phaseassignments: PhaseAssignments;
}

const EMPTY_PHASE_ASSIGNMENTS: PhaseAssignments = {
  Design: "",
  Implementation: "",
  QA: "",
  HumanTesting: "",
  Beta: "",
  Release: "",
};

function buildInitialForm(): FormState {
  return {
    name: "",
    description: "",
    status: "ACTIVE",
    hourlyrate: "",
    allocatedhours: "",
    pmsystems: [],
    compliance: [],
    phaseassignments: { ...EMPTY_PHASE_ASSIGNMENTS },
  };
}

/**
 * CreateProjectModal — full-featured modal form for creating a new project.
 *
 * Fetches team members for phase assignment dropdowns, submits to POST /api/projects,
 * and delegates the result to the onCreated callback.
 */
export function CreateProjectModal({
  open,
  onClose,
  onCreated,
  proposal,
}: CreateProjectModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserid = user?.userid ?? "";
  const [form, setForm] = useState<FormState>(buildInitialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // [SCOPE 055] Stack & style captured in the new-project walkthrough.
  // Default-first: starts from the Web defaults; sent with the create request.
  const [stackData, setStackData] = useState<ProjectStackData>(() => defaultStackData(["web"]));
  const [themeData, setThemeData] = useState<ProjectTheme>(WXKANBAN_DEFAULT_THEME); // [SCOPE 062 / T011]
  const [customizedDims, setCustomizedDims] = useState<Set<string>>(new Set());

  const fetchTeamMembers = useCallback(async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const token = localStorage.getItem("wxkanban_token");
      const response = await fetch("/api/team", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error("Failed to load team members");
      }
      const data = (await response.json()) as { members: TeamMember[] };
      const members = data.members ?? [];
      setTeamMembers(members);

      // Multiple users: clear the pre-filled single-user assignment
      if (members.length > 1) {
        setForm((prev) => ({ ...prev, phaseassignments: { ...EMPTY_PHASE_ASSIGNMENTS } }));
      }
    } catch (err) {
      setTeamError(
        err instanceof Error ? err.message : "Could not load team members"
      );
    } finally {
      setTeamLoading(false);
    }
  }, []);

  // Reset form and fetch team when modal opens
  useEffect(() => {
    if (open) {
      // Pre-fill phase assignments with current user immediately (no fetch wait)
      const preAssigned: PhaseAssignments = currentUserid
        ? { Design: currentUserid, Implementation: currentUserid, QA: currentUserid, HumanTesting: currentUserid, Beta: currentUserid, Release: currentUserid }
        : { ...EMPTY_PHASE_ASSIGNMENTS };
      const base = buildInitialForm();
      setForm({
        ...base,
        name: proposal?.title ?? base.name,
        description: proposal?.description ?? base.description,
        phaseassignments: preAssigned,
      });
      setSubmitError(null);
      setStackData(defaultStackData(["web"]));
      setThemeData(WXKANBAN_DEFAULT_THEME); // [SCOPE 062 / T011]
      setCustomizedDims(new Set());
      fetchTeamMembers();
    }
  }, [open, fetchTeamMembers, currentUserid, proposal]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handlePmToggle = (pm: string) => {
    setForm((prev) => ({
      ...prev,
      pmsystems: prev.pmsystems.includes(pm)
        ? prev.pmsystems.filter((p) => p !== pm)
        : [...prev.pmsystems, pm],
    }));
  };

  const handleComplianceToggle = (standard: string) => {
    setForm((prev) => {
      if (standard === "NONE") {
        return { ...prev, compliance: prev.compliance.includes("NONE") ? [] : ["NONE"] };
      }
      const withoutNone = prev.compliance.filter((c) => c !== "NONE");
      return {
        ...prev,
        compliance: withoutNone.includes(standard)
          ? withoutNone.filter((c) => c !== standard)
          : [...withoutNone, standard],
      };
    });
  };

  const handlePhaseAssignment = (phase: PhaseKey, userid: string) => {
    setForm((prev) => ({
      ...prev,
      phaseassignments: { ...prev.phaseassignments, [phase]: userid },
    }));
  };

  /**
   * Create the project from the current form. Returns the created
   * { id, name } on success, or null if the user declined to create a
   * duplicate-named project. Throws on any other failure.
   *
   * `descriptionOverride` lets the Expand/Interview path use the latest editor
   * value without waiting for a state flush.
   */
  const createProject = async (
    allowduplicate: boolean,
    descriptionOverride?: string,
  ): Promise<{ id: string; name: string } | null> => {
    const token = localStorage.getItem("wxkanban_token");

    // Build phase assignments — only include phases with a valid UUID assigned
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const phaseassignments: Record<string, string> = {};
    for (const phase of PHASE_KEYS) {
      const val = form.phaseassignments[phase];
      if (val && uuidPattern.test(val)) phaseassignments[phase] = val;
    }

    const description = (descriptionOverride ?? form.description).trim();

    const body = {
      name: form.name.trim(),
      description: description || undefined,
      status: form.status,
      hourlyrate: form.hourlyrate ? parseFloat(form.hourlyrate) : undefined,
      allocatedhours: form.allocatedhours ? parseFloat(form.allocatedhours) : undefined,
      pmsystems: form.pmsystems.length > 0 ? form.pmsystems.join(",") : undefined,
      securityclassification: form.compliance.length > 0 ? form.compliance.join(",") : undefined,
      phaseassignments: Object.keys(phaseassignments).length > 0 ? phaseassignments : undefined,
      proposalid: proposal?.id,
      allowduplicate: allowduplicate || undefined,
      // [SCOPE 055] Captured stack & style → persisted as the ProjectStack document.
      stack: stackData,
    };

    const response = await fetch("/api/projects", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as {
        error?: string;
        code?: string;
        details?: { field: string; message: string }[];
      };

      // Duplicate name — offer to create anyway rather than hard-failing.
      if (response.status === 409 && errorBody.code === "DUPLICATE_NAME" && !allowduplicate) {
        const proceed = window.confirm(
          `${errorBody.error ?? "A project with this name already exists."}\n\nCreate it anyway?`
        );
        if (proceed) {
          return await createProject(true, descriptionOverride);
        }
        return null;
      }

      const detail = errorBody.details?.map((d) => `${d.field}: ${d.message}`).join("; ");
      throw new Error(detail ? `${errorBody.error} — ${detail}` : (errorBody.error ?? "Failed to create project"));
    }

    const result = (await response.json()) as { project: { id: string; name: string } };

    // [SCOPE 062 / T011] Persist the chosen theme for the new project (best-effort,
    // non-blocking). Only when the user moved off the wxKanban default.
    if (themeData.sourceRef !== "wxkanban-default") {
      try {
        await fetch(`/api/projects/${result.project.id}/theme`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ appType: stackData.appTypes[0] ?? "web", theme: themeData }),
        });
      } catch {
        /* theme persistence is non-blocking; it can be set later from the Theme tab */
      }
    }

    return result.project;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const project = await createProject(false);
      if (project) {
        onCreated(project);
        onClose();
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Expand / Interview ("create project, then edit" flow): create the project
   * now, then open the full-screen project-mode overview editor (Spec 025
   * FR-016/FR-017) seeded with whatever's been typed. The editor's "Done
   * editing" finalizes the content into the project's ProjectOverview document.
   * A project name is required (it's required to create the project).
   */
  const openOverviewEditor = async (
    currentValue: string,
    startInterview: boolean,
  ) => {
    if (!form.name.trim()) {
      setSubmitError("Enter a project name before opening the full-screen editor.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    try {
      const project = await createProject(false, currentValue);
      if (!project) return; // user declined a duplicate

      const token = localStorage.getItem("wxkanban_token");
      const draftRes = await fetch(
        `/api/overview/draft-by-project/${project.id}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!draftRes.ok) {
        throw new Error(
          "Project created, but the overview editor could not be opened. Open it later from the project's Overview link.",
        );
      }
      const { draftid } = (await draftRes.json()) as { draftid: string };

      // Seed the typed description into the draft itself (not via router state):
      // the editor skips its draft-load when `seedContent` is present, which
      // would leave it unaware of the projectid and out of project-mode. PUT-ing
      // the content lets the editor load normally and finalize correctly.
      if (currentValue.trim()) {
        const putRes = await fetch(`/api/overview/draft/${draftid}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content: currentValue }),
        });
        if (!putRes.ok) {
          throw new Error(
            "Project created, but the overview text could not be seeded. Open the editor later from the project's Overview link.",
          );
        }
      }

      onClose();
      navigate(`/overview/${draftid}`, { state: { startInterview } });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to open the overview editor",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            New Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Submit error */}
            {submitError && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  {submitError}
                </p>
              </div>
            )}

            {/* ── Project Name ── */}
            <div>
              <label
                htmlFor="proj-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                id="proj-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Customer Portal Redesign"
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* ── Description / Project Overview ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="proj-desc"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Description / Project Overview{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    (optional)
                  </span>
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Becomes the project's overview document.
                </span>
              </div>
              <EmbeddedOverviewEditor
                value={form.description}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, description: value }))
                }
                onExpand={(currentValue) =>
                  openOverviewEditor(currentValue, false)
                }
                onInterview={(currentValue) =>
                  openOverviewEditor(currentValue, true)
                }
                placeholder="Describe the project scope and goals. Use AI assist above, Preview for markdown, or Expand for the full editor..."
                disabled={submitting}
              />
            </div>

            {/* ── Status ── */}
            <div>
              <label
                htmlFor="proj-status"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Status
              </label>
              <select
                id="proj-status"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Hourly Rate + Allocated Hours ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="proj-rate"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Hourly Rate{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    (optional)
                  </span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    id="proj-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.hourlyrate}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, hourlyrate: e.target.value }))
                    }
                    placeholder="0.00"
                    disabled={submitting}
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="proj-hours"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Allocated Hours{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    (optional)
                  </span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    id="proj-hours"
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.allocatedhours}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        allocatedhours: e.target.value,
                      }))
                    }
                    placeholder="0"
                    disabled={submitting}
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* ── PM Systems ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                <Link className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                PM Integrations{" "}
                <span className="text-gray-400 dark:text-gray-500 font-normal">
                  (optional)
                </span>
              </label>
              <div className="flex flex-wrap gap-3">
                {PM_OPTIONS.map((pm) => {
                  const checked = form.pmsystems.includes(pm.value);
                  return (
                    <label
                      key={pm.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors select-none ${
                        checked
                          ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                          : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500"
                      } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handlePmToggle(pm.value)}
                        disabled={submitting}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      {pm.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ── Compliance Audits ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                Compliance Audits{" "}
                <span className="text-gray-400 dark:text-gray-500 font-normal">
                  (optional)
                </span>
              </label>
              <div className="flex flex-wrap gap-3">
                {COMPLIANCE_OPTIONS.map((opt) => {
                  const checked = form.compliance.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors select-none ${
                        checked
                          ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                          : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500"
                      } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleComplianceToggle(opt.value)}
                        disabled={submitting}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ── Phase Assignments ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phase Assignments{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    (optional)
                  </span>
                </span>
              </div>

              {teamLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading team members...
                </div>
              )}

              {teamError && !teamLoading && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {teamError} — you can still create the project and assign
                    phases later.
                  </p>
                </div>
              )}

              {!teamLoading && (
                <div className="space-y-2">
                  {PHASE_KEYS.map((phase) => (
                    <div
                      key={phase}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300 w-32 flex-shrink-0">
                        {PHASE_DISPLAY_LABELS[phase]}
                      </span>
                      <select
                        value={form.phaseassignments[phase]}
                        onChange={(e) =>
                          handlePhaseAssignment(phase, e.target.value)
                        }
                        disabled={submitting || teamLoading}
                        className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((member) => (
                          <option key={member.userid} value={member.userid}>
                            {member.fullname
                              ? `${member.fullname} (${member.email})`
                              : member.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Stack & Style (SCOPE 055) ── */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
              <StackEditor
                data={stackData}
                onChange={setStackData}
                customizedDims={customizedDims}
                onCustomizedDimsChange={setCustomizedDims}
                disabled={submitting}
              />
            </div>

            {/* ── Theme (SCOPE 062 / T011) ── */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Theme</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Pick a preset, derive from a reference, or build your own. You can refine this
                  anytime from the project&apos;s Theme tab.
                </p>
              </div>
              <ThemeStudio
                appType={stackData.appTypes[0] ?? "web"}
                value={themeData}
                onChange={setThemeData}
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
