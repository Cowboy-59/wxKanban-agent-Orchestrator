// [SCOPE 055 / T008] Shared structured Stack & Style editor — the same controls
// used at project creation (CreateProjectModal) and on the project Stack tab
// (StackTabView): app type, the six stack dimensions with rationale, look & feel
// galleries + cited reference, and AI design-token derivation. Operates on a
// ProjectStackData value via onChange; the caller owns persistence.
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Layers, Palette, ChevronDown, Check } from "lucide-react";
import {
  APP_TYPES,
  APP_TYPE_LABELS,
  STACK_DIMENSIONS,
  STACK_DIMENSION_LABELS,
  DEFAULT_STACKS,
  STACK_OPTIONS,
  splitStackValue,
  joinStackValue,
  type AppType,
  type StackDimension,
  type StackChoices,
  type ProjectStackData,
} from "~/shared/stack-defaults";

// [SCOPE 055 / T008] BEGIN — StackEditor (shared structured stack/style controls)
// MODIFIED-BY: [SCOPE 122 / T008] — DimensionPicker's panel is portalled to document.body
//   and positioned fixed, flipping above the trigger when it would pass the viewport
//   bottom (FR-009). It was absolutely positioned with its containing block inside
//   CreateProjectModal's `max-h-[70vh] overflow-y-auto` body, so the scroller clipped it —
//   worst on Hosting / Deploy, the last of the six dimensions. Field feedback 826dd172.
// Multi-select dropdown of curated options for one dimension. Checking an option
// adds it to the value ("A + B"); unchecking removes it. Custom text typed into the
// value field is preserved (only known options are toggled in/out).

// Panel geometry. PANEL_WIDTH/PANEL_MAX_HEIGHT are applied as inline styles rather than
// the old w-64/max-h-60 classes, because the flip and clamp maths must agree with what
// actually renders — a class/constant mismatch would misplace the panel by whole pixels.
const PANEL_WIDTH = 256; // was w-64
const PANEL_MAX_HEIGHT = 240; // was max-h-60
const PANEL_GAP = 4; // was mt-1
const VIEWPORT_MARGIN = 8; // never let the panel touch the viewport edge
const PANEL_MIN_HEIGHT = 96; // below this, scrolling a flipped panel is worse than not flipping

export interface PanelPosition {
  top: number;
  left: number;
  maxHeight: number;
}

/**
 * Pure flip/clamp geometry for the portalled panel, split out of the component so it is
 * unit-testable: this repo's vitest runs `environment: "node"` with no jsdom, so the maths
 * is the part that can be guarded cheaply. Guarantees, for any trigger position: the panel
 * stays inside the viewport vertically, and horizontally within [0, viewport.width].
 */
export function computePanelPosition(
  rect: { top: number; bottom: number; right: number },
  viewport: { width: number; height: number },
): PanelPosition {
  const spaceBelow = viewport.height - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_MARGIN;
  // Only flip when below is genuinely too tight AND above is roomier — otherwise a panel
  // near the vertical middle would flip back and forth on a few pixels of scroll.
  const flipUp = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;
  const available = flipUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, available));

  // Clamp into the viewport. When the trigger sits in a viewport shorter than the panel's
  // floor, MIN wins over the margin and we bias to the top edge rather than overflow above.
  const rawTop = flipUp ? rect.top - PANEL_GAP - maxHeight : rect.bottom + PANEL_GAP;
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN - maxHeight);
  const top = Math.min(Math.max(VIEWPORT_MARGIN, rawTop), maxTop);

  // Right-aligned to the trigger (the old `right-0`), then clamped into the viewport.
  const maxLeft = Math.max(0, viewport.width - PANEL_WIDTH - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(0, rect.right - PANEL_WIDTH), maxLeft);

  return { top, left, maxHeight };
}

function DimensionPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Anchor the (portalled) panel to the trigger in viewport coordinates.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos(
      computePanelPosition(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    // The panel is no longer a DOM descendant of this component, so an outside-click test
    // against a single wrapper ref would treat every option click as "outside" and close
    // the panel before the toggle fired. Test the trigger AND the panel.
    const onDocMouse = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Capture phase so scrolling an ancestor (the modal body) re-anchors the panel too —
    // scroll events on that element do not bubble to window.
    const onReflow = () => place();
    document.addEventListener("mousedown", onDocMouse);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, place]);

  const parts = splitStackValue(value);
  const isChecked = (opt: string) => parts.some((p) => p.toLowerCase() === opt.toLowerCase());
  const toggle = (opt: string) => {
    const next = isChecked(opt)
      ? parts.filter((p) => p.toLowerCase() !== opt.toLowerCase())
      : [...parts, opt];
    onChange(joinStackValue(next));
  };

  return (
    <div className="flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          place(); // measure before the first paint so the panel never flashes mispositioned
          setOpen(true);
        }}
        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-gray-300 disabled:opacity-50"
      >
        Choose <ChevronDown className="w-3 h-3" />
      </button>
      {open &&
        pos &&
        // Portalled to document.body so no ancestor's overflow can clip it. z-index above
        // the z-50 modal, since the panel is now a sibling of the modal root rather than
        // a descendant of it.
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              top: pos.top,
              left: pos.left,
              width: PANEL_WIDTH,
              maxHeight: pos.maxHeight,
            }}
            className="fixed z-[60] overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-1"
          >
            {options.map((opt) => {
              const checked = isChecked(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(opt)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span
                    className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border ${
                      checked
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {checked && <Check className="w-3 h-3" />}
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">{opt}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

export interface StackEditorProps {
  data: ProjectStackData;
  onChange: (next: ProjectStackData) => void;
  // Composite keys "<appType>:<dimension>" the user has hand-edited.
  customizedDims: Set<string>;
  onCustomizedDimsChange: (next: Set<string>) => void;
  disabled?: boolean;
}

/** Fresh copy of an app type's default six choices. */
function freshStack(appType: AppType): StackChoices {
  return STACK_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = { ...DEFAULT_STACKS[appType][dim] };
    return acc;
  }, {} as StackChoices);
}

export default function StackEditor({
  data,
  onChange,
  customizedDims,
  onCustomizedDimsChange,
  disabled = false,
}: StackEditorProps) {
  // [SCOPE 062 / T011] Look & Feel moved to the dedicated Theme surface (ThemeStudio /
  // Theme tab). The Stack editor now captures tech choices only; visual identity
  // (galleries, cited reference, design tokens) lives in the Theme experience.

  // The selected types, rendered in canonical web→desktop→mobile order.
  const selectedTypes = APP_TYPES.filter((t) => data.appTypes.includes(t));

  // FR-002: toggle an app type. Adding seeds that type's default stack; removing
  // drops it (keeping at least one type selected).
  const toggleAppType = (appType: AppType) => {
    const has = data.appTypes.includes(appType);
    const stacks = { ...data.stacks };
    let appTypes: AppType[];
    if (has) {
      if (data.appTypes.length === 1) return; // never empty
      appTypes = data.appTypes.filter((t) => t !== appType);
      delete stacks[appType];
    } else {
      appTypes = [...data.appTypes, appType];
      stacks[appType] = stacks[appType] ?? freshStack(appType);
    }
    onChange({ ...data, appTypes, stacks });
  };

  const handleStackField = (
    appType: AppType,
    dim: StackDimension,
    field: "value" | "rationale",
    val: string,
  ) => {
    onCustomizedDimsChange(new Set(customizedDims).add(`${appType}:${dim}`));
    const current = data.stacks[appType] ?? freshStack(appType);
    onChange({
      ...data,
      stacks: {
        ...data.stacks,
        [appType]: { ...current, [dim]: { ...current[dim], [field]: val } },
      },
    });
  };

  // [SCOPE 062 / T011] setLookFeel / deriveTokens removed — see the Theme surface.

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Layers className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Stack &amp; Style{" "}
          <span className="text-gray-400 dark:text-gray-500 font-normal">
            (defaults shown — adjust or accept)
          </span>
        </span>
      </div>

      {/* App type — multi-select; each selected type gets its own stack below. */}
      <div className="flex flex-wrap gap-2 mb-2">
        {APP_TYPES.map((t) => {
          const active = data.appTypes.includes(t);
          const onlyOne = active && data.appTypes.length === 1;
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleAppType(t)}
              disabled={disabled || onlyOne}
              title={onlyOne ? "At least one application type is required" : undefined}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                active
                  ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-gray-300"
              } ${disabled || onlyOne ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span
                className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border ${
                  active
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              >
                {active && <Check className="w-3 h-3" />}
              </span>
              {APP_TYPE_LABELS[t]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Pick every platform this project ships. Each gets its own stack table in stack.md.
      </p>

      {/* Stack dimensions — one block per selected app type. */}
      <div className="space-y-5">
        {selectedTypes.map((appType) => {
          const stack = data.stacks[appType] ?? DEFAULT_STACKS[appType];
          return (
            <div key={appType}>
              {selectedTypes.length > 1 && (
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-2">
                  {APP_TYPE_LABELS[appType]}
                </div>
              )}
              <div className="space-y-2">
                {STACK_DIMENSIONS.map((dim) => (
                  <div key={dim} className="grid grid-cols-[8rem_1fr] gap-2 items-start">
                    <span className="text-sm text-gray-600 dark:text-gray-400 pt-2">
                      {STACK_DIMENSION_LABELS[dim]}
                    </span>
                    <div className="space-y-1">
                      <div className="flex gap-2 items-start">
                        <input
                          type="text"
                          value={stack[dim].value}
                          onChange={(e) => handleStackField(appType, dim, "value", e.target.value)}
                          disabled={disabled}
                          className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <DimensionPicker
                          options={STACK_OPTIONS[appType][dim]}
                          value={stack[dim].value}
                          onChange={(v) => handleStackField(appType, dim, "value", v)}
                          disabled={disabled}
                        />
                      </div>
                      <input
                        type="text"
                        value={stack[dim].rationale}
                        onChange={(e) => handleStackField(appType, dim, "rationale", e.target.value)}
                        disabled={disabled}
                        placeholder="Why this choice?"
                        className="w-full px-3 py-1 border border-gray-100 dark:border-gray-700 rounded-lg text-xs bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* [SCOPE 062 / T011] Look & Feel / design tokens moved to the Theme tab (ThemeStudio). */}
      <div className="mt-4 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Palette className="w-4 h-4" />
          <span>
            Visual identity (colors, typography, look &amp; feel) now lives in the{" "}
            <span className="font-medium">Theme</span> tab.
          </span>
        </div>
      </div>
    </div>
  );
}
// [SCOPE 055 / T008] END
