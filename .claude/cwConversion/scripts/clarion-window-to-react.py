#!/usr/bin/env python3
"""
clarion-window-to-react.py - Turn a Clarion WINDOW structure into a modern React + Tailwind +
shadcn/ui component, with embed code wired as handler stubs.

Input : pre-convert/<proc>.controls.md  (the verbatim WINDOW ... END inside a ```clarion fence).
        The sibling pre-convert/<proc>.page.md is also read (if present) to recover embed/event code.
Output: rebuild/pages/<proc>.tsx                 - the component
        scratch-render/<proc>.preview.html       - a Tailwind-CDN preview (node render.mjs -> PNG)

The Clarion control language is regular: `KEYWORD(args),ATTR(args),...` one per line, nested via
SHEET/TAB/GROUP/OPTION/MENUBAR/TOOLBAR/MENU ... END. Controls with no shadcn primitive are flagged
inline {/* GAP: ... */} — see references/clarion-gaps.md. This is a SCAFFOLD: data binding for LIST
(browse) grids and embed logic are emitted as TODOs, never silently invented.

Usage:
    python scripts/clarion-window-to-react.py --page pre-convert/UpdateCustomer.controls.md --out rebuild/pages
"""
import argparse
import os
import re

FENCE_RE = re.compile(r"```clarion\n(.*?)```", re.S)
OPENERS = {"WINDOW", "SHEET", "TAB", "GROUP", "OPTION", "MENUBAR", "MENU", "TOOLBAR", "ITEMIZE"}


def fence_body(path):
    if not path or not os.path.exists(path):
        return ""
    m = FENCE_RE.search(open(path, encoding="utf-8").read())
    return m.group(1) if m else ""


def attr(line, name):
    """Return the inside of NAME(...) in line, honoring one level of nested parens; else None."""
    m = re.search(rf"\b{name}\s*\(", line, re.I)
    if not m:
        return None
    i = m.end()
    depth, out = 1, []
    while i < len(line) and depth:
        c = line[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                break
        out.append(c)
        i += 1
    return "".join(out)


def join_continuations(text):
    """Clarion continues a statement onto the next physical line when it ends with `|` (often `, |`
    or `& |`). Merge those so each control is one logical line before parsing."""
    out, buf = [], ""
    for ln in text.split("\n"):
        cur = (buf + ln.rstrip()) if buf else ln.rstrip()
        if cur.rstrip().endswith("|"):
            buf = cur.rstrip()[:-1].rstrip() + " "
        else:
            out.append(cur)
            buf = ""
    if buf:
        out.append(buf)
    return "\n".join(out)


CONTROL_KINDS = {
    "PROMPT", "ENTRY", "BUTTON", "STRING", "TEXT", "CHECK", "LIST", "COMBO", "SPIN", "IMAGE",
    "REGION", "BOX", "LINE", "ELLIPSE", "PANEL", "OPTION", "RADIO", "PROGRESS", "SLIDER",
    "CUSTOM", "DROPLIST", "DROPCOMBO",
}
KNOWN_KINDS = CONTROL_KINDS | OPENERS


def control_kind(s):
    """Return (kind, is_labeled). Clarion controls are bare `ENTRY(...)`; structures are usually
    labeled `QuickWindow WINDOW(...)`. Window-local data decls (`CurrentTab STRING(80)`) and bare
    attribute lines (`CENTER`) are not controls -> (None, _)."""
    toks = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", s)
    if not toks:
        return None, False
    first = toks[0].upper()
    if first in KNOWN_KINDS:
        return first, False
    second = toks[1].upper() if len(toks) > 1 else ""
    if second in OPENERS:               # labeled structure: `Label WINDOW(...)`
        return second, True
    return None, False                  # data declaration or attribute-only line


def parse_controls(text):
    """Return a flat list of dict(kind, depth, caption, picture, use, frm, fmt, at, raw)."""
    rows = []
    depth = 0
    for ln in join_continuations(text).split("\n"):
        s = ln.strip()
        if not s or s.startswith("!"):
            continue
        if re.match(r"END\b|\.$", s):
            depth = max(0, depth - 1)
            continue
        kind, _ = control_kind(s)
        if kind is None:
            continue
        lead = (attr(s, kind) or "").strip()
        caption = picture = None
        if lead.startswith("@"):
            picture = lead.split(",")[0].strip()
        elif lead:
            caption = lead.split(",")[0].strip().strip("'\"")
        rows.append(dict(
            kind=kind, depth=depth,
            caption=caption, picture=picture,
            use=(attr(s, "USE") or "").strip("?'\" "),
            frm=(attr(s, "FROM") or "").strip("'\" "),
            fmt=attr(s, "FORMAT"),
            at=attr(s, "AT"),
            raw=s,
        ))
        if kind in OPENERS:
            depth += 1
    return rows


def ident(use, fallback):
    base = re.sub(r"[^A-Za-z0-9]", "", use or "") or fallback
    return base[0].upper() + base[1:] if base else fallback


# Clarion control -> (jsx_factory). jsx returns the element string given the row + indent.
def jsx_for(row, handlers):
    k = row["kind"]
    cap = row["caption"] or row["use"] or ""
    use = row["use"]
    fmt_hint = f' placeholder="{row["picture"]}"' if row.get("picture") else ""
    if k == "PROMPT":
        return f'<Label>{cap}</Label>'
    if k in ("ENTRY",):
        return f'<Input name="{use}"{fmt_hint} /> {{/* {row["picture"] or ""} */}}'.rstrip()
    if k == "TEXT":
        return f'<Textarea name="{use}" />'
    if k == "BUTTON":
        h = f"on{ident(use, 'Button')}"
        handlers.add(h)
        return f'<Button onClick={{{h}}}>{cap or "Button"}</Button>'
    if k == "STRING":
        return f'<span className="text-sm">{cap}</span>'
    if k == "CHECK":
        return f'<div className="flex items-center gap-2"><Checkbox name="{use}" /><Label>{cap}</Label></div>'
    if k in ("COMBO", "DROPLIST", "DROPCOMBO"):
        return (f'{{/* GAP: Clarion {k} {use} — bind options from its FROM()/dictionary source */}}\n'
                f'      <Select><SelectTrigger><SelectValue placeholder="{cap or use}" /></SelectTrigger></Select>')
    if k in ("OPTION", "RADIO"):
        return f'{{/* OPTION group {use} — render as <RadioGroup> with the child RADIOs */}}'
    if k == "SPIN":
        return f'<Input type="number" name="{use}"{fmt_hint} />'
    if k == "LIST":
        cols = row.get("fmt") or ""
        return (f'{{/* GAP: Clarion browse LIST {use} (FROM {row["frm"] or "?"}) — replace with a '
                f'data grid (see references/clarion-gaps.md). FORMAT: {cols[:80]} */}}\n'
                f'      <Table><TableHeader><TableRow><TableHead>TODO columns</TableHead></TableRow>'
                f'</TableHeader><TableBody /></Table>')
    if k == "IMAGE":
        return f'{{/* GAP: IMAGE {use} */}} <div className="bg-muted rounded h-24" />'
    if k == "TAB":
        return None  # handled by container logic
    if k in ("BOX", "LINE", "ELLIPSE", "REGION", "PANEL"):
        return f'{{/* decorative {k} {use} — omitted */}}'
    return f'{{/* GAP: unmapped Clarion control {k} {use} */}}'


def build_jsx(rows, handlers):
    """Render controls; SHEET -> Tabs, TAB -> a section heading (kept simple & idiomatic)."""
    out = []
    tab_open = False
    for r in rows:
        if r["kind"] == "SHEET":
            out.append('      <div className="space-y-4">')
            continue
        if r["kind"] == "TAB":
            if tab_open:
                out.append('      </section>')
            out.append(f'      <section className="space-y-2">')
            out.append(f'        <h3 className="font-medium">{r["caption"] or "Tab"}</h3>')
            tab_open = True
            continue
        if r["kind"] in ("GROUP",):
            out.append(f'      <fieldset className="border rounded p-3 space-y-2">'
                       f'<legend className="text-sm px-1">{r["caption"] or ""}</legend>')
            continue
        el = jsx_for(r, handlers)
        if el:
            out.append("      " + el)
    if tab_open:
        out.append('      </section>')
    return "\n".join(out)


def recover_embeds(page_text):
    """Pull EMBED / event blocks out of the procedure source for the developer to port."""
    blocks = []
    lines = page_text.split("\n")
    i = 0
    while i < len(lines):
        if re.match(r"\s*\[?EMBED", lines[i], re.I) or re.search(r"\bACCEPTED\b|\bSELECTED\b", lines[i]):
            chunk = lines[i:i + 12]
            blocks.append("\n".join(c.rstrip() for c in chunk))
            i += 12
        else:
            i += 1
    return blocks[:40]


TEMPLATE = """// Generated by cwConversion (clarion-window-to-react.py). SCAFFOLD — review before use.
// Source window: {title}
import {{ Button }} from "@/components/ui/button";
import {{ Input }} from "@/components/ui/input";
import {{ Label }} from "@/components/ui/label";
import {{ Checkbox }} from "@/components/ui/checkbox";
import {{ Textarea }} from "@/components/ui/textarea";
import {{ Select, SelectTrigger, SelectValue }} from "@/components/ui/select";
import {{ Table, TableHeader, TableBody, TableRow, TableHead }} from "@/components/ui/table";

export default function {comp}() {{
{handler_stubs}
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
{body}
    </div>
  );
}}
{embed_comment}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True, help="pre-convert/<proc>.controls.md")
    ap.add_argument("--out", default="rebuild/pages")
    ap.add_argument("--preview-out", default="scratch-render")
    args = ap.parse_args()

    base = os.path.basename(args.page).split(".")[0]
    text = fence_body(args.page)
    rows = parse_controls(text)
    win = next((r for r in rows if r["kind"] == "WINDOW"), None)
    title = (win["caption"] if win and win["caption"] else base)

    handlers = set()
    body = build_jsx([r for r in rows if r["kind"] != "WINDOW"], handlers)

    page_md = args.page.replace(".controls.md", ".page.md")
    embeds = recover_embeds(fence_body(page_md))
    stubs = []
    for h in sorted(handlers):
        stubs.append(f"  async function {h}() {{\n    // TODO: port the Clarion embed for this "
                     f"control to an API call.\n  }}")
    embed_comment = ""
    if embeds:
        joined = "\n\n".join(embeds)
        embed_comment = "/* ----- Recovered Clarion embed/event code (port to handlers/server) -----\n" \
                        + joined.replace("*/", "* /") + "\n----- end recovered embeds ----- */"

    comp = ident(base, "Page")
    tsx = TEMPLATE.format(title=title, comp=comp,
                          handler_stubs="\n".join(stubs),
                          body=body, embed_comment=embed_comment)
    os.makedirs(args.out, exist_ok=True)
    out_path = os.path.join(args.out, f"{base}.tsx")
    open(out_path, "w", encoding="utf-8").write(tsx)

    # minimal Tailwind-CDN preview
    os.makedirs(args.preview_out, exist_ok=True)
    prev = (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<script src="https://cdn.tailwindcss.com"></script></head>'
            f'<body class="bg-slate-50"><div class="mx-auto max-w-3xl p-6 space-y-3">'
            f'<h2 class="text-xl font-semibold">{title}</h2>'
            + "".join(f'<div class="text-sm text-slate-600">{r["kind"]} '
                      f'{r["caption"] or r["use"] or ""}</div>'
                      for r in rows if r["kind"] not in ("WINDOW", "END"))
            + '</div></body></html>')
    prev_path = os.path.join(args.preview_out, f"{base}.preview.html")
    open(prev_path, "w", encoding="utf-8").write(prev)

    gaps = sum(1 for r in rows if r["kind"] in ("LIST", "COMBO", "DROPLIST", "DROPCOMBO", "IMAGE"))
    print(f"{base}: {len(rows)} controls  handlers={len(handlers)}  gaps={gaps}  embeds={len(embeds)}")
    print(f"  -> {out_path}")
    print(f"  -> {prev_path}")


if __name__ == "__main__":
    main()
