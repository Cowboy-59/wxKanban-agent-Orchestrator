// SCOPE-114 / SPEC-116 T007 — name your copy of a curated system.
//
// Picking COPIES, it does not link. The new profile is yours: editing it later never touches the
// catalog, and a future re-seed of the catalog never reaches back into it. That is the same
// snapshot rule Theme Studio Phase 1 established for profiles, applied one level up.
//
// The name is prefilled from the catalog entry but editable, because the profile is going into a
// list the user owns and their naming will not match ours ("Marketing site look" beats "Electric
// Indigo on Near-Black" once it is one of fifteen rows).

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import type { DesignSystemSummary } from "./DesignSystemCard";

interface Props {
  system: DesignSystemSummary | null;
  onClose: () => void;
  /** Resolves to the created profile id, or throws with a message to display. */
  onConfirm: (system: DesignSystemSummary, name: string) => Promise<void>;
}

// [SCOPE 116 / T004] BEGIN — DesignSystemCard component
export default function UseDesignSystemDialog({ system, onClose, onConfirm }: Props) {
// [SCOPE 116 / T004] END
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(system?.name ?? "");
    setError(null);
    setSaving(false);
  }, [system?.slug, system?.name]);

  if (!system) return null;

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the profile a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(system, trimmed);
    } catch (err) {
      // Surfaced rather than swallowed: the most likely failure is the UNIQUE (companyid, name)
      // constraint, and "a profile with that name already exists" is something the user can fix
      // in place. A generic toast would send them hunting.
      setError(err instanceof Error ? err.message : "Could not create the profile.");
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use “{system.name}”</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This copies the look into your company&apos;s theme profiles. Your copy is independent —
          editing it later won&apos;t change the catalog, and you can apply it to any project from
          that project&apos;s Theme tab.
        </p>
        {system.synthesizedmode !== "none" && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Its <strong>{system.synthesizedmode}</strong> mode is approximated — derived from the{" "}
            {system.nativemode} mode this system actually defines. It passes AA contrast, but
            you may want to tune it after picking.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ds-profile-name">Profile name</Label>
          <Input
            id="ds-profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            maxLength={120}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
