import { Play, Plus } from "lucide-react";
import { Button } from "~/client/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/client/components/ui/Table";
import { useTranslation } from "~/client/i18n";
import { DEVELOPER_ONLY_LINES, type ProjectTimeSummary, type TimeCategory } from "~/shared/types/timeBilling";
import { PROJECT_LINE_LABEL_KEYS, type LineTarget } from "./api";

// [SCOPE 005 / T015] BEGIN — ProjectTimeLines: per-scope Developer/Resource rows and the three project lines (FR-003)
// MODIFIED-BY: [SCOPE 005 / T027] — DBA, Management and Meetings Developer-only rows (Amendment D)
interface ProjectTimeLinesProps {
  project: ProjectTimeSummary;
  timerRunning: boolean;
  onAddEntry: (target: LineTarget, category: TimeCategory) => void;
  onStartTimer: (target: LineTarget) => void;
}

/** Hours, with an em dash for none, so a column of zeros stays readable. */
function hours(value: string, minutes: number): string {
  return minutes === 0 ? "—" : value;
}

export function ProjectTimeLines({ project, timerRunning, onAddEntry, onStartTimer }: ProjectTimeLinesProps) {
  const { t } = useTranslation();
  const base = { projectid: project.projectid, projectname: project.name };

  const actions = (target: LineTarget, developer: boolean, resource: boolean) => (
    <div className="flex justify-end gap-1">
      {developer && (
        <Button size="sm" variant="ghost" onClick={() => onAddEntry(target, "developer")} title={t("timeBilling.lines.addDeveloper")}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("timeBilling.lines.developer")}
        </Button>
      )}
      {resource && (
        <Button size="sm" variant="ghost" onClick={() => onAddEntry(target, "resource")} title={t("timeBilling.lines.addResource")}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("timeBilling.lines.resource")}
        </Button>
      )}
      {developer && (
        <Button
          size="sm"
          variant="ghost"
          disabled={timerRunning}
          onClick={() => onStartTimer(target)}
          title={timerRunning ? t("timeBilling.timer.alreadyRunning") : t("timeBilling.timer.start")}
          aria-label={t("timeBilling.timer.start")}
        >
          <Play className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("timeBilling.lines.line")}</TableHead>
          <TableHead className="text-right">{t("timeBilling.lines.developerHours")}</TableHead>
          <TableHead className="text-right">{t("timeBilling.lines.resourceHours")}</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">{t("timeBilling.lines.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {project.scopes.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-sm text-slate-500">
              {t("timeBilling.lines.noScopes")}
            </TableCell>
          </TableRow>
        )}
        {project.scopes.map((s) => {
          const label = s.specnumber ? `${s.specnumber} ${s.title}` : t("timeBilling.lines.deletedScope");
          const target: LineTarget = { ...base, line: "scope", specid: s.specid, scopelabel: label };
          return (
            <TableRow key={s.specid ?? "deleted"}>
              <TableCell>
                {label}
                {s.archived && <span className="ml-2 text-xs text-slate-500">({t("timeBilling.lines.archived")})</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{hours(s.developerHours, s.developerMinutes)}</TableCell>
              <TableCell className="text-right tabular-nums">{hours(s.resourceHours, s.resourceMinutes)}</TableCell>
              <TableCell>{s.specid ? actions(target, true, true) : null}</TableCell>
            </TableRow>
          );
        })}
        <TableRow>
          <TableCell>{t("timeBilling.lines.brainstorming")}</TableCell>
          <TableCell className="text-right tabular-nums">
            {hours(project.lines.brainstormDeveloperHours, project.lines.brainstormDeveloperMinutes)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {hours(project.lines.brainstormResourceHours, project.lines.brainstormResourceMinutes)}
          </TableCell>
          <TableCell>{actions({ ...base, line: "brainstorm", specid: null, scopelabel: "" }, true, true)}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>{t("timeBilling.lines.processes")}</TableCell>
          <TableCell className="text-right text-slate-400">—</TableCell>
          <TableCell className="text-right tabular-nums">
            {hours(project.lines.processResourceHours, project.lines.processResourceMinutes)}
          </TableCell>
          <TableCell>{actions({ ...base, line: "process", specid: null, scopelabel: "" }, false, true)}</TableCell>
        </TableRow>
        {DEVELOPER_ONLY_LINES.map((line) => {
          const d = project.lines.developerOnly[line];
          return (
            <TableRow key={line}>
              <TableCell>{t(PROJECT_LINE_LABEL_KEYS[line])}</TableCell>
              <TableCell className="text-right tabular-nums">{hours(d.hours, d.minutes)}</TableCell>
              <TableCell className="text-right text-slate-400">—</TableCell>
              <TableCell>{actions({ ...base, line, specid: null, scopelabel: "" }, true, false)}</TableCell>
            </TableRow>
          );
        })}
        <TableRow className="font-semibold">
          <TableCell>{t("timeBilling.lines.projectTotal")}</TableCell>
          <TableCell colSpan={2} className="text-right tabular-nums">
            {project.totalHours}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}
// [SCOPE 005 / T015] END
