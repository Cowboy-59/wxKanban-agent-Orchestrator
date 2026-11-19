// SCOPE-107 / T002 — BlockRenderer: renders a BlockNode tree to React, styled by the
// active theme (shadcn semantic classes). The runtime twin of renderBlockCode. In
// `editable` mode nodes are selectable, containers are drop targets, and each node shows
// a hover toolbar (move/duplicate/delete).
import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject, type CSSProperties } from "react";
import { useDroppable, type DraggableAttributes, type DraggableSyntheticListeners } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../lib/utils";
import type { BlockNode, PropValue } from "../../../shared/block-model";
import { stackClasses, selfClasses, styleClasses, clampDim, parseSelectOptions, NODE_REGISTRY } from "../../../shared/block-model";
import BlockToolbar from "./BlockToolbar";

function s(v: PropValue | undefined, fallback = ""): string {
  return v === undefined || v === null ? fallback : String(v);
}

export interface BlockRenderCallbacks {
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onToolbar?: (action: "up" | "down" | "dup" | "del", id: string) => void;
  onProp?: (id: string, key: string, value: PropValue) => void;
}

// MODIFIED-BY [SCOPE 108 / T007] — optional drag handle (⠿) carrying the sortable listeners
function Toolbar({
  id,
  onToolbar,
  dragHandle,
}: {
  id: string;
  onToolbar?: BlockRenderCallbacks["onToolbar"];
  dragHandle?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners };
}) {
  if (!onToolbar) return null;
  const btn = "rounded bg-background/90 px-1.5 py-0.5 text-xs text-foreground shadow-sm hover:bg-accent";
  return (
    <div className="absolute right-1 top-1 z-10 hidden gap-1 group-hover:flex">
      {dragHandle ? (
        <button
          type="button"
          className={cn(btn, "cursor-grab")}
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          {...dragHandle.attributes}
          {...dragHandle.listeners}
        >
          ⠿
        </button>
      ) : null}
      <button type="button" className={btn} title="Move up" onClick={(e) => { e.stopPropagation(); onToolbar("up", id); }}>↑</button>
      <button type="button" className={btn} title="Move down" onClick={(e) => { e.stopPropagation(); onToolbar("down", id); }}>↓</button>
      <button type="button" className={btn} title="Duplicate" onClick={(e) => { e.stopPropagation(); onToolbar("dup", id); }}>⧉</button>
      <button type="button" className={cn(btn, "text-destructive")} title="Delete" onClick={(e) => { e.stopPropagation(); onToolbar("del", id); }}>✕</button>
    </div>
  );
}

function leaf(node: BlockNode): ReactNode {
  const p = node.props;
  switch (node.type) {
    case "heading":
      return <h2 className={cn("text-3xl font-bold tracking-tight text-foreground", styleClasses(node))}>{s(p.text, "Heading")}</h2>;
    case "subheading":
      return <h3 className={cn("text-xl font-semibold text-foreground", styleClasses(node))}>{s(p.text, "Subheading")}</h3>;
    case "paragraph":
      return <p className={cn("text-sm text-muted-foreground", styleClasses(node))}>{s(p.text, "Paragraph")}</p>;
    case "button":
      return <span className={cn("inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground", Number(p.width ?? 0) > 0 && "w-full justify-center", styleClasses(node))}>{s(p.label, "Button")}</span>;
    // image is rendered by <BlockImage/> (needs a ref + drag handle) — see below.
    case "spacer":
      return <div style={{ height: Number(p.size ?? 24) }} />;
    case "divider":
      return <hr className="border-border" />;
    case "input":
      return (
        <label className="block text-sm font-medium text-foreground">{s(p.label, "Label")}
          <input placeholder={s(p.placeholder)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal" readOnly />
        </label>
      );
    case "textarea":
      return (
        <label className="block text-sm font-medium text-foreground">{s(p.label, "Label")}
          <textarea placeholder={s(p.placeholder)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal" readOnly />
        </label>
      );
    // [SCOPE 108 / T003] structured dropdown — same parseSelectOptions source as the emitter
    case "select": {
      const opts = parseSelectOptions(node);
      const ph = s(p.placeholder);
      const def = s(p.defaultValue);
      return (
        <label className="block text-sm font-medium text-foreground">{s(p.label, "Label")}
          <select
            key={def}
            defaultValue={def}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
          >
            {ph ? <option value="">{ph}</option> : null}
            {opts.map((o, i) => <option key={i} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    case "checkbox":
      return <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" className="rounded border-input" readOnly />{s(p.label, "Checkbox")}</label>;
    case "submit":
      return <span className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{s(p.label, "Submit")}</span>;
    case "stat":
      return (
        <div className={cn("rounded-lg border border-border bg-card p-4 text-card-foreground", styleClasses(node))}>
          <div className="text-2xl font-bold text-foreground">{s(p.value, "0")}</div>
          <div className="text-xs text-muted-foreground">{s(p.label, "Label")}</div>
        </div>
      );
    case "embed":
      return s(p.url) ? (
        <div className="aspect-video w-full overflow-hidden rounded-md border border-border">
          <iframe src={s(p.url)} className="h-full w-full" title="embed" />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">embed</div>
      );
    default:
      return null;
  }
}

function ContainerDrop({ node, cb }: { node: BlockNode; cb: BlockRenderCallbacks }) {
  const { setNodeRef, isOver } = useDroppable({ id: node.id });
  const empty = (node.children ?? []).length === 0;
  const cols = node.type === "cardgrid" ? Number(node.props.columns ?? 3) : 0;
  const inner = (
    <div
      ref={cb.editable ? setNodeRef : undefined}
      className={cn(
        node.type === "columns"
          ? "grid gap-4 sm:grid-cols-2"
          : node.type === "cardgrid"
            ? "grid gap-4"
            : stackClasses(node), // handles row + panel/stack alignment
        node.type !== "panel" && styleClasses(node), // panel style goes on the <section>
        cb.editable && isOver && "outline outline-2 outline-ring",
        cb.editable && empty && "min-h-[48px] rounded-md border border-dashed border-border p-2",
      )}
      style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
    >
      {empty && cb.editable ? (
        <p className="text-center text-xs text-muted-foreground">Drop controls here</p>
      ) : (
        <BlockRenderer nodes={node.children ?? []} {...cb} />
      )}
    </div>
  );
  if (node.type === "panel") {
    return <section className={cn("rounded-lg border border-border bg-card p-6 text-card-foreground", styleClasses(node))}>{inner}</section>;
  }
  return inner;
}

// [SCOPE 107 / T007] BEGIN — shared drag-to-resize for images and text content
// MODIFIED-BY [SCOPE 108 / T004] — generalized to width|height (bottom edge) + containers
function createResizeStart(
  nodeId: string,
  onProp: BlockRenderCallbacks["onProp"],
  ref: RefObject<HTMLElement | null>,
  edge: "left" | "right" | "bottom",
) {
  return (e: ReactPointerEvent) => {
    if (!onProp) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = ref.current?.getBoundingClientRect();
    const dim = edge === "bottom" ? "height" : "width";
    const start = edge === "bottom" ? (rect?.height ?? 100) : (rect?.width ?? 200);
    const startPos = edge === "bottom" ? e.clientY : e.clientX;
    const sign = edge === "left" ? -1 : 1; // dragging the left edge outward (or the bottom down) grows
    const move = (ev: PointerEvent) => {
      const cur = edge === "bottom" ? ev.clientY : ev.clientX;
      onProp(nodeId, dim, clampDim(start, sign * (cur - startPos)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

// Grips on BOTH side edges (width) and, when axes="wh", a bottom edge (height, opt-in).
function ResizeGrips({
  node,
  onProp,
  gripRef,
  axes = "w",
}: {
  node: BlockNode;
  onProp: BlockRenderCallbacks["onProp"];
  gripRef: RefObject<HTMLElement | null>;
  axes?: "w" | "wh";
}) {
  const base = "absolute z-20 rounded-sm border border-primary bg-background";
  const side = "top-1/2 h-5 w-2 -translate-y-1/2 cursor-ew-resize";
  return (
    <>
      <span onPointerDown={createResizeStart(node.id, onProp, gripRef, "left")} title="Drag to resize width" className={cn(base, side, "-left-1")} />
      <span onPointerDown={createResizeStart(node.id, onProp, gripRef, "right")} title="Drag to resize width" className={cn(base, side, "-right-1")} />
      {axes === "wh" ? (
        <span onPointerDown={createResizeStart(node.id, onProp, gripRef, "bottom")} title="Drag to resize height" className={cn(base, "bottom-[-4px] left-1/2 h-2 w-5 -translate-x-1/2 cursor-ns-resize")} />
      ) : null}
    </>
  );
}

// Content-hugging image with a drag-resize handle.
function BlockImage({
  node,
  editable,
  selected,
  onProp,
}: {
  node: BlockNode;
  editable: boolean;
  selected: boolean;
  onProp?: BlockRenderCallbacks["onProp"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const p = node.props;
  const iw = Number(p.width ?? 0);
  const src = s(p.src);

  return (
    <div
      ref={ref}
      className={cn("relative inline-block max-w-full align-top", styleClasses(node))}
      style={iw > 0 ? { width: iw } : undefined}
    >
      {src ? (
        <img src={src} alt={s(p.alt)} className="block w-full rounded-md" />
      ) : (
        <div className="flex h-24 w-40 max-w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          image
        </div>
      )}
      {editable && selected && onProp ? <ResizeGrips node={node} onProp={onProp} gripRef={ref} /> : null}
    </div>
  );
}

// Any text/content leaf, made width-resizable (drag sets the box width → text wraps).
function ResizableLeaf({
  node,
  editable,
  selected,
  onProp,
  children,
}: {
  node: BlockNode;
  editable: boolean;
  selected: boolean;
  onProp?: BlockRenderCallbacks["onProp"];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const iw = Number(node.props.width ?? 0);
  return (
    <div ref={ref} className="relative" style={iw > 0 ? { width: iw } : undefined}>
      {children}
      {editable && selected && onProp ? <ResizeGrips node={node} onProp={onProp} gripRef={ref} /> : null}
    </div>
  );
}
// [SCOPE 107 / T007] END

// [SCOPE 108 / T004] BEGIN — resizable container wrapper (width always; height opt-in via bottom grip)
function ResizableContainer({
  node,
  editable,
  selected,
  onProp,
  children,
}: {
  node: BlockNode;
  editable: boolean;
  selected: boolean;
  onProp?: BlockRenderCallbacks["onProp"];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = Number(node.props.width ?? 0);
  const h = Number(node.props.height ?? 0);
  const style: CSSProperties = {};
  if (w > 0) style.width = w;
  if (h > 0) style.height = h;
  return (
    <div ref={ref} className="relative" style={w > 0 || h > 0 ? style : undefined}>
      {children}
      {editable && selected && onProp ? <ResizeGrips node={node} onProp={onProp} gripRef={ref} axes="wh" /> : null}
    </div>
  );
}
// [SCOPE 108 / T004] END

// [SCOPE 107 / T002] BEGIN — BlockRenderer — block tree → React (theme-styled, editable)
// MODIFIED-BY [SCOPE 108 / T004] — containers wrapped in ResizableContainer (drag-resize)
// MODIFIED-BY [SCOPE 108 / T007] — editable nodes are sortable (drag-to-reorder)
function nodeContent(node: BlockNode, cb: BlockRenderCallbacks, selected: boolean): ReactNode {
  const isContainer = NODE_REGISTRY[node.type].container;
  const resizableText =
    node.type === "heading" ||
    node.type === "subheading" ||
    node.type === "paragraph" ||
    node.type === "button";
  return (
    <>
      {cb.editable && selected && cb.onProp ? (
        <BlockToolbar node={node} onProp={(k, v) => cb.onProp?.(node.id, k, v)} />
      ) : null}
      {isContainer ? (
        <ResizableContainer node={node} editable={!!cb.editable} selected={selected} onProp={cb.onProp}>
          <ContainerDrop node={node} cb={cb} />
        </ResizableContainer>
      ) : node.type === "image" ? (
        <BlockImage node={node} editable={!!cb.editable} selected={selected} onProp={cb.onProp} />
      ) : resizableText ? (
        <ResizableLeaf node={node} editable={!!cb.editable} selected={selected} onProp={cb.onProp}>
          {leaf(node)}
        </ResizableLeaf>
      ) : (
        leaf(node)
      )}
    </>
  );
}

function wrapperClass(node: BlockNode, editable: boolean, selected: boolean): string {
  const hasWidth = Number(node.props.width ?? 0) > 0;
  return cn(
    "group relative",
    editable && "cursor-pointer rounded-md",
    selected && "outline outline-2 outline-primary",
    // footprint hugs the element (not the column) once it's an image or has been sized
    (node.type === "image" || hasWidth) && "w-fit max-w-full",
    selfClasses(node),
  );
}

// One editable canvas node: sortable (drag handle in the toolbar) + selectable.
function SortableNode({ node, cb }: { node: BlockNode; cb: BlockRenderCallbacks }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: node.id });
  const selected = !!cb.editable && cb.selectedId === node.id;
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(wrapperClass(node, true, selected), isDragging && "z-30 opacity-60")}
      onClick={(e) => { e.stopPropagation(); cb.onSelect?.(node.id); }}
    >
      <Toolbar id={node.id} onToolbar={cb.onToolbar} dragHandle={{ attributes, listeners }} />
      {nodeContent(node, cb, selected)}
    </div>
  );
}

export default function BlockRenderer({
  nodes,
  ...cb
}: { nodes: BlockNode[] } & BlockRenderCallbacks) {
  if (cb.editable) {
    return (
      <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        {nodes.map((node) => (
          <SortableNode key={node.id} node={node} cb={cb} />
        ))}
      </SortableContext>
    );
  }
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id} className={wrapperClass(node, false, false)}>
          {nodeContent(node, cb, false)}
        </div>
      ))}
    </>
  );
}
// [SCOPE 107 / T002] END
