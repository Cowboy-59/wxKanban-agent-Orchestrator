// SCOPE-107 / T001 — Block model + node-type registry + code emitter.
//
// A Block is a reusable branded section: a tree of BlockNodes laid out by auto-reflow
// (stack + grid), styled entirely through the active theme's shadcn semantic classes
// (never hard-coded colors). The Node-Type Registry is the single source of truth for
// each node type's default props, editable fields, and generated-code emission — so the
// canvas, the live preview, and the executed code never drift. (The React render of each
// node lives in BlockRenderer.tsx, keyed by the same types.)

import { twMerge } from "tailwind-merge";

export type BlockNodeType =
  | "panel"
  | "columns"
  | "row"
  | "heading"
  | "subheading"
  | "paragraph"
  | "button"
  | "image"
  | "spacer"
  | "divider"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "submit"
  | "cardgrid"
  | "stat"
  | "embed";

export type PropValue = string | number | boolean;

export interface BlockNode {
  id: string;
  type: BlockNodeType;
  props: Record<string, PropValue>;
  children?: BlockNode[];
}

export interface Block {
  id: string;
  name: string;
  nodes: BlockNode[];
}

/** A named block as carried on a project theme / template (ordered list). */
export interface NamedBlock {
  name: string;
  nodes: BlockNode[];
}

export type FieldType = "text" | "textarea" | "number" | "image" | "segment" | "options";

export interface SegmentOption {
  value: string;
  label: string;
}

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  /** Choices for a "segment" (segmented-control) field. */
  options?: SegmentOption[];
}

export interface NodeTypeDef {
  type: BlockNodeType;
  label: string;
  category: "layout" | "content" | "form" | "data";
  /** Container nodes hold children (droppable). */
  container: boolean;
  defaultProps: Record<string, PropValue>;
  /** Editable properties surfaced in the property panel. */
  fields: NodeField[];
}

// SCOPE-107 alignment option sets (shared by the property-panel fields).
const ALIGN_LCR: SegmentOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];
const ALIGN_LCR_SPREAD: SegmentOption[] = [...ALIGN_LCR, { value: "spread", label: "Spread" }];
const VALIGN_TMB: SegmentOption[] = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

// ── Node-Type Registry ───────────────────────────────────────────────────────
export const NODE_REGISTRY: Record<BlockNodeType, NodeTypeDef> = {
  panel: {
    type: "panel",
    label: "Section panel",
    category: "layout",
    container: true,
    defaultProps: { padded: true },
    fields: [{ key: "align", label: "Align items", type: "segment", options: ALIGN_LCR }],
  },
  columns: {
    type: "columns",
    label: "2 columns",
    category: "layout",
    container: true,
    defaultProps: {},
    fields: [],
  },
  row: {
    type: "row",
    label: "Row (side by side)",
    category: "layout",
    container: true,
    defaultProps: {},
    fields: [
      { key: "align", label: "Horizontal", type: "segment", options: ALIGN_LCR_SPREAD },
      { key: "valign", label: "Vertical", type: "segment", options: VALIGN_TMB },
    ],
  },
  heading: {
    type: "heading",
    label: "Heading",
    category: "content",
    container: false,
    defaultProps: { text: "Your headline here" },
    fields: [
      { key: "text", label: "Text", type: "text" },
      { key: "align", label: "Align", type: "segment", options: ALIGN_LCR },
    ],
  },
  subheading: {
    type: "subheading",
    label: "Subheading",
    category: "content",
    container: false,
    defaultProps: { text: "A supporting subheading" },
    fields: [
      { key: "text", label: "Text", type: "text" },
      { key: "align", label: "Align", type: "segment", options: ALIGN_LCR },
    ],
  },
  paragraph: {
    type: "paragraph",
    label: "Paragraph",
    category: "content",
    container: false,
    defaultProps: { text: "Body copy goes here. Edit me in the property panel." },
    fields: [
      { key: "text", label: "Text", type: "textarea" },
      { key: "align", label: "Align", type: "segment", options: ALIGN_LCR },
    ],
  },
  button: {
    type: "button",
    label: "Button / CTA",
    category: "content",
    container: false,
    defaultProps: { label: "Get started", href: "#" },
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "href", label: "Link (href)", type: "text" },
      { key: "align", label: "Align", type: "segment", options: ALIGN_LCR },
    ],
  },
  image: {
    type: "image",
    label: "Image",
    category: "content",
    container: false,
    defaultProps: { src: "", alt: "", width: 0 },
    fields: [
      { key: "src", label: "Image", type: "image" },
      { key: "alt", label: "Alt text", type: "text" },
      // Width is set by dragging the image's resize handle on the canvas (SCOPE-107 Pass B),
      // not a px field — so it hugs the picture instead of filling the column.
      { key: "align", label: "Align", type: "segment", options: ALIGN_LCR },
    ],
  },
  spacer: {
    type: "spacer",
    label: "Spacer",
    category: "layout",
    container: false,
    defaultProps: { size: 24 },
    fields: [{ key: "size", label: "Height (px)", type: "number" }],
  },
  divider: {
    type: "divider",
    label: "Divider",
    category: "layout",
    container: false,
    defaultProps: {},
    fields: [],
  },
  input: {
    type: "input",
    label: "Text input",
    category: "form",
    container: false,
    defaultProps: { label: "Email", placeholder: "you@example.com" },
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
  },
  textarea: {
    type: "textarea",
    label: "Text area",
    category: "form",
    container: false,
    defaultProps: { label: "Message", placeholder: "Type your message…" },
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "placeholder", label: "Placeholder", type: "text" },
    ],
  },
  select: {
    type: "select",
    label: "Dropdown",
    category: "form",
    container: false,
    // Structured options live in `optionsJson` (JSON array of {value,label}); the legacy
    // comma-separated `options` string is still read for back-compat (SCOPE-108 / T001).
    defaultProps: {
      label: "Choose",
      optionsJson: '[{"value":"a","label":"Option A"},{"value":"b","label":"Option B"},{"value":"c","label":"Option C"}]',
      placeholder: "",
      defaultValue: "",
    },
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "optionsJson", label: "Options", type: "options" },
      { key: "placeholder", label: "Placeholder", type: "text" },
      { key: "defaultValue", label: "Default value", type: "text" },
    ],
  },
  checkbox: {
    type: "checkbox",
    label: "Checkbox",
    category: "form",
    container: false,
    defaultProps: { label: "I agree to the terms" },
    fields: [{ key: "label", label: "Label", type: "text" }],
  },
  submit: {
    type: "submit",
    label: "Submit button",
    category: "form",
    container: false,
    defaultProps: { label: "Submit" },
    fields: [{ key: "label", label: "Label", type: "text" }],
  },
  cardgrid: {
    type: "cardgrid",
    label: "Card grid",
    category: "data",
    container: true,
    defaultProps: { columns: 3 },
    fields: [{ key: "columns", label: "Columns", type: "number" }],
  },
  stat: {
    type: "stat",
    label: "Stat tile",
    category: "data",
    container: false,
    defaultProps: { value: "1,240", label: "Active users" },
    fields: [
      { key: "value", label: "Value", type: "text" },
      { key: "label", label: "Label", type: "text" },
    ],
  },
  embed: {
    type: "embed",
    label: "Embed",
    category: "data",
    container: false,
    defaultProps: { url: "" },
    fields: [{ key: "url", label: "Embed URL", type: "text" }],
  },
};

export const PALETTE: BlockNodeType[] = Object.keys(NODE_REGISTRY) as BlockNodeType[];

// ── Tree operations (immutable) ──────────────────────────────────────────────

// [SCOPE 107 / T001] BEGIN — createNode (registry defaults → a fresh node)
export function createNode(type: BlockNodeType): BlockNode {
  const def = NODE_REGISTRY[type];
  const node: BlockNode = {
    id: (globalThis.crypto?.randomUUID?.() ?? `n-${Date.now()}-${Math.round(Math.random() * 1e6)}`),
    type,
    props: { ...def.defaultProps },
  };
  if (def.container) node.children = [];
  return node;
}
// [SCOPE 107 / T001] END

/** Root container id — inserting here appends to the top-level canvas stack. */
export const ROOT_ID = "__root__";

// [SCOPE 107 / T001] BEGIN — insertNode (append newNode into container `parentId`)
export function insertNode(nodes: BlockNode[], parentId: string, newNode: BlockNode): BlockNode[] {
  if (parentId === ROOT_ID) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.id === parentId && n.children) {
      return { ...n, children: [...n.children, newNode] };
    }
    if (n.children) return { ...n, children: insertNode(n.children, parentId, newNode) };
    return n;
  });
}
// [SCOPE 107 / T001] END

// [SCOPE 107 / T001] BEGIN — updateNode (patch a node's props by id)
export function updateNodeProps(nodes: BlockNode[], id: string, patch: Record<string, PropValue>): BlockNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, props: { ...n.props, ...patch } };
    if (n.children) return { ...n, children: updateNodeProps(n.children, id, patch) };
    return n;
  });
}
// [SCOPE 107 / T001] END

// [SCOPE 107 / T001] BEGIN — removeNode (delete a node subtree by id)
export function removeNode(nodes: BlockNode[], id: string): BlockNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: removeNode(n.children, id) } : n));
}
// [SCOPE 107 / T001] END

// [SCOPE 107 / T001] BEGIN — duplicateNode (clone a subtree with fresh ids, inserted after)
function cloneWithNewIds(node: BlockNode): BlockNode {
  const copy = createNode(node.type);
  copy.props = { ...node.props };
  if (node.children) copy.children = node.children.map(cloneWithNewIds);
  return copy;
}
export function duplicateNode(nodes: BlockNode[], id: string): BlockNode[] {
  const out: BlockNode[] = [];
  for (const n of nodes) {
    const next = n.children ? { ...n, children: duplicateNode(n.children, id) } : n;
    out.push(next);
    if (n.id === id) out.push(cloneWithNewIds(n));
  }
  return out;
}
// [SCOPE 107 / T001] END

// [SCOPE 107 / T001] BEGIN — moveNode (shift a top-level or sibling node up/down)
export function moveNode(nodes: BlockNode[], id: string, dir: -1 | 1): BlockNode[] {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx !== -1) {
    const target = idx + dir;
    if (target < 0 || target >= nodes.length) return nodes;
    const copy = [...nodes];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    return copy;
  }
  return nodes.map((n) => (n.children ? { ...n, children: moveNode(n.children, id, dir) } : n));
}
// [SCOPE 107 / T001] END

// [SCOPE 107 / T004] BEGIN — alignment class helpers (single source of truth for
// the renderer AND the code emitter, so canvas and generated code cannot drift)
const H_ITEMS: Record<string, string> = { left: "items-start", center: "items-center", right: "items-end" };
const H_JUSTIFY: Record<string, string> = { left: "justify-start", center: "justify-center", right: "justify-end", spread: "justify-between" };
const H_SELF: Record<string, string> = { left: "self-start", center: "self-center", right: "self-end" };
const H_TEXT: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
const V_ITEMS: Record<string, string> = { top: "items-start", middle: "items-center", bottom: "items-end" };
const TEXT_NODES = new Set<BlockNodeType>(["heading", "subheading", "paragraph"]);

/** A container's own flex layout + alignment classes. */
export function stackClasses(node: BlockNode): string {
  const p = node.props;
  if (node.type === "row") {
    const j = H_JUSTIFY[String(p.align ?? "")] ?? "justify-start";
    const v = V_ITEMS[String(p.valign ?? "")] ?? "items-center";
    return `flex flex-wrap gap-4 ${j} ${v}`;
  }
  const items = H_ITEMS[String(p.align ?? "")];
  return items ? `flex flex-col gap-4 ${items}` : "flex flex-col gap-4";
}

/** A node's alignment classes as a flex child. Empty when align is unset. */
export function selfClasses(node: BlockNode): string {
  const a = String(node.props.align ?? "");
  const self = H_SELF[a];
  if (!self) return "";
  return TEXT_NODES.has(node.type) ? `${self} ${H_TEXT[a]}` : self;
}
// [SCOPE 107 / T004] END

// [SCOPE 107 / T005] BEGIN — visual style helpers (color/size/weight → classes)
const TEXT_COLOR: Record<string, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
};
const BG_COLOR: Record<string, string> = {
  card: "bg-card",
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  muted: "bg-muted",
  destructive: "bg-destructive",
};
// Literal class strings so Tailwind's source scan generates them (no dynamic `text-${x}`).
const FONT_SIZE_CLASS: Record<string, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
  "5xl": "text-5xl",
  "6xl": "text-6xl",
};

/** Per-node color/size/weight classes. Empty when nothing is set. */
export function styleClasses(node: BlockNode): string {
  const p = node.props;
  const out: string[] = [];
  const tc = TEXT_COLOR[String(p.textColor ?? "")];
  if (tc) out.push(tc);
  const bc = BG_COLOR[String(p.bgColor ?? "")];
  if (bc) out.push(bc);
  const fsClass = FONT_SIZE_CLASS[String(p.fontSize ?? "")];
  if (fsClass) out.push(fsClass);
  if (p.bold === true) out.push("font-bold");
  return out.join(" ");
}

/** Roles offered by the toolbar swatches / size dropdown. */
export const TEXT_COLOR_ROLES = ["default", "primary", "secondary", "accent", "muted", "destructive"] as const;
export const BG_COLOR_ROLES = ["default", "card", "primary", "secondary", "accent", "muted", "destructive"] as const;
export const FONT_SIZES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"] as const;

/** New image width from a drag: start width + pointer delta, floored at `min` px. */
export function clampImageWidth(startWidth: number, deltaX: number, min = 24): number {
  return Math.max(min, Math.round(startWidth + deltaX));
}
// [SCOPE 107 / T005] END

// [SCOPE 108 / T001] BEGIN — structured dropdown options (parse + serialize, back-compat)
export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Resolve a select/dropdown node's options as structured {value,label} pairs.
 * Prefers the new `optionsJson` prop (a JSON array); falls back to the legacy
 * comma-separated `options` string so existing SCOPE-107 select blocks keep working.
 */
export function parseSelectOptions(node: BlockNode): DropdownOption[] {
  const raw = node.props.optionsJson;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
          .map((o) => {
            const value = String(o.value ?? o.label ?? "");
            const label = String(o.label ?? o.value ?? "");
            return { value, label };
          })
          .filter((o) => o.value !== "" || o.label !== "");
      }
    } catch {
      // malformed JSON → fall through to the legacy comma-string
    }
  }
  return String(node.props.options ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ value: s, label: s }));
}

/** Serialize structured options back to the `optionsJson` prop string. */
export function serializeSelectOptions(options: DropdownOption[]): string {
  return JSON.stringify(options);
}
// [SCOPE 108 / T001] END

// [SCOPE 108 / T004] BEGIN — generalized drag-resize clamp (width OR height), any node
/** New dimension from a drag: start + pointer delta, floored at `min` px. */
export function clampDim(start: number, delta: number, min = 24): number {
  return Math.max(min, Math.round(start + delta));
}
// [SCOPE 108 / T004] END

// [SCOPE 108 / T006] BEGIN — precise reorder tree ops (drag-to-reorder)
/** Find a node anywhere in the tree by id. */
export function findNodeById(nodes: BlockNode[], id: string): BlockNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNodeById(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

/** Locate a node's container (ROOT_ID for top level) and its index within it. */
export function findParentAndIndex(nodes: BlockNode[], id: string): { parentId: string; index: number } | null {
  const top = nodes.findIndex((n) => n.id === id);
  if (top !== -1) return { parentId: ROOT_ID, index: top };
  for (const n of nodes) {
    if (n.children) {
      const i = n.children.findIndex((c) => c.id === id);
      if (i !== -1) return { parentId: n.id, index: i };
      const deep = findParentAndIndex(n.children, id);
      if (deep) return deep;
    }
  }
  return null;
}

/** True if `id` is `root` itself or lives anywhere inside `root`'s subtree. */
function subtreeContains(root: BlockNode, id: string): boolean {
  if (root.id === id) return true;
  return (root.children ?? []).some((c) => subtreeContains(c, id));
}

function insertNodeAt(nodes: BlockNode[], parentId: string, newNode: BlockNode, index: number): BlockNode[] {
  if (parentId === ROOT_ID) {
    const copy = [...nodes];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, newNode);
    return copy;
  }
  return nodes.map((n) => {
    if (n.id === parentId && n.children) {
      const copy = [...n.children];
      copy.splice(Math.max(0, Math.min(index, copy.length)), 0, newNode);
      return { ...n, children: copy };
    }
    if (n.children) return { ...n, children: insertNodeAt(n.children, parentId, newNode, index) };
    return n;
  });
}

/**
 * Move node `id` to position `index` within container `targetContainerId`
 * (ROOT_ID = top level). `index` is the destination position after the node is
 * removed. Rejects moving a node into itself or its own descendants, and into a
 * non-container target; returns the tree unchanged when the move is invalid.
 */
export function moveNodeTo(nodes: BlockNode[], id: string, targetContainerId: string, index: number): BlockNode[] {
  const moving = findNodeById(nodes, id);
  if (!moving) return nodes;
  if (targetContainerId !== ROOT_ID) {
    if (targetContainerId === id) return nodes;
    if (subtreeContains(moving, targetContainerId)) return nodes; // would create a cycle
    const target = findNodeById(nodes, targetContainerId);
    if (!target || !target.children) return nodes; // target must be a container
  }
  const without = removeNode(nodes, id);
  return insertNodeAt(without, targetContainerId, moving, index);
}
// [SCOPE 108 / T006] END

// ── Code emitter (execute → real TSX) ────────────────────────────────────────

function str(v: PropValue | undefined, fallback = ""): string {
  return v === undefined || v === null ? fallback : String(v);
}

// [SCOPE 107 / T001] BEGIN — renderBlockCode (block tree → React+Tailwind+shadcn TSX)
// MODIFIED-BY [SCOPE 107 / T004] — alignment classes via stackClasses/selfClasses
// MODIFIED-BY [SCOPE 107 / T005] — color/size/weight via styleClasses + tailwind-merge
// MODIFIED-BY [SCOPE 108 / T001] — structured dropdown emit (parseSelectOptions + placeholder/default)
// MODIFIED-BY [SCOPE 108 / T005] — container width/height inline style (opt-in resize)
function emitNode(node: BlockNode, indent: string): string {
  const p = node.props;
  const kids = (node.children ?? []).map((c) => emitNode(c, indent + "  ")).join("\n");
  const extra = [selfClasses(node), styleClasses(node)].filter(Boolean).join(" ");
  const cls = (base: string): string => (extra ? twMerge(`${base} ${extra}`) : base);
  const w = Number(p.width ?? 0);
  const wStyle = w > 0 ? ` style={{ width: ${w} }}` : "";
  // Container width/height from drag-resize (opt-in). Unset → no style → today's output.
  const ch = Number(p.height ?? 0);
  const dimParts: string[] = [];
  if (w > 0) dimParts.push(`width: ${w}`);
  if (ch > 0) dimParts.push(`height: ${ch}`);
  const dimStyle = dimParts.length ? ` style={{ ${dimParts.join(", ")} }}` : "";
  switch (node.type) {
    case "panel":
      return `${indent}<section${dimStyle} className="${cls(`rounded-lg border border-border bg-card p-6 text-card-foreground ${stackClasses(node)}`)}">\n${kids}\n${indent}</section>`;
    case "columns":
      return `${indent}<div${dimStyle} className="${cls("grid gap-4 sm:grid-cols-2")}">\n${kids}\n${indent}</div>`;
    case "row":
      return `${indent}<div${dimStyle} className="${cls(stackClasses(node))}">\n${kids}\n${indent}</div>`;
    case "heading":
      return `${indent}<h2${wStyle} className="${cls("text-3xl font-bold tracking-tight text-foreground")}">{${JSON.stringify(str(p.text))}}</h2>`;
    case "subheading":
      return `${indent}<h3${wStyle} className="${cls("text-xl font-semibold text-foreground")}">{${JSON.stringify(str(p.text))}}</h3>`;
    case "paragraph":
      return `${indent}<p${wStyle} className="${cls("text-sm text-muted-foreground")}">{${JSON.stringify(str(p.text))}}</p>`;
    case "button":
      return `${indent}<a href={${JSON.stringify(str(p.href, "#"))}}${wStyle} className="${cls(`inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground${w > 0 ? " w-full justify-center" : ""}`)}">{${JSON.stringify(str(p.label, "Button"))}}</a>`;
    case "image": {
      const iw = Number(p.width ?? 0);
      const st = iw > 0 ? ` style={{ width: ${iw} }}` : "";
      return `${indent}<img src={${JSON.stringify(str(p.src))}} alt={${JSON.stringify(str(p.alt))}}${st} className="${cls("max-w-full rounded-md")}" />`;
    }
    case "spacer":
      return `${indent}<div style={{ height: ${Number(p.size ?? 24)} }} />`;
    case "divider":
      return `${indent}<hr className="border-border" />`;
    case "input":
      return `${indent}<label className="block text-sm font-medium text-foreground">{${JSON.stringify(str(p.label))}}\n${indent}  <input placeholder={${JSON.stringify(str(p.placeholder))}} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />\n${indent}</label>`;
    case "textarea":
      return `${indent}<label className="block text-sm font-medium text-foreground">{${JSON.stringify(str(p.label))}}\n${indent}  <textarea placeholder={${JSON.stringify(str(p.placeholder))}} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />\n${indent}</label>`;
    case "select": {
      const opts = parseSelectOptions(node);
      const def = str(p.defaultValue);
      const ph = str(p.placeholder);
      const phLine = ph
        ? `${indent}    <option value="">{${JSON.stringify(ph)}}</option>\n`
        : "";
      const optLines = opts
        .map((o) => `${indent}    <option value={${JSON.stringify(o.value)}}>{${JSON.stringify(o.label)}}</option>`)
        .join("\n");
      return `${indent}<label className="block text-sm font-medium text-foreground">{${JSON.stringify(str(p.label))}}\n${indent}  <select defaultValue={${JSON.stringify(def)}} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">\n${phLine}${optLines}\n${indent}  </select>\n${indent}</label>`;
    }
    case "checkbox":
      return `${indent}<label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" className="rounded border-input" />{${JSON.stringify(str(p.label))}}</label>`;
    case "submit":
      return `${indent}<button type="submit" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{${JSON.stringify(str(p.label, "Submit"))}}</button>`;
    case "cardgrid":
      return `${indent}<div${dimStyle} className="${cls(`grid gap-4 sm:grid-cols-${Number(p.columns ?? 3)}`)}">\n${kids}\n${indent}</div>`;
    case "stat":
      return `${indent}<div className="${cls("rounded-lg border border-border bg-card p-4 text-card-foreground")}"><div className="text-2xl font-bold text-foreground">{${JSON.stringify(str(p.value))}}</div><div className="text-xs text-muted-foreground">{${JSON.stringify(str(p.label))}}</div></div>`;
    case "embed":
      return `${indent}<div className="aspect-video w-full overflow-hidden rounded-md border border-border"><iframe src={${JSON.stringify(str(p.url))}} className="h-full w-full" title="embed" /></div>`;
    default:
      return `${indent}{/* unknown node */}`;
  }
}

export function renderBlockCode(block: Block): string {
  const body = block.nodes.map((n) => emitNode(n, "      ")).join("\n");
  const comp = block.name.replace(/[^a-zA-Z0-9]/g, "") || "Block";
  return [
    `// Generated by SCOPE-107 Block Composer — styled by the project theme (shadcn semantic classes).`,
    `export function ${comp}() {`,
    `  return (`,
    `    <div className="flex flex-col gap-4">`,
    body,
    `    </div>`,
    `  );`,
    `}`,
    ``,
  ].join("\n");
}
// [SCOPE 107 / T001] END

// [SCOPE 108 / T009] BEGIN — emit a Header/Footer component from a chrome region's tree
/** Region landmark classes — literal strings (Tailwind source scan), theme-styled. */
const REGION_CLASS: Record<"header" | "footer", string> = {
  header: "flex flex-col gap-4 border-b border-border bg-background px-6 py-4 text-foreground",
  footer: "flex flex-col gap-4 border-t border-border bg-background px-6 py-4 text-muted-foreground",
};

/**
 * Emit a self-contained `Header`/`Footer` component from a chrome region's Block-Node
 * tree, wrapped in the matching semantic landmark (`<header>` / `<footer>`). Reuses the
 * same `emitNode` as `renderBlockCode`, so the emitted markup matches the live preview
 * (the Node-Type Registry invariant). An empty tree emits a no-op component that renders
 * `null` — never broken code (SCOPE-108 / T010).
 */
export function renderRegionComponent(componentName: string, tag: "header" | "footer", nodes: BlockNode[]): string {
  const comp = componentName.replace(/[^a-zA-Z0-9]/g, "") || (tag === "header" ? "Header" : "Footer");
  if (nodes.length === 0) {
    return [
      `// Generated by SCOPE-108 Theme Header & Footer Designer.`,
      `export function ${comp}() {`,
      `  return null;`,
      `}`,
      ``,
    ].join("\n");
  }
  const body = nodes.map((n) => emitNode(n, "      ")).join("\n");
  return [
    `// Generated by SCOPE-108 Theme Header & Footer Designer — styled by the project theme (shadcn semantic classes).`,
    `export function ${comp}() {`,
    `  return (`,
    `    <${tag} className="${REGION_CLASS[tag]}">`,
    body,
    `    </${tag}>`,
    `  );`,
    `}`,
    ``,
  ].join("\n");
}
// [SCOPE 108 / T009] END
