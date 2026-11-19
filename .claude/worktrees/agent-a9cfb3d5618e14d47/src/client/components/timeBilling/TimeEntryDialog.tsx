import { useEffect, useState } from "react";
import { Button } from "~/client/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/client/components/ui/Dialog";
import { Input } from "~/client/components/ui/Input";
import { Textarea } from "~/client/components/ui/Textarea";
import { useTranslation } from "~/client/i18n";
import type { TimeCategory } from "~/shared/types/timeBilling";
import { PROJECT_LINE_LABEL_KEYS, tbFetch, todayIso, type LineTarget, type TeamMember, type TimeEntryView } from "./api";
import { minutesToInput, parseDuration, roundUpPreview } from "./duration";

// [SCOPE 005 / T016] BEGIN — TimeEntryDialog: add or edit a manual entry (FR-005, FR-011)
/** Models offered in the picker; any other model can be typed. */
const COMMON_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"];

interface TimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Add mode: the line and category. Edit mode: pass `entry` instead. */
  target: LineTarget | null;
  category: TimeCategory;
  entry: TimeEntryView | null;
  team: TeamMember[];
  currentUserId: string;
  onSaved: () => void;
}

export function TimeEntryDialog(props: TimeEntryDialogProps) {
  const { t } = useTranslation();
  const editing = props.entry !== null;
  const category: TimeCategory = props.entry?.category ?? props.category;

  const [userid, setUserid] = useState("");
  const [model, setModel] = useState("");
  const [workdate, setWorkdate] = useState(todayIso());
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    const e = props.entry;
    setUserid(e?.userid ?? props.currentUserId);
    setModel(e?.model ?? "");
    setWorkdate(e?.workdate ?? todayIso());
    setDuration(e ? minutesToInput(e.minutes) : "");
    setNotes(e?.notes ?? "");
    setError(null);
  }, [props.open, props.entry, props.currentUserId]);

  const minutes = parseDuration(duration);
  const needsNote = minutes !== null && minutes < 0 && notes.trim() === "";
  const canSave =
    minutes !== null && !needsNote && workdate !== "" && (category === "developer" ? userid !== "" : model.trim() !== "");

  const save = async () => {
    if (minutes === null) return;
    setSaving(true);
    setError(null);
    try {
      if (props.entry) {
        await tbFetch(`/entries/${props.entry.id}`, {
          method: "PATCH",
          body: {
            workdate,
            minutes,
            notes: notes.trim() === "" ? null : notes,
            ...(category === "developer" ? { userid } : { model: model.trim() }),
          },
        });
      } else if (props.target) {
        await tbFetch("/entries", {
          method: "POST",
          body: {
            projectid: props.target.projectid,
            line: props.target.line,
            specid: props.target.specid,
            category,
            userid: category === "developer" ? userid : null,
            model: category === "resource" ? model.trim() : null,
            workdate,
            minutes,
            notes: notes.trim() === "" ? null : notes,
          },
        });
      }
      props.onSaved();
      props.onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("timeBilling.entry.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // [SCOPE 005 / T027] every project line, including the Amendment D ones, through one label map
  const lineLabel = props.target
    ? props.target.line === "scope"
      ? props.target.scopelabel
      : t(PROJECT_LINE_LABEL_KEYS[props.target.line])
    : "";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t("timeBilling.entry.editTitle")
              : category === "developer"
                ? t("timeBilling.entry.addDeveloper")
                : t("timeBilling.entry.addResource")}
          </DialogTitle>
          {props.target && (
            <DialogDescription>
              {props.target.projectname} · {lineLabel}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {category === "developer" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.entry.person")}</span>
              <select
                className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-background text-foreground px-3"
                value={userid}
                onChange={(e) => setUserid(e.target.value)}
              >
                {props.team.map((m) => (
                  <option key={m.userid} value={m.userid}>
                    {m.fullname ?? m.email}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.entry.model")}</span>
              <Input list="tb-models" value={model} onChange={(e) => setModel(e.target.value)} maxLength={100} />
              <datalist id="tb-models">
                {COMMON_MODELS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.entry.date")}</span>
              <Input type="date" value={workdate} onChange={(e) => setWorkdate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("timeBilling.entry.time")}</span>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="1:38"
                aria-invalid={duration !== "" && minutes === null}
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {minutes === null
              ? t("timeBilling.entry.timeHelp")
              : t("timeBilling.entry.savedAs", { hours: roundUpPreview(minutes) })}
          </p>

          <label className="flex flex-col gap-1 text-sm">
            <span>{t("timeBilling.entry.notes")}</span>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} />
          </label>
          {needsNote && <p className="text-sm text-amber-700">{t("timeBilling.entry.correctionNeedsNote")}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("timeBilling.common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? t("timeBilling.common.saving") : t("timeBilling.common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// [SCOPE 005 / T016] END
