// SCOPE-114 (SPEC-116 / T009) — the control renderers: `components/ui/*.tsx` from `tokens.components`.
//
// This is the task that turns SCOPE-114 from "a palette" into "a design system you can build
// with". The pack's `components:` block specifies the controls a system actually uses — the
// button's height and tracking, the input's radius, the card's elevation — and until these
// renderers existed there was no path from that specification to a file a customer could use.
//
// THE RULE THAT GOVERNS EVERY LINE HERE: colour never appears as a literal.
//
// It resolves exclusively through shadcn semantic classes (`bg-primary`, `border-border`,
// `text-muted-foreground`), exactly as the shipped `renderHeaderComponent` established for
// chrome. Geometry — and only geometry — is emitted as a literal Tailwind arbitrary value.
//
// That is not a stylistic preference, it is what keeps the bundle correct over time. Colour
// lives in `ProjectTheme`, which the user edits in the Studio; geometry lives in the captured
// `DesignSystemTokens`, which has no editor. If a control baked in `#5e6ad2` it would keep
// rendering the captured brand indigo after the user recoloured their theme, and the bundle
// would be visibly wrong with nothing reporting a failure.
//
// It is also not free. Measuring the real pack found 33 raw colour literals sitting inside
// the source component specs across 27 of the 50 systems — `#ffffff` on twelve `button-dark`
// text colours, `rgba(255,255,255,0.05)` on Raycast's input, a three-stop `linear-gradient`
// on Cohere's button. A renderer that passed values through would emit every one of them and
// fail the spec's own success metric. So an unrecognised or literal colour is SUBSTITUTED
// with the role-appropriate semantic class and the substitution is recorded in the returned
// notes, which T010 surfaces in DESIGN.md. The customer is told what was approximated rather
// than silently shipped a colour that will drift.

import type { ControlSpec, DesignSystemTokens } from "./design-system.js";
import { CONTROL_VARIANT_THRESHOLD } from "./design-system.js";
import { cssSafeKey, dsVar, typeVars } from "./design-system-css.js";

/**
 * How a colour is being used, which decides both the Tailwind prefix and the fallback.
 *
 * The fallback differs per role because "we could not resolve this" has a different safe
 * answer in each position: an unresolvable background should stay neutral, while an
 * unresolvable foreground must stay readable.
 */
export type ColorRole = "bg" | "text" | "border" | "placeholder";

/**
 * The source systems' colour vocabulary mapped onto the 19 shadcn semantic tokens.
 *
 * This table intentionally mirrors `mapToTokenSet` in `src/ingest/designsystems/map.ts`,
 * which performs the same translation for the colour values themselves. The two must agree:
 * that mapping decides what `--primary` actually IS for a system, and this one decides which
 * controls point at it. If they disagreed, a control would reference a semantic slot holding
 * a different colour than the designer intended, and the error would be invisible in code —
 * it would only show up as a button that is the wrong colour on screen.
 *
 * `dark`, `deep`, `contrast` and `inverse` all map to `foreground` rather than to a colour of
 * their own. Those keys name the systems' inverted blocks — a near-black button on a white
 * page — and `foreground`/`background` is exactly that inversion already expressed in
 * semantic terms, so `bg-foreground text-background` reproduces the intent in any theme.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export const COLOR_KEY_SEMANTICS: Readonly<Record<string, string>> = {
  canvas: "background",
  "canvas-soft": "muted",
  surface: "card",
  "surface-alt": "secondary",

  ink: "foreground",
  "ink-strong": "foreground",
  "ink-secondary": "secondary-foreground",
  "ink-muted": "muted-foreground",
  "ink-faint": "muted-foreground",
  "ink-placeholder": "muted-foreground",
  "ink-brand": "primary",
  "ink-on-dark": "background",
  "on-dark": "background",

  primary: "primary",
  "on-primary": "primary-foreground",
  "primary-active": "accent",
  "primary-inverse": "primary-foreground",
  link: "primary",

  hairline: "border",
  "hairline-soft": "border",
  "hairline-strong": "border",
  "border-strong": "border",

  dark: "foreground",
  deep: "foreground",
  contrast: "foreground",
  "on-contrast": "background",
  inverse: "foreground",

  error: "destructive",
  // No semantic `success` slot exists among the 19, and inventing one would put a token in
  // the bundle that the generated `theme.css` never defines. `primary` is the honest stand-in
  // and the substitution is noted.
  success: "primary",
};
// [SCOPE 116 / T009] END

/** The neutral, always-defined semantic slot for each role when nothing else resolves. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
const ROLE_FALLBACK: Readonly<Record<ColorRole, string>> = {
  bg: "card",
  text: "foreground",
  border: "border",
  placeholder: "muted-foreground",
};
// [SCOPE 116 / T009] END

/** The Tailwind class prefix for each role. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
const ROLE_PREFIX: Readonly<Record<ColorRole, string>> = {
  bg: "bg-",
  text: "text-",
  border: "border-",
  placeholder: "placeholder:text-",
};
// [SCOPE 116 / T009] END

/**
 * Non-core controls admitted as extra VARIANTS on their core component.
 *
 * `CONTROL_VARIANT_THRESHOLD` is 5 of 50, and the measured coverage across the real pack is
 * `button-dark` 19, `button-pill` 11, `button-outline` 6 and `button-accent` 5. SPEC-116's
 * prose names only the first three; `button-accent` sits exactly ON the threshold and the
 * rule is "at least 5", so it is admitted here. Everything below the line — `button-ghost`
 * and `button-text` at 3, and the long tail of single-occurrence entries such as
 * `segmented-pill`, `progress-bar` and `plan-card-featured` — stays in the stored tokens and
 * is DOCUMENTED in DESIGN.md rather than becoming generated code nobody asked for.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export const ADMITTED_BUTTON_EXTRAS: ReadonlyArray<{ control: string; variant: string; seen: number }> = [
  { control: "button-dark", variant: "dark", seen: 19 },
  { control: "button-pill", variant: "pill", seen: 11 },
  { control: "button-outline", variant: "outline", seen: 6 },
  { control: "button-accent", variant: "accent", seen: 5 },
];
// [SCOPE 116 / T009] END

/** True for any value carrying a raw colour literal — hex, `rgb(`/`rgba(`, `hsl(`/`hsla(`. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function hasColorLiteral(value: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(value);
}
// [SCOPE 116 / T009] END

/** Extract a `{group.key}` reference, or null when the value is not a token reference. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function tokenRef(value: string): { group: string; key: string } | null {
  const match = value.trim().match(/^\{([a-z]+)\.([^}]+)\}$/);
  return match ? { group: match[1], key: match[2] } : null;
}
// [SCOPE 116 / T009] END

/** A CSS length/number safe to emit inside a Tailwind arbitrary value. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function isSafeLength(value: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|ch)?$/.test(value.trim());
}
// [SCOPE 116 / T009] END

/**
 * A collector for the substitutions a render performed, so DESIGN.md can be honest.
 *
 * Notes are deduplicated because the same substitution recurs across variants of one system
 * (twelve systems put `#ffffff` on a `button-dark`, and a system declaring both `button-dark`
 * and `button-pill` would otherwise report it twice), and a list that repeats itself reads as
 * noise the customer learns to skip.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export class NoteCollector {
  private readonly seen = new Set<string>();
  add(note: string): void {
    this.seen.add(note);
  }
  list(): string[] {
    return [...this.seen];
  }
}
// [SCOPE 116 / T009] END

/**
 * Resolve one colour-bearing value to a semantic Tailwind class.
 *
 * The one value passed through verbatim is `transparent`, which is a keyword rather than a
 * colour and has an exact Tailwind equivalent — reproducing it preserves the designer's
 * intent (a ghost button really is meant to have no fill) without emitting a literal.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function resolveColorClass(
  value: string,
  role: ColorRole,
  notes: NoteCollector,
  context: string,
): string | null {
  const raw = value.trim();
  if (raw === "" || raw === "none") return null;
  if (raw === "transparent") return `${ROLE_PREFIX[role]}transparent`;

  const ref = tokenRef(raw);
  if (ref && ref.group === "colors") {
    const semantic =
      COLOR_KEY_SEMANTICS[ref.key] ??
      (ref.key.startsWith("accent-") && !ref.key.startsWith("accent-on") ? "accent" : null);
    if (semantic) {
      if (ref.key === "success") {
        notes.add(`${context}: \`success\` has no shadcn semantic slot — mapped to \`primary\`.`);
      }
      return `${ROLE_PREFIX[role]}${semantic}`;
    }
    const fallback = ROLE_FALLBACK[role];
    notes.add(
      `${context}: colour key \`${ref.key}\` has no semantic equivalent — substituted \`${fallback}\`.`,
    );
    return `${ROLE_PREFIX[role]}${fallback}`;
  }

  // A raw literal, a gradient, or prose. All three are substituted rather than emitted.
  const fallback = ROLE_FALLBACK[role];
  if (hasColorLiteral(raw)) {
    notes.add(
      `${context}: the source declared the literal colour \`${raw}\` — substituted \`${fallback}\` ` +
        `so the control follows your theme instead of the captured palette.`,
    );
    return `${ROLE_PREFIX[role]}${fallback}`;
  }
  return null;
}
// [SCOPE 116 / T009] END

/** Resolve a `rounded` value to a radius class, via the `--ds-radius-*` custom properties. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function resolveRadiusClass(value: string, tokens: DesignSystemTokens): string | null {
  const raw = value.trim();
  if (raw === "" ) return null;
  const ref = tokenRef(raw);
  if (ref && ref.group === "rounded") {
    if (tokens.rounded[ref.key] === undefined) return null;
    return `rounded-[var(${dsVar("radius", ref.key)})]`;
  }
  if (raw === "0" || raw === "none") return "rounded-none";
  if (isSafeLength(raw)) return `rounded-[${raw}]`;
  return null;
}
// [SCOPE 116 / T009] END

/** Resolve a `typography` reference to the four per-role type classes. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function resolveTypeClasses(value: string, tokens: DesignSystemTokens): string[] {
  const ref = tokenRef(value.trim());
  if (!ref || ref.group !== "typography") return [];
  if (!tokens.typography[ref.key]) return [];
  const v = typeVars(ref.key);
  // `text-[length:…]` and `[font-weight:…]` use Tailwind's explicit type hints. Without them
  // `text-[var(--x)]` is ambiguous with a text COLOUR and `font-[var(--x)]` with a font
  // FAMILY, and Tailwind resolves both the wrong way — the size and weight silently vanish.
  return [
    `text-[length:var(${v.size})]`,
    `[font-weight:var(${v.weight})]`,
    `leading-[var(${v.leading})]`,
    `tracking-[var(${v.tracking})]`,
  ];
}
// [SCOPE 116 / T009] END

/** Resolve a padding shorthand (`0 14px`, `12px 14px`, `24px`) to Tailwind padding classes. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function resolvePaddingClasses(value: string): string[] {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0 || parts.length > 4) return [];
  if (!parts.every((p) => isSafeLength(p))) return [];
  const cls = (prefix: string, v: string): string => (v === "0" ? `${prefix}-0` : `${prefix}-[${v}]`);
  if (parts.length === 1) return [cls("p", parts[0])];
  if (parts.length === 2) return [cls("py", parts[0]), cls("px", parts[1])];
  if (parts.length === 3) return [cls("pt", parts[0]), cls("px", parts[1]), cls("pb", parts[2])];
  return [cls("pt", parts[0]), cls("pr", parts[1]), cls("pb", parts[2]), cls("pl", parts[3])];
}
// [SCOPE 116 / T009] END

/** Resolve a `shadow` value to an elevation class, never emitting the literal shadow. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function resolveShadowClass(
  value: string,
  tokens: DesignSystemTokens,
  notes: NoteCollector,
  context: string,
): string | null {
  const raw = value.trim();
  if (raw === "" || raw === "none") return "shadow-none";
  const ref = tokenRef(raw);
  if (ref && ref.group === "elevation") {
    if (tokens.elevation[ref.key] === undefined) return null;
    return `shadow-[var(${dsVar("elevation", ref.key)})]`;
  }
  // Literal shadows carry `rgba(` in every case measured across the pack, so they can never be
  // emitted. `shadow-sm` is the nearest theme-driven equivalent.
  if (hasColorLiteral(raw)) {
    notes.add(
      `${context}: the source declared a literal shadow \`${raw}\` — substituted \`shadow-sm\`.`,
    );
    return "shadow-sm";
  }
  return null;
}
// [SCOPE 116 / T009] END

/**
 * Resolve a `border` / `borderBottom` shorthand to width + colour classes.
 *
 * The colour half goes through `resolveColorClass` like any other colour, which is what keeps
 * `2px solid #ffffff` (Bang & Olufsen's outline button) from reaching the output.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function resolveBorderClasses(
  value: string,
  side: "all" | "bottom",
  notes: NoteCollector,
  context: string,
): string[] {
  const raw = value.trim();
  if (raw === "" || raw === "none") return side === "all" ? ["border-0"] : [];
  const widthMatch = raw.match(/^(-?\d+(?:\.\d+)?(?:px|rem|em)?)\s+\w+\s+(.+)$/);
  const prefix = side === "all" ? "border" : "border-b";
  if (!widthMatch) {
    // No parseable shorthand — the value may be a bare colour reference.
    const only = resolveColorClass(raw, "border", notes, context);
    return only ? [`${prefix}`, only] : [];
  }
  const [, width, colorPart] = widthMatch;
  const normalized = width.replace(/(px|rem|em)$/, "");
  const widthClass =
    width === "1px" || normalized === "1" ? prefix : `${prefix}-[${width}]`;
  const colorClass = resolveColorClass(colorPart, "border", notes, context);
  return colorClass ? [widthClass, colorClass] : [widthClass];
}
// [SCOPE 116 / T009] END

/**
 * Translate one control spec into a flat, deduplicated Tailwind class list.
 *
 * Properties the pack uses as PROSE rather than as CSS — `note`, `behavior`, `separation`,
 * `decoration`, `shape` — are skipped here and carried into DESIGN.md instead. They read like
 * values ("underline on hover", "circle (50%)", "sticky, translucent/blurred") but they are
 * design commentary, and emitting them would produce garbage class names.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function controlClasses(
  spec: ControlSpec,
  tokens: DesignSystemTokens,
  notes: NoteCollector,
  context: string,
): string {
  const out: string[] = [];
  const push = (...classes: Array<string | null>): void => {
    for (const c of classes) if (c) out.push(c);
  };

  for (const [prop, rawValue] of Object.entries(spec)) {
    const value = String(rawValue ?? "").trim();
    if (value === "") continue;
    switch (prop) {
      case "background":
      case "backgroundColor":
        push(resolveColorClass(value, "bg", notes, `${context}.${prop}`));
        break;
      case "textColor":
      case "color":
      case "activeText":
      case "activeTextColor":
        push(resolveColorClass(value, "text", notes, `${context}.${prop}`));
        break;
      case "placeholder":
      case "placeholderColor":
        push(resolveColorClass(value, "placeholder", notes, `${context}.${prop}`));
        break;
      case "border":
        push(...resolveBorderClasses(value, "all", notes, `${context}.${prop}`));
        break;
      case "borderBottom":
        push(...resolveBorderClasses(value, "bottom", notes, `${context}.${prop}`));
        break;
      case "rounded":
      case "itemRounded":
        push(resolveRadiusClass(value, tokens));
        break;
      case "typography":
      case "linkTypography":
      case "titleType":
      case "title":
        push(...resolveTypeClasses(value, tokens));
        break;
      case "padding":
      case "itemPadding":
        push(...resolvePaddingClasses(value));
        break;
      case "shadow":
        push(resolveShadowClass(value, tokens, notes, `${context}.${prop}`));
        break;
      case "height":
        if (isSafeLength(value)) push(`h-[${value}]`);
        break;
      case "minWidth":
        if (isSafeLength(value)) push(`min-w-[${value}]`);
        break;
      case "maxWidth":
        if (isSafeLength(value)) push(`max-w-[${value}]`);
        break;
      case "textTransform":
        if (value === "uppercase") push("uppercase");
        else if (value === "lowercase") push("lowercase");
        else if (value === "capitalize") push("capitalize");
        break;
      case "textDecoration":
        if (value === "underline") push("underline");
        else if (value === "none") push("no-underline");
        break;
      case "position":
        if (value === "sticky") push("sticky", "top-0");
        else if (value === "fixed") push("fixed", "top-0");
        break;
      case "fontWeight":
        if (/^\d{3}$/.test(value)) push(`[font-weight:${value}]`);
        break;
      default:
        // Everything else — prose notes, hover/focus states with no static equivalent, and
        // per-system one-offs — is deliberately not turned into a class.
        break;
    }
  }

  // Order-preserving dedupe. A spec can legitimately produce the same class twice (a control
  // declaring both `border` and a bare `hairline`), and a repeated class in generated source
  // reads as a bug to whoever opens the file.
  return [...new Set(out)].join(" ");
}
// [SCOPE 116 / T009] END

/** One emitted component file. */
export interface ControlFile {
  /** Bundle-relative path, e.g. `components/ui/button.tsx`. */
  path: string;
  /** The component's TSX source. */
  code: string;
}

/** What a control render produced, including everything DESIGN.md needs to be honest about. */
export interface ControlRenderResult {
  files: ControlFile[];
  /** Substitutions performed, for DESIGN.md. */
  notes: string[];
  /** Controls the system declares that were below threshold and therefore not generated. */
  documentedOnly: string[];
  /** Which button variants were emitted, for the end-to-end assertion. */
  buttonVariants: string[];
}

/** The generated-file banner. Names no brand — SCOPE-114 keeps `sourcebrand` out of artifacts. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
function banner(control: string): string[] {
  return [
    "// Generated by wxKanban (SCOPE-114 design-system bundle).",
    `// Geometry captured from the chosen design system's \`${control}\` specification.`,
    "// Colour resolves through shadcn semantic classes, so this control follows your",
    "// theme.css — recolouring in the Theme Studio updates it with no regeneration.",
    "",
  ];
}
// [SCOPE 116 / T009] END

/** The tiny local class-merge helper, so a generated file has no external dependency. */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
function cnHelper(): string[] {
  return [
    "function cn(...parts: Array<string | false | null | undefined>): string {",
    '  return parts.filter(Boolean).join(" ");',
    "}",
    "",
  ];
}
// [SCOPE 116 / T009] END

/**
 * Render `components/ui/button.tsx` — the core primary/secondary pair plus admitted extras.
 *
 * `button-secondary` is present in 42 of 50 systems. When a system does not declare it the
 * variant is still emitted, derived from the primary's geometry with a neutral semantic fill,
 * because a button component with no secondary is a gap the customer would have to fill by
 * hand — and the geometry needed to fill it correctly is exactly what we already hold.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
function renderButtonFile(
  tokens: DesignSystemTokens,
  notes: NoteCollector,
): { file: ControlFile; variants: string[] } {
  const comps = tokens.components;
  const variants: Array<[string, string]> = [];

  const primarySpec = comps["button-primary"];
  const primaryClasses = primarySpec
    ? controlClasses(primarySpec, tokens, notes, "button-primary")
    : "bg-primary text-primary-foreground";
  variants.push(["primary", primaryClasses]);

  const secondarySpec = comps["button-secondary"];
  if (secondarySpec) {
    variants.push(["secondary", controlClasses(secondarySpec, tokens, notes, "button-secondary")]);
  } else {
    // Derive from the primary's geometry, swapping only the colour half.
    const geometryOnly = controlClasses(
      Object.fromEntries(
        Object.entries(primarySpec ?? {}).filter(
          ([p]) => !["background", "backgroundColor", "textColor", "color", "border"].includes(p),
        ),
      ),
      tokens,
      notes,
      "button-secondary",
    );
    notes.add(
      "button-secondary: not declared by this system — derived from the primary button's " +
        "geometry with a neutral secondary fill.",
    );
    variants.push(["secondary", ["bg-secondary text-secondary-foreground", geometryOnly].filter(Boolean).join(" ")]);
  }

  for (const extra of ADMITTED_BUTTON_EXTRAS) {
    const spec = comps[extra.control];
    if (!spec) continue;
    variants.push([extra.variant, controlClasses(spec, tokens, notes, extra.control)]);
  }

  const code = [
    ...banner("button-*"),
    'import * as React from "react";',
    "",
    ...cnHelper(),
    "export const buttonVariants = {",
    ...variants.map(([name, classes]) => `  ${JSON.stringify(name)}: ${JSON.stringify(classes)},`),
    "} as const;",
    "",
    "export type ButtonVariant = keyof typeof buttonVariants;",
    "",
    "const base =",
    '  "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors " +',
    '  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +',
    '  "disabled:pointer-events-none disabled:opacity-50";',
    "",
    "export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {",
    "  variant?: ButtonVariant;",
    "}",
    "",
    "export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(",
    '  ({ className, variant = "primary", ...props }, ref) => (',
    "    <button ref={ref} className={cn(base, buttonVariants[variant], className)} {...props} />",
    "  ),",
    ");",
    'Button.displayName = "Button";',
    "",
  ].join("\n");

  return { file: { path: "components/ui/button.tsx", code }, variants: variants.map(([n]) => n) };
}
// [SCOPE 116 / T009] END

/** Render a single-variant control file (card, input, badge, nav). */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
function renderSimpleControl(opts: {
  control: string;
  fileName: string;
  componentName: string;
  element: string;
  baseClasses: string;
  fallbackClasses: string;
  tokens: DesignSystemTokens;
  notes: NoteCollector;
  extraProps?: string;
}): ControlFile {
  const spec = opts.tokens.components[opts.control];
  let classes: string;
  if (spec) {
    classes = controlClasses(spec, opts.tokens, opts.notes, opts.control);
  } else {
    classes = opts.fallbackClasses;
    opts.notes.add(
      `${opts.control}: not declared by this system — emitted a neutral, theme-driven default.`,
    );
  }

  const isInput = opts.element === "input";
  const propsType = isInput
    ? "React.InputHTMLAttributes<HTMLInputElement>"
    : `React.HTMLAttributes<HTML${opts.element === "nav" ? "Element" : "DivElement"}>`;
  const refType = isInput
    ? "HTMLInputElement"
    : opts.element === "nav"
      ? "HTMLElement"
      : "HTMLDivElement";

  const code = [
    ...banner(opts.control),
    'import * as React from "react";',
    "",
    ...cnHelper(),
    `export const ${opts.componentName.toLowerCase()}Classes = ${JSON.stringify(
      [opts.baseClasses, classes].filter(Boolean).join(" "),
    )};`,
    "",
    `export const ${opts.componentName} = React.forwardRef<${refType}, ${propsType}>(`,
    "  ({ className, ...props }, ref) => (",
    `    <${opts.element} ref={ref} className={cn(${opts.componentName.toLowerCase()}Classes, className)}${
      opts.extraProps ? ` ${opts.extraProps}` : ""
    } {...props} />`,
    "  ),",
    ");",
    `${opts.componentName}.displayName = ${JSON.stringify(opts.componentName)};`,
    "",
  ].join("\n");

  return { path: `components/ui/${opts.fileName}`, code };
}
// [SCOPE 116 / T009] END

/**
 * Render the full control set for one captured system.
 *
 * Always emits all five files. A system missing `card` or `badge-pill` (4 of 50) or
 * `button-secondary` (8 of 50) still gets a complete, usable component set — the gap is
 * filled from a neutral semantic default and reported in the notes, because shipping four
 * files and a silence would leave the customer to discover the hole themselves.
 */
// [SCOPE 116 / T009] BEGIN — Control renderers: 6 core files + threshold variants
export function renderControlFiles(tokens: DesignSystemTokens): ControlRenderResult {
  const notes = new NoteCollector();
  const { file: buttonFile, variants } = renderButtonFile(tokens, notes);

  const files: ControlFile[] = [
    buttonFile,
    renderSimpleControl({
      control: "card",
      fileName: "card.tsx",
      componentName: "Card",
      element: "div",
      baseClasses: "",
      fallbackClasses: "bg-card text-card-foreground border border-border rounded-[var(--radius)]",
      tokens,
      notes,
    }),
    renderSimpleControl({
      control: "text-input",
      fileName: "input.tsx",
      componentName: "Input",
      element: "input",
      baseClasses:
        "flex w-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      fallbackClasses: "bg-background text-foreground border border-input rounded-[var(--radius)]",
      tokens,
      notes,
    }),
    renderSimpleControl({
      control: "badge-pill",
      fileName: "badge.tsx",
      componentName: "Badge",
      element: "div",
      baseClasses: "inline-flex items-center",
      fallbackClasses: "bg-secondary text-secondary-foreground rounded-full",
      tokens,
      notes,
    }),
    renderSimpleControl({
      control: "nav-bar",
      fileName: "nav.tsx",
      componentName: "Nav",
      element: "nav",
      baseClasses: "flex w-full items-center",
      fallbackClasses: "bg-background text-foreground border-b border-border",
      tokens,
      notes,
    }),
  ];

  const generated = new Set<string>([
    "button-primary",
    "button-secondary",
    "card",
    "text-input",
    "badge-pill",
    "nav-bar",
    ...ADMITTED_BUTTON_EXTRAS.map((e) => e.control),
  ]);
  const documentedOnly = Object.keys(tokens.components).filter((c) => !generated.has(c));

  return { files, notes: notes.list(), documentedOnly, buttonVariants: variants };
}
// [SCOPE 116 / T009] END

/** The threshold, re-exported so DESIGN.md can explain the rule it applied. */
export { CONTROL_VARIANT_THRESHOLD, cssSafeKey };
