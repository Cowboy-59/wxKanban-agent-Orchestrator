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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wxconv_redact as rd  # noqa: E402 - sibling module; path inserted directly above

# ---- control grammar -----------------------------------------------------------------

PREFIX_KIND = {
    "ZONE": "zone", "CELL": "cell", "CTPL": "template", "TPLC": "template", "TPL": "template",
    "TABLE": "table", "COL": "column", "LOOP": "looper", "ATT": "attribute",
    "EDT": "input", "SAIT": "input", "BTN": "button", "IMG": "image", "STC": "static",
    "LIB": "static", "LINK": "link", "COMBO": "select", "SELECT": "select",
    "CBOX": "checkbox", "CHK": "checkbox", "RADIO": "radio", "MENU": "menu",
    "PGB": "progress", "PROGBAR": "progress", "JAUGE": "progress", "CPTCH": "captcha",
    "RTA": "richtext", "HTM": "richtext", "GAL": "gallery", "GR": "groupbox",
    "POPUP": "popup", "OPT": "radio",
}

# Only these prefixes denote real UI controls. This excludes style names (Titre_Site,
# Normal_Gras), value fragments (eenVolution.png), and non-control refs (WW_, PAGE_, TXT_,
# REGLE_) that otherwise look like headers because a property keyword follows them.
CONTROL_PREFIXES = set(PREFIX_KIND)

# Property labels that mark the *start of a new key* (mined from the dumps).
PROP_KEYS = {
    # "HFSQL link" and its two sub-labels print unconditionally, even when nothing is linked;
    # missing from this set they were swallowed into the value being read, so an UNBOUND
    # control read back as bound (wxKanban a38f7c27, 11207b9f defect 4b).
    "HFSQL link", "Browsed file", "Browsed item", "Scrollbar width", "Generated HTML tag",
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
    # Table/column-specific labels (JCA technical-doc dumps, added 2026-07-19 fix)
    "Plane", "File", "Browse", "Use HFilter()", "Lock record", "Save on exit",
    "Multiselection", "Display/Scrollbar", "Proportional scrollbar", "Scrollbar tooltip",
    "Cascading input", "ENTER Management", "Saves col. config.", "Anchored column",
    "5.5-compatible", "Fixed left", "Moveable", "Adjustable width", "Sortable column",
    "With search", "Horz. alignment", "Vert. alignment", "Input type", "Multiline",
    "RTF format", "With input", "File assisted input",
    # Single-word labels from the "<Type> : <Name>" detail-block format (as a safety net
    # in addition to the section-header reset above).
    "Opacity", "Ellipse", "Halo Width", "Halo Height", "UI by the user",
    "Ellipsis mode", "Automatic link", "Check spelling", "Unicode",
    "Horz. scrollbar", "Vert. scrollbar", "File system completion",
}

NAME_RE = re.compile(r"^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*$")
PREFIX_RE = re.compile(r"^([A-Za-z]+)_")

# --- Fallback control-type detection by declared type header, not just name prefix -----
# Some WinDev projects (JCA among them) rename controls away from the IDE's
# auto-generated TYPE_n defaults to meaningful names (e.g. "CONMobile", or a Table
# control literally named "TABLE") — these carry no recognizable prefix at all, so
# `kind_of()`/prefix matching alone would never see them. Each control block in the dump
# is still announced by a literal type-header line (e.g. "Table", "Check Box", "Edit"),
# so track that as a fallback kind for any name with no recognized prefix.
TYPE_HEADER_KIND = {
    "Table": "table", "Table column": "column", "Check Box": "checkbox",
    "Radio Button": "radio", "Edit": "input", "Edit control": "input",
    "Static": "static", "Image": "image", "Shape": "static",
    "Button": "button", "Combo Box": "select", "List Box": "select",
    "Group Box": "groupbox", "Zone": "zone", "Cell": "cell", "Menu": "menu",
    "Looper": "looper", "Looper break": "static", "RTF": "richtext", "Tab": "tabcontrol",
    "Splitter": "splitter", "Spin": "input",
    # A WebDev progress bar rendered generically because neither its prefix nor its type label
    # was recognised (wxKanban b91866bf).
    "Progress Bar": "progress", "Progress bar": "progress",
}

# A second document layout exists alongside the compact "type header + shared
# property list + repeated name/value rows" one already handled above: individual
# controls are sometimes documented as their own "<Type> : <Name>" block with
# interleaved label/value pairs (e.g. "Button : BT_ACTIVE", "Table : TABLE",
# "Window : cr_tab"). This is unambiguous — the name is given directly — and also
# marks a section boundary: seeing one of these must reset any in-progress
# type/table-owner tracking from the block-style section above it, or later labels
# specific to this format (e.g. "Opacity") get misread as more rows of whatever
# came before (this was a real bug caught by inspecting actual output, not
# theoretical - see DesignDecisions.md's go/no-go test log).
SECTION_HEADER_RE = re.compile(r"^([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$")

# "<Type> : <Name>" blocks that declare the ELEMENT rather than a control on it. Everything
# else in that form is treated as a control, known type or not — the polarity matters: an
# allow-list of control types silently deletes every type nobody has met yet, whereas a
# deny-list of non-controls degrades to rendering an unfamiliar control generically.
NON_CONTROL_SECTIONS = {
    "Window", "Internal window", "Window template", "Page", "Internal page", "Page template",
    "Report", "Query", "Project", "Analysis", "Class", "Set of procedures",
    "Collection of procedures", "Procedure", "Description", "General information",
}

# Control types met in the field that this script has no mapping for. Reported at the end so
# the type can be added rather than rediscovered by the next person converting a similar app.
UNKNOWN_TYPES = {}

# Bare identifier-shaped tokens that are property *values* in these dumps, not control
# names — without this, e.g. a page-footer "JCA" (the project name) or a value like
# "Active"/"Read-onl" (PDF-truncated "Read-only") could be misread as a control header.
VALUE_TOKENS = {
    "Active", "Inactive", "Grayed", "Visible", "Invisible", "Yes", "No", "GB", "None",
    "Text", "Numeric", "Currency", "Date", "Time", "Duration", "Editable", "ReadOnly",
    "Read-onl", "Default", "Automatic", "Manual", "Single", "Multiple", "Vertical",
    "Horizontal", "True", "False", "Search", "Filter", "Left", "Right", "Center",
    "Top", "Bottom", "Memor", "Memory", "Linked", "Never", "Always", "Sometimes",
}
NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?%?$")


def is_value_line(s):
    return s in VALUE_TOKENS or bool(NUMERIC_RE.match(s))


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


LANG_TAG_RE = re.compile(r"^[A-Za-z]{2,4}:$")  # e.g. "AU:", "EN:", "FR:" - multilingual tag


def read_value(block, key):
    """Return the literal value after `key` (skipping the 'GB' multilingual marker and any
    leading language-tag line, e.g. "AU:", printed before the actual text for whichever
    language the project is configured for)."""
    for j, l in enumerate(block):
        if l.strip() == key:
            vals = []
            for k in range(j + 1, len(block)):
                v = block[k].strip()
                if v == "GB":
                    continue
                if not vals and LANG_TAG_RE.match(v):
                    continue
                if v in PROP_KEYS:
                    break
                if v == "":
                    break
                vals.append(v)
            return " ".join(vals).strip()
    return ""


def strip_mnemonic(text):
    """Strip WinDev's '&' Alt-key mnemonic marker (no HTML/React equivalent - see
    CommonControlProperties.md's Hotkey entry). '&&' is the escape for a literal ampersand
    and becomes a single '&'; a lone '&' before a letter is the mnemonic marker and is
    dropped entirely, revealing the clean caption text."""
    if not text:
        return text
    return text.replace("&&", "\x00").replace("&", "").replace("\x00", "&")


def parse_controls(path):
    raw = open(path, encoding="utf-8").read().split("\n")

    # Drop OUR OWN YAML front matter before anything else. Its lines are "key: value", the
    # same shape as a "<Type> : <Name>" control declaration, so the parser read
    # "wxkanbanVersion: kit" as a control named `kit` of type `wxkanbanVersion` — inventing
    # controls out of the header this very tool wrote. Values like `kit` are valid
    # identifiers, so no name-shape test can catch this; the block has to be excluded.
    if raw and raw[0].strip() == "---":
        end = next((i for i, l in enumerate(raw[1:], start=1) if l.strip() == "---"), None)
        if end is not None:
            raw = raw[end + 1:]

    # drop our own md header/comment lines
    lines = [l for l in raw if not l.startswith("#") and not l.startswith("_")
             and not l.startswith("<!--")]

    # Single stateful pass: a control name is recognized either by its own name
    # prefix (original convention) or, failing that, by the declared type header
    # of the block it's structurally inside (fallback for projects like JCA that
    # rename controls away from the IDE's auto-generated prefixes). See
    # TYPE_HEADER_KIND / TABLE_OWNER_RE above.
    current_kind = None
    current_table_owner = None
    seen_any_label = False
    header_idx, header_kind, header_full, header_via = [], {}, {}, {}

    for i, raw_line in enumerate(lines):
        s = raw_line.strip()
        if not s:
            continue
        m_section = SECTION_HEADER_RE.match(s)
        if m_section:
            type_word, name_part = m_section.group(1).strip(), m_section.group(2).strip()
            if type_word == "Table":
                current_table_owner = name_part
                current_kind = "column"
            elif type_word == "Table column" and current_table_owner:
                # individually-detailed column of whichever table we're inside
                full = f"{current_table_owner}.{name_part}"
                header_idx.append(i)
                header_kind[i] = "column"
                header_full[i] = full
                header_via[i] = "header"
                current_kind = "column"
            elif type_word in TYPE_HEADER_KIND:
                # unambiguous "<Type> : <Name>" block - take the name directly and stop
                # tracking whatever block-style section preceded this one.
                current_kind, current_table_owner = None, None
                header_idx.append(i)
                header_kind[i] = TYPE_HEADER_KIND[type_word]
                header_full[i] = name_part
                header_via[i] = "header"
            elif type_word in NON_CONTROL_SECTIONS:
                # The page/window/report itself, not a control on it. Ends whatever
                # block-style section preceded it and contributes nothing.
                current_kind, current_table_owner = None, None
            elif NAME_RE.match(name_part) and len(type_word) > 1:
                # An unrecognized type in "<Type> : <Name>" form. This used to be dropped
                # outright, which deleted every control whose type was not one of the 21 in
                # TYPE_HEADER_KIND - "Sidebar : SDB_Menu" and its whole family - even though
                # the name is stated unambiguously right there.
                #
                # Keep it. An unclassified control rendered generically is a control the
                # developer can see and correct; a deleted one is invisible in a page that
                # still reports success. The type is recorded so the map can grow.
                #
                # The name must look like an identifier and the type must be more than one
                # letter: this line shape also matches YAML front matter
                # ("wxkanbanSource: https://..."), Windows paths ("D: \WXSpooler\...") and
                # URLs ("http: //"), none of which are controls. Without that check the
                # parser invents controls out of its own file header.
                current_kind, current_table_owner = None, None
                header_idx.append(i)
                header_kind[i] = "control"
                header_full[i] = name_part
                header_via[i] = "header"
                UNKNOWN_TYPES.setdefault(type_word, []).append(name_part)
            else:
                # Not a control declaration at all - front matter, a path, a URL.
                current_kind, current_table_owner = None, None
            seen_any_label = False
            continue
        if s in TYPE_HEADER_KIND:
            current_kind = TYPE_HEADER_KIND[s]
            if current_kind != "column":
                current_table_owner = None
            seen_any_label = False
            continue
        if s in PROP_KEYS:
            seen_any_label = True
            continue
        if not NAME_RE.match(s) or " " in s or is_value_line(s):
            continue
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
        if nxt in PROP_KEYS:
            # A fresh label list starts right after this line - this is noise (e.g. a
            # page running-header artifact like the project name), not real control/
            # column data, which is always followed by its own values, not new labels.
            continue

        last = s.split(".")[-1]
        m = PREFIX_RE.match(last)
        kind = None
        # How the name was recognised is recorded, not just the kind. "prefix" and "typed" are
        # positive evidence that this line IS a control; "loose" means only that an identifier-
        # shaped word appeared somewhere after a property label, which is also true of an
        # unrecognised property label. See the geometry gate in main().
        via = None
        if m and m.group(1).upper() in CONTROL_PREFIXES:
            kind, via = PREFIX_KIND[m.group(1).upper()], "prefix"
        elif current_kind is not None:
            kind, via = current_kind, "typed"
        elif seen_any_label:
            kind, via = "control", "loose"
        if kind is None:
            continue

        full = f"{current_table_owner}.{s}" if (kind == "column" and current_table_owner) else s
        header_idx.append(i)
        header_kind[i] = kind
        header_full[i] = full
        header_via[i] = via

    nodes = {}
    order = 0
    for pos, s_i in enumerate(header_idx):
        e_i = header_idx[pos + 1] if pos + 1 < len(header_idx) else len(lines)
        full = header_full[s_i]
        block = lines[s_i:e_i]
        seg = full.split(".")[-1]
        def num(key):
            v = read_value(block, key)
            m = re.match(r"-?\d+", v or "")
            return int(m.group()) if m else None

        node = dict(
            path=full, seg=seg, kind=header_kind[s_i],
            caption=read_value(block, "Caption"),
            title=read_value(block, "Title"),
            state=read_value(block, "State"),
            visible=read_value(block, "Visible"),
            width=read_value(block, "Width"),
            password=("Password" in block
                      and read_value(block, "Password").strip().lower()
                      not in ("no", "false", "0")),
            binding=read_value(block, "HFSQL link"),
            x=num("X position"), y=num("Y position"),
            via=header_via.get(s_i, "loose"),
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
                               password=False, binding="", x=None, y=None,
                               via="synth", order=order, children=[], synth=True)
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
HANDLER_RE = re.compile(r"^([A-Z][\w ]*? (?:on|of|in)) (\w+)\s*\(")

# WinDev event phrases that name their control with NO connecting word ("Click BTN_Add ( … )",
# "Whenever modifying BillingOrder ( TBL_PatientDiag )"). An unrecognised header does not merely
# go unwired: parse_handlers keeps collecting, so the header and its code are appended to the
# PRECEDING handler's body, attributing one control's WLanguage to another. That was happening on
# 14 of the 905 real pages on this machine.
#
# This is an allow-list and not a general "<phrase> <name> (" pattern on purpose: measured over
# those pages, the general form also matches 1,038 `IF …(` lines, 341 `PROCEDURE …(` declarations
# and assorted prose. The vocabulary is finite; a phrase missing from it costs one unwired
# handler, while a wrong entry costs invented code.
SEPARATORLESS_EVENTS = (
    "Click", "Enter", "Exit", "Whenever modifying", "Move mouse over",
    "Drag over drop target", "Drop on target",
    "Receive files uploaded from", "After reception of the files uploaded from",
)
HANDLER_RE2 = re.compile(
    r"^(" + "|".join(sorted(SEPARATORLESS_EVENTS, key=len, reverse=True)) + r") (\w+)\s*\(")

HANDLERS = {}        # control seg -> list of (event, [code lines])
HANDLER_SRC = {}     # id(code list) -> the header line verbatim, annotations and all
HANDLERS_USED = {}   # handler fn name -> (seg, event, code) actually wired this page

# The gate that decides whether the token after "Click on" is a control name or ordinary prose.
#
# It used to be `^[A-Z]{2,}\w*_`, which requires an UPPERCASE prefix AND an underscore. That is the
# IDE's default naming convention, not a rule: one WebDev project named its controls BTNFindRecord
# and btnClear, so every handler header was rejected and all four converted pages wired no
# behaviour whatsoever — while the run reported a healthy control count (wxKanban 7ce2f50a).
#
# Accept a known control prefix in any casing, with or without the underscore. After a BARE prefix
# an uppercase letter or digit is required, so that an ordinary English word that happens to open
# with a prefix ("link", "menu") cannot pass as a control name. The old pattern is still honoured
# alongside it, so nothing that parsed before stops parsing.
HANDLER_NAME_RE = re.compile(
    r"^(?i:" + "|".join(sorted(CONTROL_PREFIXES, key=len, reverse=True)) + r")"
    r"(?:_\w*|[A-Z0-9]\w*)$")
LEGACY_HANDLER_NAME_RE = re.compile(r"^[A-Z]{2,}\w*_")


def is_handler_control_name(token, known=()):
    """True when a handler header's second token names a control rather than prose."""
    if token in known:          # the dump's own control list — the strongest evidence there is
        return True
    return bool(HANDLER_NAME_RE.match(token) or LEGACY_HANDLER_NAME_RE.match(token))


def match_handler_header(line, known=()):
    """Return (event phrase, control seg) for a WLanguage event header, else None."""
    for rx in (HANDLER_RE, HANDLER_RE2):
        m = rx.match(line)
        if m and is_handler_control_name(m.group(2), known):
            return m.group(1).strip(), m.group(2)
    return None


def event_label(event):
    """The event phrase without its trailing connector, for listing it beside a control name."""
    return re.sub(r"\s+(?:on|of|in)$", "", event)


def parse_handlers(*paths, known=()):
    """Extract WLanguage event-handler blocks from any of the given files (controls + page)."""
    HANDLERS.clear()
    HANDLER_SRC.clear()
    for path in paths:
        if not path or not os.path.exists(path):
            continue
        lines = [l.rstrip() for l in open(path, encoding="utf-8").read().split("\n")]
        cur = None
        for l in lines:
            m = match_handler_header(l.strip(), known)
            if m:
                event, seg = m
                cur = [seg, event, []]
                HANDLERS.setdefault(seg, []).append((event, cur[2]))
                HANDLER_SRC[id(cur[2])] = l.strip()
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


# WinDev's own unconfigured default caption for a Tab control - not a real label. Its
# actual per-page names live in the Tab control editor's "Static panes" list, which is
# not captured by the technical-documentation PDF export at all (confirmed 2026-07-20 by
# searching the full converted output for a known real pane name and finding nothing) -
# so there's nothing to parse here; treat it the same as the unset "GB" placeholder.
DEFAULT_TAB_CAPTION_RE = re.compile(r"^tab$", re.I)


def label(node):
    cap = node["caption"] or node["title"]
    if cap and cap.upper() != "GB" and not (
            node["kind"] == "tabcontrol" and DEFAULT_TAB_CAPTION_RE.match(strip_mnemonic(cap))):
        return strip_mnemonic(cap), False
    if node["kind"] == "tabcontrol":
        # humanize() strips a leading "XXX_" as if it were a throwaway code-organization
        # prefix (right for most controls, e.g. BTN_Save -> "Save") - but on a tab whose
        # real name is unrecoverable anyway (see note above), that prefix is often the
        # only distinguishing information left (CC_Tab, JU_Tab, CB_Tab), so show it as-is
        # rather than collapsing several different tabs down to the same word "Tab".
        return node["seg"], True
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
    # An RTA_/HTM_ control is classified richtext by NAME PREFIX alone, and on a real project every
    # single one was static formatted text - site header branding, a copyright footer, help-popup
    # copy, a session-timeout message - while the actual editable content field was a plain EDT_.
    # So nearly every page carried a spurious "pull in TipTap" gap for what needs a <div>. An
    # editor is only warranted where the control is actually bound to data (wxKanban a38f7c27).
    if k == "richtext" and not (node.get("binding") or "").strip():
        return V("p", "wx-static", text=lbl, todo=todo)
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
    if k == "tabcontrol":
        return build_tabs(node)
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


def build_tabs(node):
    """A WD Tab control's own direct children that are themselves Tab controls are its
    pages (nested tabs recurse naturally via build_vnode); any other direct children are
    base content shown alongside the tab strip, not inside a page of their own. Grouping
    comes entirely from the already-correct dotted-path parent/child tree - no dependence
    on each control's individual (unreliable-to-extract) Plane number. Unlike Table, shadcn's
    Tabs is a complete native primitive, so this isn't flagged as a component gap - no
    heavier library is needed."""
    tab_kids = [c for c in node["children"] if c["kind"] == "tabcontrol"]
    base_kids = [c for c in node["children"] if c["kind"] != "tabcontrol"]
    base_vnodes = [x for x in (build_vnode(c) for c in base_kids) if x]
    if not tab_kids:
        # leaf "tab" with no sub-pages - e.g. a lone tab strip with no children captured
        return V("div", "wx-tab-panel", children=base_vnodes) if base_vnodes else None

    triggers, panels = [], []
    for c in tab_kids:
        lbl, todo = label(c)
        val = c["seg"]
        triggers.append(V("button", "wx-tab-trigger", text=lbl, todo=todo,
                           attrs={"data-value": val}))
        # build_vnode(c) recurses through the normal tabcontrol dispatch, so a tab-kid
        # with its own nested sub-tabs correctly produces another nested <Tabs> here
        # instead of having its grandchildren flattened into this page directly.
        inner = build_vnode(c)
        panel_kids = ([V("p", "wx-tab-panel-h", text=lbl)] if lbl else []) + ([inner] if inner else [])
        panels.append(V("div", "wx-tab-panel", attrs={"data-value": val}, children=panel_kids))
    if base_vnodes:
        panels.insert(0, V("div", "wx-tab-panel", attrs={"data-value": "_base"},
                            children=base_vnodes))
    return V("div", "wx-tabs-root", shadcn="Tabs", children=[
        V("div", "wx-tab-list", children=triggers)] + panels)


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
    "wx-tabs-root": "my-3 space-y-3",
    "wx-tab-list": "flex flex-wrap gap-1 border-b border-slate-200",
    "wx-tab-trigger": "rounded-t-lg border border-b-0 border-slate-200 bg-slate-100 px-4 py-2 "
                       "text-sm font-medium text-slate-600",
    "wx-tab-panel": "rounded-b-lg rounded-tr-lg border border-slate-200 bg-white p-4 space-y-3",
    "wx-tab-panel-h": "text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2",
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
    if v.shadcn == "Tabs":
        # v.children[0] is the trigger list, the rest are panels (see build_tabs) - both
        # sides keyed by the same "data-value" so real shadcn Tabs state just works.
        list_node, panels = v.children[0], v.children[1:]
        default_val = panels[0].attrs.get("data-value", "") if panels else ""
        triggers = "\n".join(
            f'{pad}    <TabsTrigger value="{esc(t.attrs.get("data-value",""))}">'
            f'{esc(t.text)}</TabsTrigger>' + ("  {/* TODO caption */}" if t.todo else "")
            for t in list_node.children)
        contents = "\n".join(
            f'{pad}  <TabsContent value="{esc(p.attrs.get("data-value",""))}" '
            f'className="{TW.get(p.cls,"")}">\n'
            + ("\n".join(to_jsx(c, depth + 2) for c in p.children if c)
               or f'{pad}    {{/* empty */}}')
            + f'\n{pad}  </TabsContent>'
            for p in panels)
        return (f'{pad}<Tabs defaultValue="{esc(default_val)}" className="{cls}">\n'
                f'{pad}  <TabsList>\n{triggers}\n{pad}  </TabsList>\n'
                f'{contents}\n{pad}</Tabs>')
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
        # The header line verbatim, not a reconstruction: its "( Owner ) (template)" and
        # "(server)" / "(onclick browser event)" annotations say WHICH instance of the control the
        # code belongs to and where it ran, and a rebuild needs both. The old comment hardcoded
        # "(server)", which is wrong for every browser-side event.
        src = HANDLER_SRC.get(id(code)) or f"{event} {seg}"
        out.append(
            f"  // {src} — ported from WLanguage. TODO: implement.\n"
            f"  async function {fn}() {{\n"
            f"  // --- original WLanguage ---\n{wl}\n"
            f"    // TODO: call the API endpoint(s) backing the procedure(s) above\n"
            f"  }}")
    return "\n\n".join(out), procs


def unwired_handler_note():
    """
    Carry every handler block the page does not attach to an element.

    Two ways a block goes unattached, and both used to lose their WLanguage outright:

      * the control is not rendered clickable — a template, a cell, a table column. Only buttons
        and links take an onClick;
      * the control IS wired, but has SEVERAL events. handler_for() attaches one.

    Before the header regex recognised these blocks they were appended to the PRECEDING handler's
    body, so the code appeared in the output attributed to the wrong control. Now that the headers
    are recognised, the code has to land somewhere or it is simply gone — hence this block. The
    header line is reproduced verbatim, since its "( Owner ) (template)" annotation says which
    instance of the control the code belongs to.
    """
    used = {id(code) for _, _, code in HANDLERS_USED.values()}
    lines = []
    for seg in sorted(HANDLERS):
        for _event, code in HANDLERS[seg]:
            if id(code) in used:
                continue
            lines.append(f"//   {HANDLER_SRC.get(id(code), seg)}")
            lines.extend(f"//     {ln}" for ln in code)
    if not lines:
        return ""
    return ("// Event handlers this page does not attach to an element — the control is not "
            "clickable\n// (template, cell, table column), or it has further events beyond the "
            "one wired below.\n// Not wired, but their legacy logic is kept rather than "
            "dropped:\n" + "\n".join(lines) + "\n")


def render_tsx(page, roots):
    body = to_jsx(build_page(roots), 2)
    comp = re.sub(r"\W", "", page)
    handlers, procs = emit_handlers()
    proc_note = unwired_handler_note()
    if procs:
        proc_note += ("// Server procedures referenced by this page (become API endpoints — "
                      "see the converted .proc.md):\n//   "
                      + ", ".join(sorted(procs)) + "\n")
    handler_block = ("\n" + handlers + "\n") if handlers else ""
    return f"""// {page}.tsx - regenerated from legacy WebDev page {page}
// Stack: React + Tailwind + shadcn/ui (stack.md). Primary = indigo-600.
// Event handlers below are ported from the legacy WLanguage (review & implement).
{proc_note}import {{ Button }} from "@/components/ui/button";
import {{ Input }} from "@/components/ui/input";
import {{ Select }} from "@/components/ui/select";
import {{ Tabs, TabsList, TabsTrigger, TabsContent }} from "@/components/ui/tabs";

export default function {comp}() {{{handler_block}
  return (
{body}
  );
}}
"""


# ---- geometry gate: refuse rather than invent -----------------------------------------

def geometry_is_unavailable(nodes):
    """
    True when a page's control tree rests on nothing but coincidence.

    parse_controls orders and nests siblings from each control's "X/Y position". When a dump
    carries no positions at all AND every control was matched LOOSELY — an identifier-shaped word
    somewhere after a property label, which is equally the shape of a property label this parser
    does not know — the resulting tree is not a weak reading of the page, it is an invention. One
    WebDev export produced a 1,243-byte .tsx from a 4,689-line dump whose six "controls" were the
    property labels Img1, Simple, Hotkey, Toolbar, Step and Autocompletion, and it exited 0
    reporting "~24 captions needing review", which reads like a healthy run (wxKanban 7ce2f50a).

    A single control matched by name prefix, by declared type, or by a "<Type> : <Name>" header is
    positive evidence that the page was really read, so a page that merely lacks geometry — an
    export in a language whose position labels this parser does not know, say — is unaffected.
    """
    real = [n for n in nodes.values() if not n.get("synth")]
    if not real:
        return False
    if any(n["x"] is not None or n["y"] is not None for n in real):
        return False
    return all(n.get("via") == "loose" for n in real)


def wire_all_handlers():
    """
    Mark EVERY extracted handler as used, for the layout-less fallback render.

    handler_for() takes only a control's first event because it attaches one onClick; here there is
    no element to attach to and the point is the inventory, so a control with several events keeps
    all of them, suffixed to stay distinct.
    """
    for seg, hs in sorted(HANDLERS.items()):
        for i, (event, code) in enumerate(hs):
            fn = f"on{seg}" if i == 0 else f"on{seg}_{i + 1}"
            HANDLERS_USED[fn] = (seg, event, code)


def render_tsx_names_only(page, reason):
    """
    The page's controls and behaviour WITHOUT a layout, for a dump that carries no geometry.

    Emitting an <Input placeholder="Hotkey"> is worse than emitting nothing, because a rebuild
    team has to first work out that it is wrong. What IS trustworthy here are the control names and
    events printed in the handler headers ("Click on BTNFindRecord (onclick browser event)"), which
    come from the dump verbatim. Hand those over and leave the layout to the rebuild — which is the
    skill's "Modernize, don't replicate 1:1" principle applied to a case where replicating is not
    even possible.
    """
    comp = re.sub(r"\W", "", page)
    handlers, procs = emit_handlers()
    proc_note = ""
    if procs:
        proc_note = ("// Server procedures referenced by this page (become API endpoints — "
                     "see the converted .proc.md):\n//   "
                     + ", ".join(sorted(procs)) + "\n")
    if HANDLERS:
        inventory = "\n".join(
            f"//   {seg}: " + ", ".join(event_label(ev) for ev, _ in hs)
            for seg, hs in sorted(HANDLERS.items()))
    else:
        inventory = "//   (no handler headers found either — nothing about this page is recoverable)"
    handler_block = ("\n" + handlers + "\n") if handlers else ""
    return f"""// {page}.tsx - NOT GENERATED. See rebuild/COMPONENT-GAPS.md.
//
// LAYOUT NOT RECOVERABLE: {reason}
//
// No layout is emitted rather than a speculative one. The controls below and their events are
// taken verbatim from the dump's WLanguage handler headers and ARE reliable; build the layout
// from the running application or its screenshots.
//
// Controls and events found:
{inventory}
{proc_note}
export default function {comp}() {{{handler_block}
  return (
    <div className="p-6 text-sm">
      {{/* TODO: lay out this page. See the control inventory in the header comment. */}}
    </div>
  );
}}
"""


GAPS_HEADER = """# Component & layout gaps

Pages listed here were NOT laid out. Each entry says why, and lists the controls and events that
*were* recovered — those names come from the dump verbatim and can be trusted. Build the layout
from the running application or its screenshots.
"""


# The watermark front matter and trailer rd.write_text() adds. This file is read-modify-written
# once per refused page, so both have to come off before it is written back — otherwise the
# re-stamp appends a second set of wxkanban* keys on every page after the first.
_WM_TRAILER_RE = re.compile(r"\n+---\s*\n+<!-- wxkanban:watermark -->.*\Z", re.S)
_WM_FRONTMATTER_RE = re.compile(r"\A---\r?\n(?:wxkanban\w+:[^\r\n]*\r?\n)+---\r?\n\s*")


def unstamp(md):
    """Strip the watermark front matter and trailer, so the content can be rewritten and re-stamped."""
    return _WM_FRONTMATTER_RE.sub("", _WM_TRAILER_RE.sub("", md or "")).strip()


def record_layout_gap(gaps_path, page, src, reason, state):
    """Append this page to the rebuild's gaps report, creating it if this is the first one."""
    os.makedirs(os.path.dirname(gaps_path) or ".", exist_ok=True)
    existing = ""
    if os.path.exists(gaps_path):
        existing = unstamp(open(gaps_path, encoding="utf-8").read())
    if not existing.strip():
        existing = GAPS_HEADER
    marker = f"\n## {page} — no layout emitted\n"
    if marker in existing:      # a re-run of the same page replaces its entry, never duplicates it
        existing = existing.split(marker)[0].rstrip() + "\n"
    controls = "\n".join(f"- `{seg}` — " + ", ".join(event_label(ev) for ev, _ in hs)
                         for seg, hs in sorted(HANDLERS.items())) \
        or "- (no handler headers found either — nothing about this page is recoverable)"
    entry = (f"{marker}\n"
             f"**Source:** `{src}`\n\n"
             f"**Why:** {reason}.\n\n"
             f"**Controls and events recovered from the handler headers:**\n\n{controls}\n")
    rd.write_text(gaps_path, existing.rstrip() + "\n" + entry, state)


# ---- silent-failure guard ------------------------------------------------------------
# The control parser recognizes a control by a known WinDev type PREFIX (EDT_, BTN_,
# TABLE_, ...) OR, since the 2026-07 fix above, by its declared type header (prefix-less /
# "<Type> : <Name>" dumps). This guard stays as a secondary safety net: if a dump clearly
# holds control data (many property-label lines) but almost nothing was parsed, the format
# was very likely still not recognized — turn that silent miss into a loud warning rather
# than writing an empty .tsx that looks like success.
CANDIDATE_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$")


_DATA_FILE_CACHE = {}


def _known_data_files(src_dir):
    """Lower-cased data-file names, from the splitter's own *.table.md filenames."""
    cached = _DATA_FILE_CACHE.get(src_dir)
    if cached is None:
        try:
            cached = {fn[:-len(".table.md")].lower() for fn in os.listdir(src_dir or ".")
                      if fn.endswith(".table.md")}
        except OSError:
            cached = set()
        _DATA_FILE_CACHE[src_dir] = cached
    return cached


def warn_low_yield(path, n_ctl):
    """
    Compare what was parsed against the control NAMES the dump contains.

    This used to divide the count of property-LABEL lines by 20, which is not a control count:
    a single control carries roughly thirty property lines, so a COMPLETE extraction still
    tripped the warning. On a real 5228-line page it reported "only 66 controls parsed, but the
    dump contains 1781 control-property lines" while having found all 65 controls present. A
    warning that fires on correct output teaches people to ignore it, which costs more than
    having no warning at all.

    Counting distinct control-shaped names gives a denominator in the same unit as the numerator.
    """
    try:
        raw = open(path, encoding="utf-8").read().split("\n")
    except OSError:
        return
    # A dotted identifier whose first segment names a DATA FILE is an HFSQL binding
    # ("SiteOwners.Owner_UniqueID"), not a control. Counted as control-shaped names they inflated
    # the denominator and tripped this warning on 10 pages whose extraction was in fact complete -
    # the @@CONTROL marker count matched the parsed count on every one of them (wxKanban 11207b9f).
    known_tables = _known_data_files(os.path.dirname(path))
    candidates = {
        l.strip() for l in raw
        if CANDIDATE_NAME_RE.match(l.strip() or "") and ("_" in l or "." in l)
        and l.strip().split(".")[0].lower() not in known_tables
    }
    if len(candidates) >= 10 and n_ctl < len(candidates) * 0.8:
        print(f"  !! WARNING: {n_ctl} controls parsed, but the dump names "
              f"{len(candidates)} control-shaped identifiers.")
        print("     Controls are being missed - most likely a name shape or a declared type this")
        print("     parser does not recognize. Review the generated .tsx directly rather than")
        print("     trusting the count.")

    if UNKNOWN_TYPES:
        print(f"  !! {len(UNKNOWN_TYPES)} unrecognized control type(s) - rendered generically, "
              "not dropped:")
        for type_word, names in sorted(UNKNOWN_TYPES.items()):
            shown = ", ".join(names[:4]) + (f" …+{len(names) - 4}" if len(names) > 4 else "")
            print(f"       {type_word}: {shown}")
        print("     Report these to wxKanban (project_submit_feedback) so the type ships mapped "
              "and renders correctly.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True, help="path to <PAGE>.controls.md")
    ap.add_argument("--out", default="rebuild/pages")
    ap.add_argument("--preview-out", default="scratch-render")
    ap.add_argument("--gaps-out", default="rebuild/COMPONENT-GAPS.md",
                    help="Where pages that could not be laid out are recorded.")
    ap.add_argument("--force-layout", action="store_true",
                    help="Emit a layout even when the dump carries no control geometry. "
                         "The result is speculative — see rebuild/COMPONENT-GAPS.md.")
    rd.add_redaction_args(ap, scan=False)
    args = ap.parse_args()

    state = rd.RedactionState()
    page = os.path.basename(args.page).split(".")[0]
    roots, nodes = parse_controls(args.page)
    GAPS_HIT.clear()
    HANDLERS_USED.clear()
    parse_handlers(args.page, args.page.replace(".controls.md", ".page.md"),
                   known={n["seg"] for n in nodes.values()})

    no_layout = geometry_is_unavailable(nodes) and not args.force_layout

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.preview_out, exist_ok=True)
    tsx_path = os.path.join(args.out, f"{page}.tsx")
    html_path = os.path.join(args.preview_out, f"{page}.preview.html")
    # [SCOPE 125 / T009] Through the shared funnel (FR-007). These are .tsx/.html, so write_text
    # applies redaction but no watermark — matching the behaviour these two writes already had.
    # Generated TSX embeds handler code lifted from the legacy source, which is exactly where a
    # hardcoded connection literal would end up.
    if no_layout:
        reason = ("the dump carries no control geometry (no X/Y position on any control), and "
                  "every control-shaped name in it was matched loosely, so the names are as "
                  "likely to be property labels as controls")
        wire_all_handlers()
        rd.write_text(tsx_path, render_tsx_names_only(page, reason), state)
        record_layout_gap(args.gaps_out, page, args.page, reason, state)
        # A preview left over from an earlier run (or from --force-layout) would sit beside a .tsx
        # that says NO LAYOUT and show the invented one as if it were this page.
        if os.path.exists(html_path):
            os.remove(html_path)
        print(f"{page}: NO LAYOUT EMITTED — {reason}.")
        print(f"     {len(HANDLERS)} control(s) and their events recovered from the handler "
              f"headers and written to the .tsx as an inventory.")
        print(f"  -> {tsx_path}")
        print(f"  -> {args.gaps_out}")
        print("     Re-run with --force-layout to emit the speculative layout anyway.")
    else:
        rd.write_text(tsx_path, render_tsx(page, roots), state)
        rd.write_text(html_path, render_html(page, roots), state)

        n_ctl = len(nodes)
        n_todo = sum(1 for n in nodes.values()
                     if (n["caption"] or n["title"]).upper() in ("", "GB"))
        print(f"{page}: {n_ctl} controls parsed, {len(roots)} root zones")
        warn_low_yield(args.page, n_ctl)
        print(f"  -> {tsx_path}")
        print(f"  -> {html_path}")
        print(f"  captions needing review (GB/empty): ~{n_todo}")
    if GAPS_HIT:
        print("  component gaps (no shadcn primitive — see rebuild/COMPONENT-GAPS.md):")
        for g in sorted(GAPS_HIT):
            print(f"    - {g}: {GAP_RECO[g]}")

    sidecar_path = os.path.join(args.out, rd.SIDECAR_NAME)
    if state.findings:
        rd.write_text(sidecar_path, rd.render_sidecar(state), state)
    print(rd.summary_line(state, sidecar_path))
    return rd.exit_code(len(state.findings), args.fail_on_secrets)


if __name__ == "__main__":
    sys.exit(main())
