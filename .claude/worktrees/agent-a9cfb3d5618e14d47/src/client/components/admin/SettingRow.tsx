import { useState } from "react";
import type { Setting, SettingType } from "~/shared/types/settings";

interface SettingRowProps {
  setting: Setting;
  onUpdate: (name: string, value: string, description?: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
}

const TYPE_BADGE: Record<SettingType, string> = {
  boolean: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  default: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  report_header: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  image: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

export default function SettingRow({ setting, onUpdate, onDelete }: SettingRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editValue, setEditValue] = useState(setting.value);
  const [editDesc, setEditDesc] = useState(setting.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdate(setting.name, editValue, editDesc || undefined);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      await onDelete(setting.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(setting.value);
    setEditDesc(setting.description ?? "");
    setEditing(false);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_BADGE[setting.type]}`}>
            {setting.type}
          </span>
          <span className="truncate font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
            {setting.name}
          </span>
        </div>

        {!editing && !confirmDelete && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Edit setting"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {/* Pencil icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button
              type="button"
              title="Delete setting"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            >
              {/* Trash icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Value display / edit */}
      {editing ? (
        <div className="mt-1 flex flex-col gap-2">
          {setting.type === "boolean" ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : setting.type === "report_header" ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={3}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          ) : (
            <input
              type={setting.type === "image" ? "url" : "text"}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          )}
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : confirmDelete ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-red-600 dark:text-red-400">Delete this setting?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {saving ? "Deleting…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={saving}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-0.5">
          {setting.type === "boolean" ? (
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${setting.value === "true" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
              {setting.value}
            </span>
          ) : setting.type === "image" ? (
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400" title={setting.value}>
              {setting.value}
            </span>
          ) : (
            <span className="text-sm text-slate-700 dark:text-slate-300">{setting.value}</span>
          )}
          {setting.description && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{setting.description}</p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
