// SCOPE-107 / Pass A1 — floating on-element toolbar (theme colors, size, bold, align).
// Renders over the selected node on the canvas; writes props through onProp. Colors are
// drawn from the active theme palette (semantic classes), never free hex.
import {
  NODE_REGISTRY,
  TEXT_COLOR_ROLES,
  BG_COLOR_ROLES,
  FONT_SIZES,
  type BlockNode,
  type PropValue,
} from "../../../shared/block-model";
import { cn } from "../../lib/utils";

// Literal preview-background classes (Tailwind scans these strings; no dynamic `bg-${x}`).
const SWATCH_BG: Record<string, string> = {
  default: "bg-background",
  card: "bg-card",
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  muted: "bg-muted",
  destructive: "bg-destructive",
  "muted-foreground": "bg-muted-foreground",
};

const TEXT_NODES = new Set<string>(["heading", "subheading", "paragraph"]);
const TEXT_COLORABLE = new Set<string>(["heading", "subheading", "paragraph", "button", "stat"]);
const BG_COLORABLE = new Set<string>(["heading", "subheading", "paragraph", "button", "stat", "panel", "row", "cardgrid"]);

// [SCOPE 107 / T006] BEGIN — BlockToolbar (floating on-element editor controls)
export default function BlockToolbar({
  node,
  onProp,
}: {
  node: BlockNode;
  onProp: (key: string, value: PropValue) => void;
}) {
  const p = node.props;
  const segFields = NODE_REGISTRY[node.type].fields.filter((f) => f.type === "segment");

  function swatch(role: string, kind: "text" | "bg") {
    const key = kind === "text" ? "textColor" : "bgColor";
    const active = String(p[key] ?? "default") === role;
    // Preview each role with its own semantic background color (literal-mapped for Tailwind).
    const previewKey = role === "muted" && kind === "text" ? "muted-foreground" : role;
    const bgClass = SWATCH_BG[previewKey] ?? "bg-background";
    return (
      <button
        key={`${kind}-${role}`}
        type="button"
        title={`${kind === "text" ? "Text" : "Background"}: ${role}`}
        onClick={(e) => { e.stopPropagation(); onProp(key, role); }}
        className={cn("h-4 w-4 rounded-sm border", bgClass, active ? "ring-2 ring-ring" : "border-border")}
      />
    );
  }

  return (
    <div
      className="absolute -top-9 left-0 z-30 flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1 text-popover-foreground shadow-md"
      onClick={(e) => e.stopPropagation()}
    >
      {TEXT_NODES.has(node.type) && (
        <>
          <select
            value={String(p.fontSize ?? "")}
            onChange={(e) => onProp("fontSize", e.target.value)}
            className="rounded border border-input bg-background px-1 py-0.5 text-xs"
            title="Font size"
          >
            <option value="">Size</option>
            {FONT_SIZES.map((sz) => <option key={sz} value={sz}>{sz.toUpperCase()}</option>)}
          </select>
          <button
            type="button"
            title="Bold"
            onClick={(e) => { e.stopPropagation(); onProp("bold", p.bold !== true); }}
            className={cn(
              "rounded border px-1.5 py-0.5 text-xs font-bold",
              p.bold === true ? "border-primary bg-primary text-primary-foreground" : "border-input",
            )}
          >
            B
          </button>
        </>
      )}

      {TEXT_COLORABLE.has(node.type) && (
        <div className="flex items-center gap-0.5" title="Text color">
          {TEXT_COLOR_ROLES.map((r) => swatch(r, "text"))}
        </div>
      )}

      {BG_COLORABLE.has(node.type) && (
        <div className="flex items-center gap-0.5" title="Background color">
          {BG_COLOR_ROLES.map((r) => swatch(r, "bg"))}
        </div>
      )}

      {segFields.map((f) => (
        <div key={f.key} className="flex items-center gap-0.5" title={f.label}>
          {(f.options ?? []).map((opt) => {
            const active = String(p[f.key] ?? "") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); onProp(f.key, opt.value); }}
                className={cn(
                  "rounded border px-1 py-0.5 text-[10px]",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
// [SCOPE 107 / T006] END
