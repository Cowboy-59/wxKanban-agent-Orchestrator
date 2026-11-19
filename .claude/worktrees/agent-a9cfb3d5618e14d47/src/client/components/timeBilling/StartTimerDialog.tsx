import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "~/client/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/client/components/ui/Dialog";
import { useTranslation } from "~/client/i18n";
import { DEVELOPER_ONLY_LINES, type ProjectTimeSummary } from "~/shared/types/timeBilling";
import { PROJECT_LINE_LABEL_KEYS, type LineTarget } from "./api";

// [SCOPE 005 / T025] BEGIN — StartTimerDialog: the project row's clock opens it to start a timer on a chosen line (Amendment C, FR-006)
// MODIFIED-BY: [SCOPE 005 / T027] — offers DBA, Management and Meetings after Brainstorming (Amendment D)
interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectTimeSummary | null;
  /** Starts the timer; the dialog closes once it resolves. */
  onStart: (target: LineTarget) => Promise<void>;
}

/** Brainstorming has no scope, so its option needs a key no specid can take. */
const BRAINSTORM_KEY = "brainstorm";

export function StartTimerDialog({ open, onOpenChange, project, onStart }: StartTimerDialogProps) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState(BRAINSTORM_KEY);
  const [starting, setStarting] = useState(false);

  // Developer lines only: Processes carries Resource time, so a timer never runs on it (FR-003).
  // A project with no scopes yet still offers the project lines.
  const targets = useMemo(() => {
    const list: Array<{ key: string; target: LineTarget }> = [];
    if (!project) return list;
    const base = { projectid: project.projectid, projectname: project.name };
    for (const s of project.scopes) {
      if (s.specid === null) continue;
      const label = `${s.specnumber ?? ""} ${s.title}`.trim();
      list.push({ key: s.specid, target: { ...base, line: "scope", specid: s.specid, scopelabel: label } });
    }
    list.push({ key: BRAINSTORM_KEY, target: { ...base, line: "brainstorm", specid: null, scopelabel: "" } });
    // Amendment D: Developer-only project lines. Their keys are line names, which no specid can equal.
    for (const line of DEVELOPER_ONLY_LINES) {
      list.push({ key: line, target: { ...base, line, specid: null, scopelabel: "" } });
    }
    return list;
  }, [project]);

  useEffect(() => {
    if (open) setChoice(targets[0]?.key ?? BRAINSTORM_KEY);
  }, [open, targets]);

  const selected = targets.find((x) => x.key === choice)?.target ?? null;

  const start = async () => {
    if (!selected) return;
    setStarting(true);
    try {
      await onStart(selected);
      onOpenChange(false);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("timeBilling.timer.startTitle")}</DialogTitle>
          {project && <DialogDescription>{project.name}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("timeBilling.timer.chooseLine")}</span>
            <select
              className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-background text-foreground px-3"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              {targets.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.target.line === "scope" ? x.target.scopelabel : t(PROJECT_LINE_LABEL_KEYS[x.target.line])}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">{t("timeBilling.timer.startHelp")}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("timeBilling.common.cancel")}
          </Button>
          <Button onClick={() => void start()} disabled={!selected || starting}>
            <Play className="w-4 h-4 mr-2" />
            {t("timeBilling.timer.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 005 / T025] END
