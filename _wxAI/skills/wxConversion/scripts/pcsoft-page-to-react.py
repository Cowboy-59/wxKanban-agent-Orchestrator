#!/usr/bin/env python3
"""
pcsoft-page-to-react.py - Generate a stack-native screen scaffold from a converted
PCSoft WebDev page.

Input : pre-convert/<PAGE>.controls.md  (control-property dump produced by pcsoft-doc-split.py)
Output: <out>/<PAGE>.tsx          - React + Tailwind + shadcn/ui component (the deliverable)
        <out>/<PAGE>.preview.html - Tailwind-CDN standalone preview (for screenshot)

It parses the flat control dump into a control tree (zones > cells/templates > controls,
tables > columns), infers each control's kind from its WinDev name prefix, recovers captions /
column titles / sizes, and renders the structure in the project stack
(stack.md: React+Vite, Tailwind, shadcn/ui; primary #4f46e5 indigo, radius 0.5rem).

Captions stored as the multilingual placeholder "GB" (no literal in the doc) are flagged
with a `// TODO caption` marker and a humanized fallback derived from the control name.

Usage:
    python scripts/pcsoft-page-to-react.py --page pre-convert/PAGE_ManageUsers.controls.md --out rebuild/pages
"""
import argparse
import os
import re
import sys

# ---- control grammar -----------------------------------------------------------------

PREFIX_KIND = {
    "ZONE": "zone", "CELL": "cell", "CTPL": "template", "TPLC": "template", "TPL": "template",
    "TABLE": "table", "COL": "column", "LOOP": "looper", "ATT": "attribute",
    "EDT": "input", "SAIT": "input", "BTN": "button", "IMG": "image", "STC": "static",
    "LIB": "static", "LINK": "link", "COMBO": "select", "SELECT": "select",
    "CBOX": "checkbox", "CHK": "checkbox", "RADIO": "radio", "MENU": "menu",
    "PGB": "progress", "CPTCH": "captcha",
    "RTA": "richtext", "HTM": "richtext", "GAL": "gallery", "GR": "groupbox",
    "POPUP": "popup", "OPT": "radio",
}

# Only these prefixes denote real UI controls. This excludes style names (Titre_Site,
# Normal_Gras), value fragments (eenVolution.png), and non-control refs (WW_, PAGE_, TXT_,
# REGLE_) that otherwise look like headers because a property keyword follows them.
CONTROL_PREFIXES = set(PREFIX_KIND)

# Property labels that mark the *start of a new key* (mined from the dumps).
PROP_KEYS = {
    "Width", "Height", "Visible", "Background image", "Note", "Note title", "Min width.",
    "Plane(s) containing the control", "Generate if invisible", "Hover cursor", "State",
    "Min. Height", "Max. width", "Horizontal position of background image",
    "Vertical position of background image", "Fixed position of background image",
    "Background image mode", "Style top border", "Overlayable", "Style left border",
    "Style right border", "Style bottom border", "X position", "Y position",
    "DnD Target", "DnD Source", "Context menu", "Left margin", "Right margin", "Top margin",
    "Bottom margin", "Move by background", "Remember position", "Tooltip", "Message",
    "Tab order", "Unicode", "TAB Key", "Caption", "Image", "Anchor", "Auto line wrap.",
    "Ellipse", "Load progress bar", "Anti repeat", "Image set", "Nb anim. steps",
    "Initial value", "Hover image", "Appearance", "Caption generated in the image",
    "Dynamic background color", "Use image set", "Nb States", "Generate image set",
    "Validation button", "Horz. Alignment", "Vert. Alignment", "Manage planes",
    "Delayed planes", "Nb. rows", "Top padding", "Bottom padding", "Left padding",
    "Right padding", "Blank if zero", "Title", "Password", "Input mask", "NULL if empty",
    "Type", "Sorted", "Group", "Alias", "HTMLBefore", "HTMLAfter", "HTMLClass",
    "Semantics (HTML5)", "Empty", "Clickable area", "Transparency", "Tranparency",
    "Alt. Text", "Controls", "Direction", "Default value", "Caption", "Keyword",
}

NAME_RE = re.compile(r"^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*$")
PREFIX_RE = re.compile(r"^([A-Za-z]+)_")


def kind_of(seg: str) -> str:
    m = PREFIX_RE.match(seg)
    if m and m.group(1).upper() in PREFIX_KIND:
        return PREFIX_KIND[m.group(1).upper()]
    return "static" if seg.startswith("STC") else "control"


# Control kinds with NO shadcn/ui primitive -> recommended library (see rebuild/COMPONENT-GAPS.md)
GAP_RECO = {
    "table":   "data grid: TanStack Table + shadcn data-table (MIT)",
    "looper":  "data grid: TanStack Table + shadcn data-table (MIT)",
    "richtext": "WYSIWYG: TipTap (MIT); email builder: GrapesJS/Unlayer",
    "gallery": "image viewer: Yet Another React Lightbox (MIT)",
    "upload":  "react-dropzone + papaparse (CSV) / FilePond (images)",
    "captcha": "Cloudflare Turnstile (free) via @marsidev/react-turnstile",
    "chart":   "shadcn/ui Charts (Recharts, MIT)",
}


def humanize(seg: str) -> str:
    base = re.sub(r"^[A-Za-z]+_", "", seg)
    base = base.replace("_", " ").strip()
    return base[:1].upper() + base[1:] if base else seg


def is_control_header(lines, i):
    s = lines[i].strip()
    if not s or not NAME_RE.match(s) or " " in s:
        return False
    last = s.split(".")[-1]
    m = PREFIX_RE.match(last)
    if not m or m.group(1).upper() not in CONTROL_PREFIXES:
        return False
    nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
    return nxt in PROP_KEYS


def read_value(block, key):
    """Return the literal value after `key` (skipping the 'GB' multilingual marker)."""
    for j, l in enumerate(block):
        if l.strip() == key:
            vals = []
            for k in range(j + 1, len(block)):
                v = block[k].strip()
                if v == "GB":
                    continue
                if v in PROP_KEYS:
                    break
                if v == "":
                    break
                vals.append(v)
            return " ".join(vals).strip()
    return ""


def parse_controls(path):
    raw = open(path, encoding="utf-8").read().split("\n")
    # drop our own md header/comment lines
    lines = [l for l in raw if not l.startswith("#") and not l.startswith("_")
             and not l.startswith("<!--")]
    headers = [i for i in range(len(lines)) if is_control_header(lines, i)]
    nodes = {}
    order = 0
    for s, e in zip(headers, headers[1:] + [len(lines)]):
        full = lines[s].strip()
        block = lines[s:e]
        seg = full.split(".")[-1]
        def num(key):
            v = read_value(block, key)
            m = re.match(r"-?\d+", v or "")
            return int(m.group()) if m else None

        node = dict(
            path=full, seg=seg, kind=kind_of(seg),
            caption=read_value(block, "Caption"),
            title=read_value(block, "Title"),
            state=read_value(block, "State"),
            visible=read_value(block, "Visible"),
            width=read_value(block, "Width"),
            password=("Password" in block),
            x=num("X position"), y=num("Y position"),
            order=order, children=[],
        )
        nodes[full] = node
        order += 1

    # synthesize any missing ancestor containers from the dotted paths
    def ensure(path, order):
        if path not in nodes:
            seg = path.split(".")[-1]
            nodes[path] = dict(path=path, seg=seg, kind=kind_of(seg), caption="",
                               title="", state="", visible="", width="",
                               password=False, x=None, y=None,
                               order=order, children=[], synth=True)
        return nodes[path]

    for full in list(nodes):
        parts = full.split(".")
        for i in range(1, len(parts)):
            ensure(".".join(parts[:i]), nodes[full]["order"] - 0.5)

    # attach every node to its immediate parent; '.'-free paths are page roots
    roots = []
    for full, node in list(nodes.items()):
        if "." in full:
            nodes[".".join(full.split(".")[:-1])]["children"].append(node)
        else:
            roots.append(node)

    # Order siblings by on-screen geometry (Y then X from the dump), falling back to
    # document order when a control has no coordinates. Containers inherit the top-left
    # of their earliest/highest child so zones sort correctly too.
    BIG = 10 ** 9

    def layout_key(n):
        y = n["y"] if n["y"] is not None else BIG
        x = n["x"] if n["x"] is not None else BIG
        return (y, x, n["order"])

    def fix(n):
        for c in n["children"]:
            fix(c)
        if n["children"]:
            ys = [c["y"] for c in n["children"] if c["y"] is not None]
            xs = [c["x"] for c in n["children"] if c["x"] is not None]
            if n["y"] is None and ys:
                n["y"] = min(ys)
            if n["x"] is None and xs:
                n["x"] = min(xs)
            n["order"] = min([n["order"]] + [c["order"] for c in n["children"]])
        n["children"].sort(key=layout_key)
    for r in roots:
        fix(r)
    # popups are modal overlays (Y=0) — keep them out of the main flow, render last
    roots.sort(key=lambda n: (n["kind"] == "popup", layout_key(n)))
    return roots, nodes


# ---- vnode model + dual serializers --------------------------------------------------

class V:
    def __init__(self, el, cls="", text="", attrs=None, children=None, shadcn=None,
                 todo=False, handler=None):
        self.el, self.cls, self.text = el, cls, text
        self.attrs = attrs or {}
        self.children = children or []
        self.shadcn = shadcn   # shadcn component name for JSX backend
        self.todo = todo       # caption needs human review
        self.handler = handler  # name of the ported event-handler fn (JSX onClick)


# --- WLanguage event handlers extracted from the controls dump -------------------------
# Each block looks like:  "Click on BTN_X ( CTPL_Y ) (server) ..."  followed by code lines.
HANDLER_RE = re.compile(r"^([A-Z][\w ]*?) (?:on|of|in) (\w+)\s*\(")
HANDLERS = {}        # control seg -> list of (event, [code lines])
HANDLERS_USED = {}   # handler fn name -> (seg, event, code) actually wired this page


def parse_handlers(*paths):
    """Extract WLanguage event-handler blocks from any of the given files (controls + page)."""
    HANDLERS.clear()
    for path in paths:
        if not path or not os.path.exists(path):
            continue
        lines = [l.rstrip() for l in open(path, encoding="utf-8").read().split("\n")]
        cur = None
        for l in lines:
            m = HANDLER_RE.match(l.strip())
            if m and re.match(r"^[A-Z]{2,}\w*_", m.group(2)):   # 2nd token is a control name
                event, seg = m.group(1).strip(), m.group(2)
                cur = [seg, event, []]
                HANDLERS.setdefault(seg, []).append((event, cur[2]))
            elif cur is not None:
                if l.strip().startswith("## "):   # next doc section ends the block
                    cur = None
                    continue
                if l.strip():
                    cur[2].append(l)


def handler_for(seg):
    """Return (fn_name, event, code) for the first handler of a control, or None."""
    hs = HANDLERS.get(seg)
    if not hs:
        return None
    event, code = hs[0]
    fn = f"on{seg}"
    HANDLERS_USED[fn] = (seg, event, code)
    return fn


def label(node):
    cap = node["caption"] or node["title"]
    if cap and cap.upper() != "GB":
        return cap, False
    return humanize(node["seg"]), True   # fallback + todo flag


GAPS_HIT = set()  # gap kinds encountered while rendering the current page


# WebDev skin/utility controls that carry no app meaning (hidden default-submit, theme
# color swatches, layout rulers/separators) — dropped from the modern output.
SKIP_RE = re.compile(r"^(BTN_Defaut|BTN_Couleur|REGLE_|HR_|MENU_Separateur)", re.I)


def build_vnode(node):
    if node["path"] in LIFTED or SKIP_RE.match(node["seg"]):
        return None
    k = node["kind"]
    lbl, todo = label(node)
    if k in GAP_RECO and k not in ("table", "looper"):
        GAPS_HIT.add(k)
        return V("div", "wx-gap", text=f"[{node['seg']}] {GAP_RECO[k]}", attrs={"data-gap": k})
    if k == "popup":
        kids = [build_vnode(c) for c in node["children"]]
        title = V("summary", "wx-popup-h", text=f"Dialog: {humanize(node['seg'])}")
        return V("details", "wx-popup", children=[title] + [x for x in kids if x])
    if k in ("zone", "cell", "template", "groupbox"):
        kids = [x for x in (build_vnode(c) for c in node["children"]) if x]
        if not kids:
            return None
        if re.search(r"Action|Toolbar|Barre|ACTIONS", node["seg"], re.I):
            return V("div", "wx-toolbar", children=kids)          # action bar -> toolbar
        if k in ("cell", "template", "groupbox"):
            return V("div", "wx-card", children=kids)             # container -> Card
        sem = "footer" if node["seg"].endswith("Footer") else "section"
        return V(sem, "wx-zone", children=kids)
    if k == "table":
        cols = [c for c in node["children"] if c["kind"] == "column"]
        return build_table(node, cols)
    if k == "looper":
        kids = [build_vnode(c) for c in node["children"]]
        return V("div", "wx-looper", children=[x for x in kids if x])
    if k == "static":
        return V("p", "wx-static", text=lbl, todo=todo)
    if k == "link":
        return V("a", "wx-link", text=lbl, attrs={"href": "#"}, todo=todo,
                 handler=handler_for(node["seg"]))
    if k == "button":
        return V("button", "wx-btn", text=lbl, shadcn="Button", todo=todo,
                 handler=handler_for(node["seg"]))
    if k == "input":
        t = "password" if node["password"] else \
            "email" if "Email" in node["seg"] else \
            "number" if re.search(r"Nb|Number|Count", node["seg"]) else "text"
        return V("input", "wx-input", attrs={"type": t, "placeholder": lbl},
                 shadcn="Input", todo=todo)
    if k == "select":
        return V("select", "wx-input", shadcn="Select",
                 children=[V("option", text="…")], todo=todo)
    if k == "checkbox":
        return V("label", "wx-check", text=lbl,
                 children=[V("input", attrs={"type": "checkbox"})], todo=todo)
    if k == "radio":
        return V("label", "wx-check", text=lbl,
                 children=[V("input", attrs={"type": "radio"})], todo=todo)
    if k == "image":
        return V("div", "wx-logo", attrs={"title": node["seg"]})
    if k == "menu":
        items = [c for c in node["children"] if c["caption"] or c["children"]]
        if not items:
            return V("div", "wx-sep")  # separator / empty menu -> thin divider
        kids = [V("a", "wx-tab", text=label(c)[0], attrs={"href": "#"}) for c in items]
        return V("nav", "wx-menu", children=kids)
    if k == "captcha":
        return V("div", "wx-static", text="[captcha]")
    # default: ignore pure layout leaves with no caption
    if node["children"]:
        return V("div", "", children=[build_vnode(c) for c in node["children"]])
    return None


LIFTED = set()  # node paths pulled out of the inline flow (menus -> top nav)


def collect_menus(node, out):
    if node["kind"] == "menu":
        out.append(node)
        LIFTED.add(node["path"])
        return  # don't descend into menu items
    for c in node["children"]:
        collect_menus(c, out)


def build_page(roots):
    """Assemble a modern app shell: app-bar + top nav + main + footer + dialogs."""
    LIFTED.clear()
    header = next((r for r in roots if r["kind"] == "zone"
                   and r["seg"].endswith("Header")), None)
    footer = next((r for r in roots if r["kind"] == "zone"
                   and r["seg"].endswith("Footer")), None)
    popups = [r for r in roots if r["kind"] == "popup"]
    used = {id(x) for x in ([header, footer] + popups) if x}
    main_roots = [r for r in roots if id(r) not in used]

    # lift every menu (even nested) into a single top nav
    menus = []
    for r in roots:
        collect_menus(r, menus)
    nav_items = []
    for m in menus:
        for c in m["children"]:
            if c["caption"] or c["children"]:
                nav_items.append(V("a", "wx-tab", text=label(c)[0], attrs={"href": "#"}))

    sections = []
    # --- app bar: split logo/title (left) from connection/links (right)
    if header:
        left, right = [], []
        for c in header["children"]:
            tgt = right if (c["kind"] == "link" or "Connection" in c["seg"]) else left
            v = build_vnode(c)
            if v:
                tgt.append(v)
        sections.append(V("header", "wx-appbar", children=[
            V("div", "wx-appbar-left", children=left),
            V("div", "wx-appbar-right", children=right)]))
    if nav_items:
        sections.append(V("nav", "wx-menu", children=nav_items))
    # --- main
    main_kids = [x for x in (build_vnode(r) for r in main_roots) if x]
    sections.append(V("main", "wx-main", children=main_kids))
    # --- footer
    if footer:
        fk = [x for x in (build_vnode(c) for c in footer["children"]) if x]
        sections.append(V("footer", "wx-footer-bar", children=fk))
    # --- dialogs (popups)
    if popups:
        dk = [x for x in (build_vnode(p) for p in popups) if x]
        sections.append(V("section", "wx-dialogs", children=dk))
    return V("div", "wx-page", children=sections)


def build_table(node, cols):
    GAPS_HIT.add("table")
    head = V("tr", children=[
        V("th", "wx-th", text=(label(c)[0]), todo=label(c)[1]) for c in cols] or
        [V("th", "wx-th", text="Column")])
    # 4 sample rows
    rows = []
    for r in range(4):
        rows.append(V("tr", "wx-tr", children=[
            V("td", "wx-td", text=f"{label(c)[0]} {r+1}") for c in cols]))
    return V("table", "wx-table", shadcn="Table", children=[
        V("thead", children=[head]),
        V("tbody", children=rows),
    ])


# ---- HTML preview serializer ---------------------------------------------------------

TW = {  # Tailwind class map for the preview (project tokens; primary = indigo-600)
    "wx-zone": "px-7",
    "wx-looper": "space-y-2",
    "wx-static": "text-sm text-slate-600 my-2",
    "wx-link": "text-indigo-600 hover:underline text-sm",
    "wx-btn": "inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm "
              "font-medium text-white hover:bg-indigo-700 mr-2",
    "wx-input": "w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 text-sm "
                "outline-none focus:ring-2 focus:ring-indigo-500 mb-2",
    "wx-check": "inline-flex items-center gap-2 text-sm text-slate-600 mr-4",
    "wx-logo": "h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-sky-400",
    "wx-menu": "flex gap-1 rounded-lg bg-indigo-600 overflow-hidden my-3",
    "wx-tab": "flex-1 text-center text-white text-sm px-3 py-3 hover:bg-indigo-700",
    "wx-table": "w-full border-collapse rounded-lg overflow-hidden border border-slate-200 my-3",
    "wx-th": "bg-indigo-600 text-white text-left text-sm font-medium px-3 py-2",
    "wx-tr": "odd:bg-white even:bg-slate-50 hover:bg-indigo-50",
    "wx-td": "px-3 py-2 text-sm text-slate-700 border-t border-slate-100",
    "wx-gap": "my-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 "
              "px-3 py-2 text-xs text-amber-800",
    "wx-popup": "my-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2",
    "wx-popup-h": "cursor-pointer text-sm font-medium text-slate-500",
    "wx-sep": "my-3 border-t border-slate-200",
    # modern app shell
    "wx-page": "min-h-screen bg-slate-50",
    "wx-appbar": "flex items-center justify-between border-b border-slate-200 bg-white "
                 "px-6 py-3 sticky top-0 z-10",
    "wx-appbar-left": "flex items-center gap-3",
    "wx-appbar-right": "flex items-center gap-4 text-sm text-slate-500",
    "wx-main": "mx-auto max-w-6xl px-6 py-6 space-y-5",
    "wx-card": "rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3",
    "wx-toolbar": "flex flex-wrap items-center gap-2",
    "wx-footer-bar": "mx-auto max-w-6xl px-6 py-6 text-center text-xs text-slate-400",
    "wx-dialogs": "mx-auto max-w-6xl px-6 pb-8 space-y-2",
}


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def to_html(v, depth=0):
    if v is None:
        return ""
    pad = "  " * depth
    cls = TW.get(v.cls, "")
    attrs = "".join(f' {k}="{esc(val)}"' for k, val in v.attrs.items())
    cattr = f' class="{cls}"' if cls else ""
    inner = esc(v.text)
    if v.children:
        inner += "\n" + "\n".join(to_html(c, depth + 1) for c in v.children if c) + "\n" + pad
    if v.el in ("input",):
        return f'{pad}<{v.el}{cattr}{attrs}>'
    return f"{pad}<{v.el}{cattr}{attrs}>{inner}</{v.el}>"


def render_html(page, roots):
    body = to_html(build_page(roots), 1)
    return f"""<!DOCTYPE html>
<!-- PREVIEW of {page} regenerated in project stack (Tailwind tokens; primary indigo).
     The deliverable is {page}.tsx (React + shadcn/ui). -->
<html lang="en"><head><meta charset="utf-8"><title>{page}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;}}</style>
</head>
<body>
{body}
</body></html>
"""


# ---- React (shadcn) serializer -------------------------------------------------------

def to_jsx(v, depth=2):
    if v is None:
        return ""
    pad = "  " * depth
    cls = TW.get(v.cls, "")
    todo = "  {/* TODO caption */}" if v.todo else ""
    if v.cls == "wx-gap":
        return (f'{pad}{{/* GAP: {esc(v.text)} — see rebuild/COMPONENT-GAPS.md */}}\n'
                f'{pad}<div className="{cls}">{esc(v.text)}</div>')
    if v.shadcn == "Button":
        oc = f" onClick={{{v.handler}}}" if v.handler else ""
        return f'{pad}<Button className="{cls}"{oc}>{esc(v.text)}</Button>{todo}'
    if v.shadcn == "Input":
        ph = v.attrs.get("placeholder", "")
        ty = v.attrs.get("type", "text")
        return f'{pad}<Input type="{ty}" placeholder="{esc(ph)}" />{todo}'
    if v.shadcn == "Select":
        return f'{pad}<Select>{{/* options */}}</Select>{todo}'
    attrs = "".join(f' {("className" if k=="class" else k)}="{esc(val)}"'
                    for k, val in v.attrs.items())
    cattr = f' className="{cls}"' if cls else ""
    oc = f" onClick={{{v.handler}}}" if v.handler else ""
    if v.el == "input":
        return f'{pad}<input{cattr}{attrs} />'
    inner = esc(v.text)
    if v.children:
        inner = "\n" + "\n".join(to_jsx(c, depth + 1) for c in v.children if c) + f"\n{pad}"
    return f"{pad}<{v.el}{cattr}{attrs}{oc}>{inner}</{v.el}>{todo}"


PROC_RE = re.compile(r"\b((?:NL_|SET_|COL_)\w+)\s*\(")


def emit_handlers():
    """Render ported-from-WLanguage handler stubs + the server procedures they call."""
    if not HANDLERS_USED:
        return "", set()
    out, procs = [], set()
    for fn, (seg, event, code) in HANDLERS_USED.items():
        for ln in code:
            procs.update(PROC_RE.findall(ln))
        wl = "\n".join(f"  //   {ln}" for ln in code) or "  //   (no code captured)"
        out.append(
            f"  // {event} on {seg} — ported from WLanguage (server). TODO: implement.\n"
            f"  async function {fn}() {{\n"
            f"  // --- original WLanguage ---\n{wl}\n"
            f"    // TODO: call the API endpoint(s) backing the procedure(s) above\n"
            f"  }}")
    return "\n\n".join(out), procs


def render_tsx(page, roots):
    body = to_jsx(build_page(roots), 2)
    comp = re.sub(r"\W", "", page)
    handlers, procs = emit_handlers()
    proc_note = ""
    if procs:
        proc_note = ("// Server procedures referenced by this page (become API endpoints — "
                     "see the converted .proc.md):\n//   "
                     + ", ".join(sorted(procs)) + "\n")
    handler_block = ("\n" + handlers + "\n") if handlers else ""
    return f"""// {page}.tsx - regenerated from legacy WebDev page {page}
// Stack: React + Tailwind + shadcn/ui (stack.md). Primary = indigo-600.
// Event handlers below are ported from the legacy WLanguage (review & implement).
{proc_note}import {{ Button }} from "@/components/ui/button";
import {{ Input }} from "@/components/ui/input";
import {{ Select }} from "@/components/ui/select";

export default function {comp}() {{{handler_block}
  return (
{body}
  );
}}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True, help="path to <PAGE>.controls.md")
    ap.add_argument("--out", default="rebuild/pages")
    ap.add_argument("--preview-out", default="scratch-render")
    args = ap.parse_args()

    page = os.path.basename(args.page).split(".")[0]
    roots, nodes = parse_controls(args.page)
    GAPS_HIT.clear()
    HANDLERS_USED.clear()
    parse_handlers(args.page, args.page.replace(".controls.md", ".page.md"))

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.preview_out, exist_ok=True)
    tsx_path = os.path.join(args.out, f"{page}.tsx")
    html_path = os.path.join(args.preview_out, f"{page}.preview.html")
    open(tsx_path, "w", encoding="utf-8").write(render_tsx(page, roots))
    open(html_path, "w", encoding="utf-8").write(render_html(page, roots))

    n_ctl = len(nodes)
    n_todo = sum(1 for n in nodes.values()
                 if (n["caption"] or n["title"]).upper() in ("", "GB"))
    print(f"{page}: {n_ctl} controls parsed, {len(roots)} root zones")
    print(f"  -> {tsx_path}")
    print(f"  -> {html_path}")
    print(f"  captions needing review (GB/empty): ~{n_todo}")
    if GAPS_HIT:
        print("  component gaps (no shadcn primitive — see rebuild/COMPONENT-GAPS.md):")
        for g in sorted(GAPS_HIT):
            print(f"    - {g}: {GAP_RECO[g]}")


if __name__ == "__main__":
    main()
