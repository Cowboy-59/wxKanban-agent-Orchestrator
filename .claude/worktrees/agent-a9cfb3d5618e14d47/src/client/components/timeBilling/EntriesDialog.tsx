import { useCallback, useEffect, useState } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { Button } from "~/client/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/client/components/ui/Dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/client/components/ui/Table";
import { useTranslation } from "~/client/i18n";
import type { ProjectTimeSummary } from "~/shared/types/timeBilling";
import { PROJECT_LINE_LABEL_KEYS, rangeQuery, tbFetch, type DateRange, type TimeEntryView } from "./api";

// [SCOPE 005 / T016] BEGIN — EntriesDialog: one project's entries with edit and delete; invoiced entries are locked (FR-005, FR-011)
interface EntriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectTimeSummary | null;
  range: DateRange;
  /** Bumped by the page after any change, so the list reloads. */
  version: number;
  onEdit: (entry: TimeEntryView) => void;
  onChanged: () => void;
}

export function EntriesDialog(props: EntriesDialogProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TimeEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectid = props.project?.projectid ?? null;

  const load = useCallback(async () => {
    if (!projectid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await tbFetch<{ entries: TimeEntryView[] }>(`/entries?projectid=${projectid}&${rangeQuery(props.range)}`);
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.entries.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [projectid, props.range, t]);

  useEffect(() => {
    if (props.open) void load();
  }, [props.open, props.version, load]);

  const remove = async (entry: TimeEntryView) => {
    if (!window.confirm(t("timeBilling.entries.confirmDelete"))) return;
    try {
      await tbFetch(`/entries/${entry.id}`, { method: "DELETE" });
      props.onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.entries.deleteFailed"));
    }
  };

  const lineName = (e: TimeEntryView): string => {
    // [SCOPE 005 / T027] every project line, including the Amendment D ones, through one label map
    if (e.line !== "scope") return t(PROJECT_LINE_LABEL_KEYS[e.line]);
    const scope = props.project?.scopes.find((s) => s.specid === e.specid);
    return scope?.specnumber ? `${scope.specnumber} ${scope.title}` : t("timeBilling.lines.deletedScope");
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("timeBilling.entries.title", { project: props.project?.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {props.range.from} – {props.range.to}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500">{t("timeBilling.common.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500">{t("timeBilling.entries.none")}</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("timeBilling.entry.date")}</TableHead>
                  <TableHead>{t("timeBilling.lines.line")}</TableHead>
                  <TableHead>{t("timeBilling.entries.who")}</TableHead>
                  <TableHead className="text-right">{t("timeBilling.entries.hours")}</TableHead>
                  <TableHead>{t("timeBilling.entry.notes")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{e.workdate}</TableCell>
                    <TableCell>
                      {lineName(e)}
                      <span className="ml-1 text-xs text-slate-500">
                        ({e.category === "developer" ? t("timeBilling.lines.developer") : t("timeBilling.lines.resource")})
                      </span>
                    </TableCell>
                    <TableCell>{e.category === "developer" ? e.username ?? "—" : e.model ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.hours}</TableCell>
                    <TableCell className="max-w-xs truncate" title={e.notes ?? ""}>
                      {e.notes ?? ""}
                    </TableCell>
                    <TableCell>
                      {e.invoiced ? (
                        <span className="flex items-center gap-1 text-xs text-slate-500" title={t("timeBilling.entries.invoicedHelp")}>
                          <Lock className="w-3.5 h-3.5" />
                          {t("timeBilling.entries.invoiced")}
                        </span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => props.onEdit(e)} aria-label={t("timeBilling.common.edit")}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void remove(e)} aria-label={t("timeBilling.common.delete")}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 005 / T016] END
