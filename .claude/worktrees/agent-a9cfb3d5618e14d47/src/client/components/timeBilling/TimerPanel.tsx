import { useCallback, useEffect, useState } from "react";
import { Pause, Play, RefreshCw, Square, Timer } from "lucide-react";
import { Button } from "~/client/components/ui/Button";
import { Textarea } from "~/client/components/ui/Textarea";
import { useTranslation } from "~/client/i18n";
import { tbFetch } from "./api";
import { formatElapsed, roundUpPreview } from "./duration";

// [SCOPE 005 / T016] BEGIN — TimerPanel: running side timer with automatic and manual notes (FR-006)
// MODIFIED-BY: [SCOPE 005 / T029] — Pause/Resume on the card; the clock freezes while paused (Amendment F)
export interface RunningTimerView {
  entry: { id: string; projectid: string; specid: string | null; line: string; starttime: string };
  /** Active seconds (paused time excluded), as of the server's answer. */
  elapsedSeconds: number;
  /** True while the timer is paused (Amendment F). */
  paused?: boolean;
}

interface TimerPanelProps {
  timer: RunningTimerView | null;
  /** "Project · line" for the running timer's line. */
  lineLabel: string;
  onStopped: () => void;
  /** Called after Pause or Resume so the page reloads the timer; defaults to onStopped. */
  onChanged?: () => void;
}

const MANUAL_NOTES_KEY = "wxkanban_tb_timer_notes";

export function TimerPanel({ timer, lineLabel, onStopped, onChanged }: TimerPanelProps) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const [auto, setAuto] = useState<{ available: boolean; lines: string[] } | null>(null);
  // Manual notes live in the browser until stop, so a reload keeps them with the timer.
  const [manual, setManual] = useState(() => localStorage.getItem(MANUAL_NOTES_KEY) ?? "");
  const [stopping, setStopping] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paused = timer?.paused === true;

  useEffect(() => {
    if (!timer) return;
    setElapsed(timer.elapsedSeconds);
    // A paused clock holds still; a running one counts on from the server's active seconds.
    if (timer.paused) return;
    const started = Date.now() - timer.elapsedSeconds * 1000;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  useEffect(() => {
    localStorage.setItem(MANUAL_NOTES_KEY, manual);
  }, [manual]);

  const refreshNotes = useCallback(async () => {
    try {
      setAuto(await tbFetch<{ available: boolean; lines: string[] }>("/timer/notes"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.timer.notesFailed"));
    }
  }, [t]);

  const timerId = timer?.entry.id ?? null;
  useEffect(() => {
    if (timerId) void refreshNotes();
  }, [timerId, refreshNotes]);

  if (!timer) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-4 text-sm text-slate-500">
        <p className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
          <Timer className="w-4 h-4" />
          {t("timeBilling.timer.title")}
        </p>
        <p className="mt-2">{t("timeBilling.timer.idle")}</p>
      </div>
    );
  }

  const stop = async () => {
    setStopping(true);
    setError(null);
    try {
      await tbFetch("/timer/stop", { method: "POST", body: { manualNotes: manual.trim() === "" ? null : manual } });
      setManual("");
      localStorage.removeItem(MANUAL_NOTES_KEY);
      setAuto(null);
      onStopped();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.timer.stopFailed"));
    } finally {
      setStopping(false);
    }
  };

  const togglePause = async () => {
    setToggling(true);
    setError(null);
    try {
      await tbFetch(paused ? "/timer/resume" : "/timer/pause", { method: "POST", body: {} });
      (onChanged ?? onStopped)();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.timer.pauseFailed"));
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 flex flex-col gap-3">
      <p className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
        <Timer className="w-4 h-4 text-indigo-600" />
        {t("timeBilling.timer.title")}
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{lineLabel}</p>
      <p className={paused ? "text-3xl font-semibold tabular-nums text-slate-400" : "text-3xl font-semibold tabular-nums"} aria-live="off">
        {formatElapsed(elapsed)}
      </p>
      {paused && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("timeBilling.timer.paused")}</p>}
      <p className="text-xs text-slate-500">
        {t("timeBilling.timer.willSave", { hours: roundUpPreview(Math.max(1, Math.ceil(elapsed / 60))) })}
      </p>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("timeBilling.timer.autoNotes")}</span>
          <Button size="sm" variant="ghost" onClick={() => void refreshNotes()} aria-label={t("timeBilling.timer.refresh")}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        {auto && !auto.available ? (
          <p className="text-xs text-slate-500">{t("timeBilling.timer.autoUnavailable")}</p>
        ) : auto && auto.lines.length > 0 ? (
          <ul className="max-h-32 overflow-y-auto text-xs font-mono text-slate-600 dark:text-slate-300">
            {auto.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">{t("timeBilling.timer.noRuns")}</p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("timeBilling.timer.manualNotes")}</span>
        <Textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={t("timeBilling.timer.manualPlaceholder")}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => void togglePause()} disabled={toggling || stopping}>
          {paused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
          {paused ? t("timeBilling.timer.resume") : t("timeBilling.timer.pause")}
        </Button>
        <Button className="flex-1" onClick={() => void stop()} disabled={stopping || toggling}>
          <Square className="w-4 h-4 mr-2" />
          {stopping ? t("timeBilling.common.saving") : t("timeBilling.timer.stop")}
        </Button>
      </div>
    </div>
  );
}
// [SCOPE 005 / T016] END
