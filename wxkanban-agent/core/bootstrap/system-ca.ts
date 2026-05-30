// Shared bootstrap — trust the OS certificate store in addition to Node's
// bundled Mozilla CA list.
//
// Behind a corporate TLS-inspection proxy (Cisco Secure Access, Zscaler, etc.)
// the hub's certificate chains to a root CA that lives in the OS trust store
// but NOT in Node's bundled list, so every `fetch`/`https` call fails the
// handshake with UNABLE_TO_GET_ISSUER_CERT_LOCALLY — which the kit otherwise
// misreports as "MCP unreachable". Merging the system store into Node's
// defaults in-process is the equivalent of the `--use-system-ca` flag, and
// needs no NODE_OPTIONS — which matters because the VS Code folderOpen task and
// the CLIs launch plain `node`/`tsx` with no flag set.
//
// Feature-detected (Node >= 24 exposes the APIs); silently no-ops on older Node
// and never throws. Idempotent — safe to call from every entry point.
//
// Reported in Bug-reports/BUG-REPORT-kit-dbpush-tls-and-packaging.md (Issue 1).
import tls from 'node:tls';

// tls.getCACertificates / setDefaultCACertificates landed in Node 22.15 / 24.
// Narrow via a local interface so this compiles regardless of the installed
// @types/node version (no `any`, no @ts-ignore).
interface SystemCaTls {
  getCACertificates?: (
    type?: 'default' | 'system' | 'bundled' | 'extra',
  ) => string[];
  setDefaultCACertificates?: (certs: ReadonlyArray<string>) => void;
}

let applied = false;

export function trustSystemCertificates(): void {
  if (applied) return;
  applied = true;
  try {
    const api = tls as unknown as SystemCaTls;
    if (
      typeof api.getCACertificates !== 'function' ||
      typeof api.setDefaultCACertificates !== 'function'
    ) {
      return; // Node < 24 — nothing to do; default trust applies.
    }
    const bundled = api.getCACertificates('bundled');
    const system = api.getCACertificates('system');
    if (Array.isArray(system) && system.length > 0) {
      api.setDefaultCACertificates([...bundled, ...system]);
    }
  } catch {
    // Never block on CA wiring — fall back to default trust silently.
  }
}
