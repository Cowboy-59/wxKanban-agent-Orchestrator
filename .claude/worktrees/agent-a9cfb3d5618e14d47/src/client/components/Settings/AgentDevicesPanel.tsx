/**
 * K.A.I.N. devices — SPEC-152 (SCOPE-132 Amendment F) T009, FR-071.
 *
 * K.A.I.N. signs in with the person's own wxKanban email and password, once per device. These
 * panels list the devices that are signed in and sign one out. `MyAgentDevicesPanel` is the
 * person's own list (Profile); `CompanyAgentDevicesPanel` is every member's, for a company ADMIN.
 * Signing out takes effect on that device's next call.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Smartphone, LogOut } from "lucide-react";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/Dialog";

// [SCOPE 152 / T009] BEGIN — K.A.I.N. device panels (FR-071)
// MODIFIED-BY: [SCOPE 152 / T016] — load and revoke errors kept apart and announced; named Revoke buttons; owner in the confirm; touch target
export interface AgentDevice {
  deviceId: string;
  deviceName: string;
  userId: string;
  userName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function when(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

interface DevicesPanelProps {
  title: string;
  description: string;
  listPath: string;
  showOwner: boolean;
  emptyText: string;
}

function DevicesPanel({ title, description, listPath, showOwner, emptyText }: DevicesPanelProps) {
  const [devices, setDevices] = useState<AgentDevice[]>([]);
  const [loading, setLoading] = useState(true);
  // Kept apart: a failed list must never read as "no devices", and a failed revoke shows in its dialog.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AgentDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(listPath, { credentials: "include" });
      if (!res.ok) throw new Error("Could not read K.A.I.N. devices. Reload the page to try again.");
      const data = (await res.json()) as { devices: AgentDevice[] };
      setDevices(data.devices);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [listPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeConfirm = (): void => {
    setConfirm(null);
    setRevokeError(null);
  };

  const revoke = async (device: AgentDevice): Promise<void> => {
    setBusy(true);
    setRevokeError(null);
    try {
      const res = await fetch(`/api/agent/devices/${encodeURIComponent(device.deviceId)}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not sign the device out");
      }
      closeConfirm();
      // Re-read: the server decides what is still signed in.
      await load();
    } catch (err) {
      setRevokeError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ownerOf = (d: AgentDevice): string => d.userName ?? "an unnamed member";

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-indigo-400" />
          {title}
        </CardTitle>
        <CardDescription className="text-slate-400">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError && (
          <div role="alert" className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">
            {loadError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : devices.length === 0 ? (
          !loadError && <p className="text-slate-400 text-sm">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li
                key={d.deviceId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700"
              >
                <div className="min-w-0">
                  <span className="block text-white text-sm font-medium truncate">{d.deviceName}</span>
                  {showOwner && <span className="block text-slate-300 text-xs truncate">{d.userName ?? "—"}</span>}
                  <span className="block text-slate-400 text-xs">
                    Signed in {when(d.createdAt)} · Last used {when(d.lastUsedAt)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 min-h-[44px] sm:min-h-0 border-slate-600 text-slate-200"
                  aria-label={showOwner ? `Revoke ${d.deviceName} (${ownerOf(d)})` : `Revoke ${d.deviceName}`}
                  onClick={() => setConfirm(d)}
                >
                  <LogOut className="h-4 w-4 mr-1" aria-hidden="true" /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(open: boolean) => !open && closeConfirm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign this device out?</DialogTitle>
            <DialogDescription>
              K.A.I.N. on &quot;{confirm?.deviceName}&quot;
              {showOwner && confirm ? `, signed in by ${ownerOf(confirm)},` : ""} stops on its next call and has to
              sign in again. Other devices keep working.
            </DialogDescription>
          </DialogHeader>
          {revokeError && (
            <div role="alert" className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">
              {revokeError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeConfirm} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirm && void revoke(confirm)} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** The signed-in person's own devices (Profile). */
export function MyAgentDevicesPanel() {
  return (
    <DevicesPanel
      title="My K.A.I.N. devices"
      description="Phones and computers where K.A.I.N. is signed in as you. Revoke one you no longer use or have lost."
      listPath="/api/agent/devices"
      showOwner={false}
      emptyText="K.A.I.N. is not signed in on any device."
    />
  );
}

/** Every member's devices, for a company ADMIN (Company). */
export function CompanyAgentDevicesPanel() {
  return (
    <DevicesPanel
      title="K.A.I.N. devices"
      description="Every device where a member of your company has signed K.A.I.N. in. You can sign any of them out."
      listPath="/api/company/agent-devices"
      showOwner={true}
      emptyText="No one in your company has signed K.A.I.N. in yet."
    />
  );
}
// [SCOPE 152 / T009] END
