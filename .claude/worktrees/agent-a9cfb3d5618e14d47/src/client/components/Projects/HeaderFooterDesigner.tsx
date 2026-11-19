// [SCOPE 108 / T002,T003,T004] Header & Footer Designer — the retargeted editing surface.
// Kills the flat canvas: a structural TREE (Header / Footer branches) beside the LIVE
// themed preview, where the preview itself is the editable surface. Header and footer are
// two Block-Node trees (snapped one-each) carried on the theme's BusinessChrome; elements
// are dragged in from the palette, selected in the tree or the preview, and edited in the
// property panel. Reuses the shared BlockRenderer + block-model ops (no new tree code).
import { useEffect, useState, type CSSProperties, type ReactNode, type ChangeEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import BlockRenderer from "./BlockRenderer";
import {
  NODE_REGISTRY,
  PALETTE,
  ROOT_ID,
  createNode,
  insertNode,
  updateNodeProps,
  removeNode,
  duplicateNode,
  moveNode,
  moveNodeTo,
  findNodeById,
  findParentAndIndex,
  parseSelectOptions,
  serializeSelectOptions,
  type BlockNode,
  type BlockNodeType,
  type NodeField,
  type DropdownOption,
} from "../../../shared/block-model";
import { seedChromeTrees, type BusinessChrome } from "../../../shared/theme-template";
import {
  THEME_TOKEN_KEYS,
  TOKEN_CSS_VARS,
  type ProjectTheme,
  type ThemeTokenSet,
} from "../../../shared/theme-tokens";

type RegionKey = "header" | "footer";
const HEADER_ROOT = "region-header";
const FOOTER_ROOT = "region-footer";

function themeVars(tokens: ThemeTokenSet, radius: string, fontFamily: string): CSSProperties {
  const vars: Record<string, string> = { "--radius": radius, fontFamily };
  for (const k of THEME_TOKEN_KEYS) vars[TOKEN_CSS_VARS[k]] = tokens[k];
  return vars as CSSProperties;
}

// A palette control the author drags into a region.
function PaletteItem({ type }: { type: BlockNodeType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${type}`, data: { type } });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={cn(
        "w-full cursor-grab rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-accent",
        isDragging && "opacity-50",
      )}
    >
      {NODE_REGISTRY[type].label}
    </button>
  );
}

// The droppable region wrapper (its own component so the droppable sits inside DndContext).
function RegionDrop({
  id,
  label,
  empty,
  onClick,
  children,
}: {
  id: string;
  label: string;
  empty: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn("min-h-[52px]", isOver && "outline outline-2 outline-ring")}
    >
      {empty ? (
        <p className="px-6 py-4 text-center text-xs text-muted-foreground">Drop {label} elements here</p>
      ) : (
        children
      )}
    </div>
  );
}

// One branch of the outline tree (Header or Footer) — flat list of the region's nodes.
function TreeBranch({
  title,
  nodes,
  selectedId,
  onSelect,
}: {
  title: string;
  nodes: BlockNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows: ReactNode[] = [];
  const walk = (list: BlockNode[], depth: number) => {
    for (const n of list) {
      rows.push(
        <button
          key={n.id}
          type="button"
          onClick={() => onSelect(n.id)}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={cn(
            "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent",
            selectedId === n.id && "bg-accent font-medium",
          )}
        >
          {NODE_REGISTRY[n.type].label}
        </button>,
      );
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {rows.length ? rows : <p className="px-2 text-xs text-muted-foreground">Empty</p>}
    </div>
  );
}

// Structured dropdown options editor ({value,label} rows) — ported from the retired canvas.
function OptionsField({ node, onChange }: { node: BlockNode; onChange: (optionsJson: string) => void }) {
  const options = parseSelectOptions(node);
  const commit = (next: DropdownOption[]) => onChange(serializeSelectOptions(next));
  const update = (i: number, patch: Partial<DropdownOption>) =>
    commit(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const remove = (i: number) => commit(options.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = () => commit([...options, { value: "", label: "New option" }]);
  return (
    <div className="mt-1 space-y-1 font-normal">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1">
          <input value={o.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" className="w-1/2 rounded-md border border-input bg-background px-2 py-1 text-xs" />
          <input value={o.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="Value" className="w-1/2 rounded-md border border-input bg-background px-2 py-1 text-xs" />
          <button type="button" onClick={() => move(i, -1)} className="px-1 text-xs hover:bg-accent" title="Move up">↑</button>
          <button type="button" onClick={() => move(i, 1)} className="px-1 text-xs hover:bg-accent" title="Move down">↓</button>
          <button type="button" onClick={() => remove(i)} className="px-1 text-xs text-destructive hover:bg-accent" title="Remove">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent">+ Add option</button>
    </div>
  );
}

// Property bar — the selected element's fields laid out HORIZONTALLY, above the preview.
function PropertyPanel({
  node,
  onProp,
  onUpload,
  onDelete,
}: {
  node: BlockNode | null;
  onProp: (key: string, value: string | number) => void;
  onUpload: (e: ChangeEvent<HTMLInputElement>, key: string) => void;
  onDelete: () => void;
}) {
  if (!node)
    return <p className="text-xs text-muted-foreground">Select an element on the preview or in the tree to edit it here.</p>;
  const fields = NODE_REGISTRY[node.type].fields;
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <span className="self-center text-xs font-semibold">{NODE_REGISTRY[node.type].label}</span>
      {fields.length === 0 ? (
        <span className="self-center text-xs text-muted-foreground">No editable text — style it via its toolbar on the preview.</span>
      ) : (
        fields.map((f: NodeField) => (
          <label key={f.key} className={cn("flex flex-col text-xs font-medium", f.type === "options" && "basis-full")}>
            <span className="mb-0.5">{f.label}</span>
            {f.type === "segment" ? (
              <div className="flex gap-1">
                {(f.options ?? []).map((opt) => {
                  const active = String(node.props[f.key] ?? "") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onProp(f.key, opt.value)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-normal",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : f.type === "options" ? (
              <OptionsField node={node} onChange={(json) => onProp(f.key, json)} />
            ) : f.type === "image" ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={String(node.props[f.key] ?? "")}
                  onChange={(e) => onProp(f.key, e.target.value)}
                  placeholder="Image URL"
                  className="w-44 rounded-md border border-input bg-background px-2 py-1 text-sm font-normal"
                />
                <label className="cursor-pointer rounded-md border border-input px-2 py-1 text-xs font-normal hover:bg-accent">
                  Upload…
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e, f.key)} />
                </label>
              </div>
            ) : f.type === "textarea" ? (
              <textarea
                value={String(node.props[f.key] ?? "")}
                onChange={(e) => onProp(f.key, e.target.value)}
                rows={2}
                className="w-64 rounded-md border border-input bg-background px-2 py-1 text-sm font-normal"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                value={String(node.props[f.key] ?? "")}
                onChange={(e) => onProp(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                className={cn("rounded-md border border-input bg-background px-2 py-1 text-sm font-normal", f.type === "number" ? "w-20" : "w-44")}
              />
            )}
          </label>
        ))
      )}
      <button type="button" onClick={onDelete} className="ml-auto self-center text-xs text-destructive hover:underline">
        Delete element
      </button>
    </div>
  );
}

export default function HeaderFooterDesigner({
  theme,
  chrome,
  seedKey,
  onChange,
}: {
  theme: ProjectTheme;
  chrome: BusinessChrome;
  /** Changing this re-seeds the regions (e.g. the selected profile id). */
  seedKey?: string;
  onChange: (patch: Partial<BusinessChrome>) => void;
}) {
  const [header, setHeader] = useState<BlockNode[]>(() => seedChromeTrees(chrome).headerNodes);
  const [footer, setFooter] = useState<BlockNode[]>(() => seedChromeTrees(chrome).footerNodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<BlockNodeType | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [libErr, setLibErr] = useState<string | null>(null);

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem("wxkanban_token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }
  // Presigned browser→S3 upload for an image node's src (reuses the SCOPE-108 block-image route).
  async function uploadImage(e: ChangeEvent<HTMLInputElement>, nodeId: string, key: string): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      window.alert("Please choose an image under 10 MB.");
      return;
    }
    setLibErr(null);
    try {
      const presignRes = await fetch("/api/themes/blocks/image/presign", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ filename: file.name, contentType: file.type, contentLength: file.size }),
      });
      const pdata = (await presignRes.json()) as { uploadUrl?: string; publicUrl?: string; error?: string };
      if (!presignRes.ok || !pdata.uploadUrl || !pdata.publicUrl) throw new Error(pdata.error ?? "Upload failed");
      const put = await fetch(pdata.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload to storage failed");
      onProp(nodeId, key, pdata.publicUrl);
    } catch (err) {
      setLibErr(err instanceof Error ? err.message : "Image upload failed");
    }
  }

  // Re-seed when the source profile changes.
  useEffect(() => {
    const s = seedChromeTrees(chrome);
    setHeader(s.headerNodes);
    setFooter(s.footerNodes);
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  function commit(nextHeader: BlockNode[], nextFooter: BlockNode[]) {
    setHeader(nextHeader);
    setFooter(nextFooter);
    onChange({ headerNodes: nextHeader, footerNodes: nextFooter });
  }
  const setRegion = (key: RegionKey, next: BlockNode[]) =>
    key === "header" ? commit(next, footer) : commit(header, next);

  const regionOf = (overId: string): RegionKey | null => {
    if (overId === HEADER_ROOT) return "header";
    if (overId === FOOTER_ROOT) return "footer";
    if (findNodeById(header, overId)) return "header";
    if (findNodeById(footer, overId)) return "footer";
    return null;
  };
  const nodeRegion = (id: string): RegionKey | null =>
    findNodeById(header, id) ? "header" : findNodeById(footer, id) ? "footer" : null;

  // Resolve a drop target to the container it should land in within `regionNodes`.
  function containerIdFor(regionNodes: BlockNode[], overId: string): string {
    if (overId === HEADER_ROOT || overId === FOOTER_ROOT) return ROOT_ID;
    const overNode = findNodeById(regionNodes, overId);
    if (overNode && NODE_REGISTRY[overNode.type].container) return overId;
    const loc = overNode ? findParentAndIndex(regionNodes, overId) : null;
    return loc ? loc.parentId : ROOT_ID;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveType((e.active.data.current?.type as BlockNodeType | undefined) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveType(null);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const dst = regionOf(overId);
    if (!dst) return;
    const dstNodes = dst === "header" ? header : footer;

    // Palette drag → insert a new node into the region.
    const type = e.active.data.current?.type as BlockNodeType | undefined;
    if (type) {
      const node = createNode(type);
      setRegion(dst, insertNode(dstNodes, containerIdFor(dstNodes, overId), node));
      setSelectedId(node.id);
      return;
    }

    // Existing node → reorder within its region, or move across regions.
    const activeId = String(e.active.id);
    if (activeId === overId) return;
    const src = nodeRegion(activeId);
    if (!src) return;

    if (src === dst) {
      const overNode = findNodeById(dstNodes, overId);
      const overIsContainer = overId === HEADER_ROOT || overId === FOOTER_ROOT || (overNode ? NODE_REGISTRY[overNode.type].container : false);
      if (overNode && !overIsContainer) {
        const loc = findParentAndIndex(dstNodes, overId);
        if (loc) setRegion(dst, moveNodeTo(dstNodes, activeId, loc.parentId, loc.index));
        return;
      }
      const endIndex = overId === HEADER_ROOT || overId === FOOTER_ROOT ? dstNodes.length : overNode?.children?.length ?? 0;
      setRegion(dst, moveNodeTo(dstNodes, activeId, overId === HEADER_ROOT || overId === FOOTER_ROOT ? ROOT_ID : overId, endIndex));
      return;
    }

    // Cross-region move: pull from source, append into the destination container.
    const srcNodes = src === "header" ? header : footer;
    const moving = findNodeById(srcNodes, activeId);
    if (!moving) return;
    const nextSrc = removeNode(srcNodes, activeId);
    const nextDst = insertNode(dstNodes, containerIdFor(dstNodes, overId), moving);
    if (src === "header") commit(nextSrc, nextDst);
    else commit(nextDst, nextSrc);
  }

  function onToolbar(action: "up" | "down" | "dup" | "del", id: string) {
    const key = nodeRegion(id);
    if (!key) return;
    const nodes = key === "header" ? header : footer;
    if (action === "up") setRegion(key, moveNode(nodes, id, -1));
    else if (action === "down") setRegion(key, moveNode(nodes, id, 1));
    else if (action === "dup") setRegion(key, duplicateNode(nodes, id));
    else {
      setRegion(key, removeNode(nodes, id));
      if (selectedId === id) setSelectedId(null);
    }
  }

  function onProp(id: string, key: string, value: string | number | boolean) {
    const region = nodeRegion(id);
    if (!region) return;
    const nodes = region === "header" ? header : footer;
    setRegion(region, updateNodeProps(nodes, id, { [key]: value }));
  }

  const selectedNode = selectedId ? findNodeById(header, selectedId) ?? findNodeById(footer, selectedId) : null;
  const tokens = mode === "dark" ? theme.dark : theme.light;

  const grouped: Record<string, BlockNodeType[]> = { layout: [], content: [], form: [], data: [] };
  for (const t of PALETTE) grouped[NODE_REGISTRY[t].category].push(t);

  const rendererCbs = {
    editable: true as const,
    selectedId,
    onSelect: setSelectedId,
    onToolbar,
    onProp,
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
        {/* Left — tree + palette */}
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-2">
            <TreeBranch title="Header" nodes={header} selectedId={selectedId} onSelect={setSelectedId} />
            <TreeBranch title="Footer" nodes={footer} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Drag into the header/footer →</p>
            {(["layout", "content", "form", "data"] as const).map((cat) => (
              <div key={cat} className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{cat}</p>
                <div className="space-y-1 pl-1">
                  {grouped[cat].map((t) => <PaletteItem key={t} type={t} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right of the tree — a properties BAR above, then a widened webpage-like preview */}
        <div className="space-y-2">
          <div className="rounded-lg border border-border p-2">
            <PropertyPanel
              node={selectedNode}
              onProp={(key, value) => selectedNode && onProp(selectedNode.id, key, value)}
              onUpload={(e, key) => selectedNode && void uploadImage(e, selectedNode.id, key)}
              onDelete={() => selectedNode && onToolbar("del", selectedNode.id)}
            />
            {libErr && <p className="mt-1 text-xs text-destructive">{libErr}</p>}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Live preview — drag elements into the header and footer, click to edit
            </span>
            <div className="inline-flex overflow-hidden rounded-md border border-input text-xs">
              <button type="button" onClick={() => setMode("light")} className={cn("px-3 py-1", mode === "light" ? "bg-primary text-primary-foreground" : "bg-background")}>Light</button>
              <button type="button" onClick={() => setMode("dark")} className={cn("px-3 py-1", mode === "dark" ? "bg-primary text-primary-foreground" : "bg-background")}>Dark</button>
            </div>
          </div>

          <div className={cn(mode === "dark" && "dark")} style={themeVars(tokens, theme.radius, theme.typography.fontFamily)}>
            <div className="overflow-hidden rounded-lg border border-border bg-background text-foreground" onClick={() => setSelectedId(null)}>
              {/* Header region */}
              <div className="border-b border-border" onClick={(e) => e.stopPropagation()}>
                <RegionDrop id={HEADER_ROOT} label="header" empty={header.length === 0} onClick={() => setSelectedId(null)}>
                  <div className="flex flex-col gap-2 px-6 py-4">
                    <BlockRenderer nodes={header} {...rendererCbs} />
                  </div>
                </RegionDrop>
              </div>

              {/* Inert theme display — the SAME gallery ThemePreview shows, so the author sees
                  the live theme while editing header/footer. Not editable, not a drop target. */}
              <div className="space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-1">
                  <h3 className="text-2xl font-semibold tracking-tight">The quick brown fox</h3>
                  <p className="text-sm text-muted-foreground">
                    Jumps over the lazy dog — a sample of body copy in the muted foreground.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="ghost">Ghost</Button>
                </div>

                <div className="flex items-center gap-1 rounded-md border border-border p-1 text-sm">
                  <span className="rounded bg-primary px-3 py-1 text-primary-foreground">Overview</span>
                  <span className="rounded px-3 py-1 text-muted-foreground">Activity</span>
                  <span className="rounded px-3 py-1 text-muted-foreground">Settings</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
                    <option>Select an option</option>
                    <option>Another option</option>
                  </select>
                  <span className="inline-flex items-center gap-2 text-sm">
                    <span className="inline-flex h-5 w-9 items-center rounded-full bg-primary p-0.5">
                      <span className="h-4 w-4 translate-x-4 rounded-full bg-primary-foreground transition" />
                    </span>
                    Enabled
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
                  <p className="mb-2 text-sm font-medium">Card surface</p>
                  <input
                    type="text"
                    placeholder="Input field"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">Primary badge</span>
                    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">Secondary</span>
                    <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">Accent</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Muted</span>
                  </div>
                </div>
              </div>

              {/* Footer region */}
              <div className="border-t border-border" onClick={(e) => e.stopPropagation()}>
                <RegionDrop id={FOOTER_ROOT} label="footer" empty={footer.length === 0} onClick={() => setSelectedId(null)}>
                  <div className="flex flex-col gap-2 px-6 py-4 text-muted-foreground">
                    <BlockRenderer nodes={footer} {...rendererCbs} />
                  </div>
                </RegionDrop>
              </div>
            </div>
          </div>
        </div>

      </div>

      <DragOverlay>
        {activeType ? (
          <div className="rounded-md border border-primary bg-background px-2 py-1.5 text-xs shadow">
            {NODE_REGISTRY[activeType].label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
