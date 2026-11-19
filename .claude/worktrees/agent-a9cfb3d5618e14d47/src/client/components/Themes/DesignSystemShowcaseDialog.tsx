// SCOPE-114 / SPEC-116 T006 — full-system preview, in a hard sandbox.
//
// The showcase page is markup this application did not author. It came from the analysis pack,
// it is stored verbatim, and it is rendered here. That makes the sandbox a security control
// rather than a nicety:
//
//   sandbox="allow-scripts"    → scripts run, but in a UNIQUE OPAQUE ORIGIN. The frame cannot
//                               read our cookies, our localStorage, or the parent DOM.
//   referrerpolicy=no-referrer → the one legitimate outbound request (the webfont stylesheet)
//                               carries no information about who is browsing the catalog.
//
// WHY `allow-scripts` AND NOT `sandbox=""`. These pages BUILD THEMSELVES with JavaScript —
// `document.getElementById('colors').innerHTML = …` and the same for the type scale, the spacing
// steps, the radius steps and the elevation samples. Five containers per page, and they are the
// five that matter. A fully script-free sandbox renders the chrome and leaves every one of those
// sections blank, which is what the first version of this dialog did.
//
// THE RULE THAT MAKES THIS SAFE: never combine `allow-scripts` with `allow-same-origin`. Together
// they let the framed document reach into its own sandbox attribute and remove it, which is the
// whole sandbox defeated in one line. Scripts alone, with an opaque origin, are isolated — they
// can paint inside the frame and reach nothing outside it.
//
// The document is loaded by URL rather than injected via srcDoc. srcDoc inlines the HTML into
// the parent document, which means 25 KB of third-party markup crosses into our render tree on
// every open; a src fetch keeps it entirely inside the frame and lets the browser cache it.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/Dialog";
import type { DesignSystemSummary } from "./DesignSystemCard";

interface Props {
  system: DesignSystemSummary | null;
  onClose: () => void;
}

// [SCOPE 116 / T004] BEGIN — DesignSystemCard component
export default function DesignSystemShowcaseDialog({ system, onClose }: Props) {
// [SCOPE 116 / T004] END
  const [loading, setLoading] = useState(true);

  // Reset the spinner whenever a different system is opened, otherwise the second preview
  // renders instantly-but-blank because `loading` is still false from the first.
  useEffect(() => {
    setLoading(true);
  }, [system?.slug]);

  if (!system) return null;

  // The route is authenticated and an iframe cannot send a bearer header — but it does not need
  // to. `getTokenFromRequest` falls back to the httpOnly `token` cookie that login already sets,
  // and this is a same-origin request, so the browser attaches it automatically.
  //
  // Worth stating because the tempting alternative is `?token=<jwt>`, and that is a real leak:
  // URLs land in access logs, proxy logs and browser history, so it would scatter live session
  // tokens across all three to solve a problem that does not exist.
  const src = `/api/design-systems/${encodeURIComponent(system.slug)}/showcase`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{system.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            The full analysed system — palette, type scale, buttons, cards, forms, spacing,
            elevation and sample screens. Rendered in a sandboxed frame.
          </p>
          {/* These showcases are laid out for a ~1200px column with wide data tables and
              pricing rows, so the modal always crops them. The full-page view is the same
              sandboxed document with the whole viewport to work in. */}
          <a
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 text-xs font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            Open full page ↗
          </a>
        </div>
        <div className="relative h-[70vh] overflow-hidden rounded-md border border-border bg-background">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Loading preview…
            </div>
          )}
          <iframe
            key={system.slug}
            src={src}
            title={`${system.name} — design system showcase`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-full w-full"
            onLoad={() => setLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
