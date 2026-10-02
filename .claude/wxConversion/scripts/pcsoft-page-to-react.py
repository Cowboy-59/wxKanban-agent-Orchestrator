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
    # A combo box's list, printed straight after its caption: missing here, the caption read
    # "Charge Rule Action Type Initial content GB: INTERNAL PROCEDURE ..." (wxKanban 11207b9f 4b).
    "Initial content",
    # WebDev property labels, each checked on the two WebDev corpora here to be followed by its
    # value ("Border" / "HTML", "Mode" / "Automatic") in every one of hundreds of blocks. Unknown,
    # each one became a "control" whose block swallowed the real control's X/Y position below
    # it, so almost no WebDev control was positioned (wxKanban f0df8d41, 7ce2f50a).
    "Border", "Wrapping", "Mode", "Move", "Style", "Hotkey", "Paragraph", "Semantics",
    "Display", "Animation", "Speed", "Orientation", "Toolbar", "Size", "Step",
    "Autocompletion", "Separator", "Anchoring", "Thickness", "AnimationDuration",
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

# Types recognised ONLY in a "<Type> : <Name>" declaration, never as a bare line: several of them
# ("Caption", "Group", "Image"...) are also property labels, and a bare-line type header resets
# the parser's state, so one in TYPE_HEADER_KIND would break every block it appears in.
#
# WinDev desktop type names, from the declarations in two desktop corpora and the 16 a 640-window
# conversion reported unrecognised (wxKanban 4cbff833, 6611ee99). Each maps to a kind build_vnode
# renders - natively where shadcn has the primitive, otherwise as a visible GAP placeholder naming
# what to rebuild it with. None of them is dropped.
DECLARED_TYPE_KIND = {
    "Caption": "static", "Option caption": "static", "RadioButton": "radio",
    "Switch": "checkbox", "Separator": "separator", "Looper attribute": "attribute",
    "Supercontrol": "groupbox", "Control Template control": "template",
    "Control Template": "template", "Layout": "groupbox", "Group": "groupbox",
    "Multiline Zone": "zone", "Ribbon": "groupbox", "Toolbar": "groupbox",
    "Internal Window": "internalwindow", "HTML Display": "richtext",
    "Word Processing": "richtext", "Chart": "chart", "TreeView": "tree",
    "TreeView Table": "tree", "Calendar": "calendar", "Scheduler": "scheduler",
    "Organizer": "scheduler", "Map": "map", "Bar code": "barcode",
    "Image Editor": "imageeditor", "PDF Reader": "pdf", "Spreadsheet": "spreadsheet",
    "Pivot Table": "pivot", "ListView": "listview", "Sidebar": "sidebar",
    "Sidebar pane": "groupbox", "Slider": "slider", "Range Slider": "slider",
    "Rating": "rating", "Dashboard": "dashboard", "Kanban": "kanban",
    "Kanban List": "kanban", "Organization Chart": "orgchart", "TreeMap": "treemap",
}

# "Table column : TABLE_Main.COL_Qty (3)" - the index WinDev prints after a declared name.
ORDINAL_SUFFIX_RE = re.compile(r"\s+\(\d+\)$")
# "Check Box :" - a declaration whose name the PDF column cut off entirely.
UNNAMED_DECL_RE = re.compile(r"^([A-Za-z][A-Za-z ]*?)\s+:$")

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
# Declared types whose control name the PDF lost ("Check Box : "), one entry per declaration.
UNNAMED_DECLS = []

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
    # WinDev desktop controls (wxKanban 4cbff833, 6611ee99). Rendered as a visible placeholder
    # rather than guessed at: several have a shadcn primitive, but this script does not generate it.
    "internalwindow": "internal window: hosts another window - render that page's own "
                      "generated component here",
    "tree":    "tree view: react-arborist (MIT), or nested shadcn Collapsible",
    "calendar": "shadcn/ui Calendar (react-day-picker, MIT) - not generated by this script",
    "scheduler": "scheduler/organizer: FullCalendar (MIT) or react-big-calendar (MIT)",
    "map":     "map: react-leaflet + OpenStreetMap (BSD-2)",
    "barcode": "bar code: react-barcode / qrcode.react (MIT)",
    "imageeditor": "image editor: react-image-crop (ISC) or a hosted editor",
    "pdf":     "PDF viewer: react-pdf (MIT)",
    "spreadsheet": "spreadsheet: TanStack Table with editable cells",
    "pivot":   "pivot table: TanStack Table grouping + aggregation",
    "listview": "list view: shadcn Card grid or data-table",
    "sidebar": "sidebar: shadcn Sidebar if its panes navigate (plane/page switch), Accordion if "
               "they only expand - decide from its WLanguage",
    "slider":  "shadcn/ui Slider - not generated by this script",
    "rating":  "rating: a row of icon toggles (no shadcn primitive)",
    "dashboard": "dashboard: react-grid-layout (MIT) holding the widgets",
    "kanban":  "kanban: dnd-kit (MIT) columns",
    "orgchart": "organization chart: react-organizational-chart / d3-hierarchy",
    "treemap": "treemap: Recharts Treemap (MIT)",
    "unmapped": "a control type this script has no mapping for - rebuild it by hand; the type is "
                "listed at the end of the Stage 2 run",
}


def humanize(seg: str) -> str:
    base = re.sub(r"^[A-Za-z]+_", "", seg)
    base = base.replace("_", " ").strip()
    return base[:1].upper() + base[1:] if base else seg


LANG_TAG_RE = re.compile(r"^[A-Za-z]{2,4}:$")  # e.g. "AU:", "EN:", "FR:" - multilingual tag


# A line that opens one language's text in a multilingual value: "GB:", "ES: Cerrar",
# "US,ES: Axis", "FR,GB,...: Modification".
LANG_LINE_RE = re.compile(r"^((?:[A-Z]{2}|\.\.\.)(?:,(?:[A-Z]{2}|\.\.\.))*):(?:\s+(.*))?$")
ENGLISH_TAGS = {"GB", "US", "EN", "AU"}


def pick_language(vals):
    """
    One language's text out of a multilingual value, English when the project carries it.

    A multilingual project prints every language in turn - "ES:" / "Cerrar" / "GB:" / "Close", or
    shared, "ES,GB: Sec" - and joining the lines put "ES: Cerrar GB: Close" on the button
    (wxKanban 4d285663). Returns None for a value that is not multilingual, so the caller keeps its
    plain reading.
    """
    segs = [((), [])]
    for v in vals:
        m = LANG_LINE_RE.match(v)
        if m:
            segs.append((tuple(m.group(1).split(",")), [m.group(2)] if m.group(2) else []))
        else:
            segs[-1][1].append(v)
    segs = [s for s in segs if s[0] or s[1]]
    if len(segs) < 2 and not (segs and len(segs[0][0]) > 1):
        return None
    texts = [(tags, " ".join(t).strip()) for tags, t in segs]
    for tags, text in texts:
        if text and ENGLISH_TAGS & set(tags):
            return text
    return next((text for _, text in texts if text), "")


def read_value(block, key):
    """Return the literal value after `key` (skipping the 'GB' multilingual marker and any
    leading language-tag line, e.g. "AU:", printed before the actual text for whichever
    language the project is configured for)."""
    for j, l in enumerate(block):
        if l.strip() == key:
            vals, raw = [], []
            for k in range(j + 1, len(block)):
                v = block[k].strip()
                if v == "GB":
                    continue
                if v in PROP_KEYS:
                    break
                if v == "":
                    break
                raw.append(v)
                if not vals and LANG_TAG_RE.match(v):
                    continue
                vals.append(v)
            picked = pick_language(raw)
            return picked if picked is not None else " ".join(vals).strip()
    return ""


def strip_mnemonic(text):
    """Strip WinDev's '&' Alt-key mnemonic marker (no HTML/React equivalent - see
    CommonControlProperties.md's Hotkey entry). '&&' is the escape for a literal ampersand
    and becomes a single '&'; a lone '&' before a letter is the mnemonic marker and is
    dropped entirely, revealing the clean caption text."""
    if not text:
        return text
    return text.replace("&&", "\x00").replace("&", "").replace("\x00", "&")


# How strongly a line was shown to be a control (see `via` in parse_controls).
VIA_RANK = {"synth": 0, "loose": 1, "typed": 2, "prefix": 3, "header": 4}

INT_RE = re.compile(r"^-?\d+$")
PLANE_RE = re.compile(r"^\d+(?:,\d+)*$")
GEOMETRY_UNMATCHED = []   # geometry-table names that matched no control, one entry per row


def code_heading_index(lines, page):
    """Index of the in-page heading ("<PAGE>" over "Code") where the element's code starts."""
    if not page:
        return None
    text = [(i, l) for i, l in enumerate(lines) if l]
    for k, (i, l) in enumerate(text):
        nxt = text[k + 1][1] if k + 1 < len(text) else ""
        if l == page and nxt in CODE_SECTIONS:
            return i
        if (len(l) >= 8 and l + nxt == page and k + 2 < len(text)
                and text[k + 2][1] in CODE_SECTIONS):
            return i
    return None


def declared_segs(lines):
    """The names of the controls a dump declares as "<Type> : <Name>" (last path segment)."""
    out = set()
    for l in lines:
        s = l.strip()
        m = SECTION_HEADER_RE.match(s)
        if not m or " : " not in s:
            continue
        type_word, name = m.group(1).strip(), ORDINAL_SUFFIX_RE.sub("", m.group(2).strip())
        if not NAME_RE.match(name) or not (type_word in TYPE_HEADER_KIND
                                           or type_word in DECLARED_TYPE_KIND):
            continue
        out.add(name.split(".")[-1])
    return out


def geometry_rows(lines):
    """
    (name, x, y, width, height, plane) rows of the column-oriented geometry tables.

    A table is a type, then column labels beginning "X position / Y position / Width / Height",
    then one row per control: its name, then its values with empty cells left out. Which value
    belongs to which column is therefore known only for the leading run, so a row is recognised
    by its name being followed by four integers, and nothing past that run - other than a plane
    list in the "Plane" column - is read.
    """
    text = [l.strip() for l in lines if l.strip()]
    rows, in_table, plane_col = [], False, False
    for i, s in enumerate(text):
        if s == "X position" and text[i + 1:i + 4] == ["Y position", "Width", "Height"]:
            in_table, plane_col = True, (text[i + 4:i + 5] == ["Plane"])
            continue
        if not in_table:
            continue
        if " : " in s and SECTION_HEADER_RE.match(s):
            in_table = False
            continue
        if NAME_RE.match(s) and i + 4 < len(text) and all(INT_RE.match(text[i + k])
                                                          for k in range(1, 5)):
            plane = text[i + 5] if (plane_col and i + 5 < len(text)
                                    and PLANE_RE.match(text[i + 5])) else ""
            rows.append((s, int(text[i + 1]), int(text[i + 2]), int(text[i + 3]),
                         int(text[i + 4]), plane))
    return rows


def join_geometry(nodes, rows):
    """
    Give each control the position its geometry-table row carries.

    The PDF column cuts a long name short - "EDT_AdditionalRefere" for EDT_AdditionalReference1
    to 9 - and both the rows and the controls' own blocks are printed in ordinal name order. So
    the k-th row of a cut name is the k-th control (in that order) whose name it begins, provided
    the two counts agree. Where they do not, the rows are left unmatched and reported: a guessed
    position would reorder the page on a coincidence (wxKanban 997eedde).
    """
    GEOMETRY_UNMATCHED.clear()
    real = [n for n in nodes.values() if not n.get("synth")]
    by_seg = {}
    for n in real:
        by_seg.setdefault(n["seg"], []).append(n)

    def assign(n, row):
        n["geo"] = True
        if n["x"] is None and n["y"] is None:
            n["x"], n["y"] = row[1], row[2]
        if row[5]:
            n["plane"] = row[5]

    pending = {}
    for row in rows:
        name = row[0]
        targets = [nodes[name]] if name in nodes and not nodes[name].get("synth") \
            else by_seg.get(name.split(".")[-1], [])
        if len(targets) == 1:
            assign(targets[0], row)
        elif not targets:
            pending.setdefault(name.split(".")[-1], []).append(row)
        else:
            GEOMETRY_UNMATCHED.append(name)
    for cut, group in pending.items():
        cands = sorted((n for n in real if n["seg"].startswith(cut) and n["seg"] != cut
                        and not n.get("geo")), key=lambda n: n["seg"])
        if cands and len(cands) == len(group):
            for n, row in zip(cands, group):
                assign(n, row)
        else:
            GEOMETRY_UNMATCHED.extend(r[0] for r in group)


def parse_controls(path):
    UNNAMED_DECLS.clear()
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

    # The dump ends where the element's code begins. Its first lines sit at the foot of the last
    # "Information on controls" page ("<PAGE>" over "Code"), so they land in this file; read as
    # controls, identifier-shaped code lines - "gsType", "END", "RETURN" - became controls.
    page = os.path.basename(path).split(".")[0]
    stop = code_heading_index([l.strip() for l in lines], page)
    if stop is not None:
        lines = lines[:stop]

    # A WinDev desktop dump declares every control - "Button : BTN_Save" - and ALSO prints
    # column-oriented tables of them: a type, its column labels, then per control its name and
    # one value per column. Read as name/value blocks, those tables turn their values into
    # controls ("Normal", "Enabled", "Sum", "Average"), a name the column cut short into a second
    # control ("COMBO_InternalProcedur"), and a nested control's row into a duplicate of it at
    # the page root - about 33,000 phantoms against 23,000 real controls on one desktop corpus
    # here (wxKanban 4cbff833, 997eedde). Where the controls are declared, the declarations are
    # the controls; the tables only contribute their geometry (join_geometry).
    declared_names = declared_segs(lines)
    decl_mode = bool(declared_names)

    # Single stateful pass: a control name is recognized either by its own name
    # prefix (original convention) or, failing that, by the declared type header
    # of the block it's structurally inside (fallback for projects like JCA that
    # rename controls away from the IDE's auto-generated prefixes). See
    # TYPE_HEADER_KIND / TABLE_OWNER_RE above.
    current_kind = None
    current_table_owner = None
    seen_any_label = False
    header_idx, header_kind, header_full, header_via, header_decl = [], {}, {}, {}, {}

    for i, raw_line in enumerate(lines):
        s = raw_line.strip()
        if not s:
            continue
        m_unnamed = UNNAMED_DECL_RE.match(s)
        if m_unnamed and (m_unnamed.group(1) in TYPE_HEADER_KIND
                          or m_unnamed.group(1) in DECLARED_TYPE_KIND):
            # "Check Box : " - the PDF column lost the control's name. It used to be skipped as an
            # unreadable line, so its whole property block ran on into the PREVIOUS control's and
            # lent it this one's caption. The block is ended here; with no name to give a
            # control, it is counted and reported rather than invented (wxKanban 997eedde).
            current_kind, current_table_owner = None, None
            header_idx.append(i)
            header_full[i] = None
            UNNAMED_DECLS.append(m_unnamed.group(1))
            seen_any_label = False
            continue
        m_section = SECTION_HEADER_RE.match(s)
        if m_section:
            type_word, name_part = m_section.group(1).strip(), m_section.group(2).strip()
            # "Table column : TABLE_Main.COL_Qty (3)" - the trailing "(3)" is the column's index,
            # not part of its name; kept, the column was named "COL_Qty (3)".
            name_part = ORDINAL_SUFFIX_RE.sub("", name_part)
            declared = TYPE_HEADER_KIND.get(type_word) or DECLARED_TYPE_KIND.get(type_word)
            if type_word == "Table":
                current_table_owner = name_part
                current_kind = "column"
                if NAME_RE.match(name_part):
                    # The table is itself a control, with its own caption and position. Not
                    # recorded, its block ran on into the previous control's, lending it the
                    # table's caption.
                    header_idx.append(i)
                    header_kind[i] = "table"
                    header_full[i] = name_part
                    header_via[i] = "header"
            elif type_word == "Table column" and current_table_owner:
                # individually-detailed column of whichever table we're inside. WinDev desktop
                # prints the column's full path ("TABLE_History.COL_Date"); prefixing the table a
                # second time made it a column of a phantom "TABLE_History.TABLE_History".
                full = name_part if name_part.startswith(current_table_owner + ".") \
                    else f"{current_table_owner}.{name_part}"
                header_idx.append(i)
                header_kind[i] = "column"
                header_full[i] = full
                header_via[i] = "header"
                current_kind = "column"
            elif type_word in TYPE_HEADER_KIND or (declared and " : " in s
                                                   and NAME_RE.match(name_part)):
                # unambiguous "<Type> : <Name>" block - take the name directly and stop
                # tracking whatever block-style section preceded this one.
                current_kind, current_table_owner = None, None
                header_idx.append(i)
                header_kind[i] = declared
                header_full[i] = name_part
                header_via[i] = "header"
                header_decl[i] = type_word
            elif type_word in NON_CONTROL_SECTIONS:
                # The page/window/report itself, not a control on it. Ends whatever
                # block-style section preceded it and contributes nothing.
                current_kind, current_table_owner = None, None
            elif NAME_RE.match(name_part) and len(type_word) > 1 and " : " in s:
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
                #
                # And the colon must be spaced, " : ", as PCSoft prints every declaration. Unspaced
                # it is a property sub-label - "Invalid input: Text", "Left button: Width",
                # "Gallery: Automatic Popup" - or a time mask, "HH:MM", all of which were being
                # listed as control types and their values invented as controls (wxKanban
                # 4cbff833: "'Invalid input', 'Left button', 'Right button', 'HH' were listed as
                # types").
                current_kind, current_table_owner = None, None
                header_idx.append(i)
                header_kind[i] = "control"
                header_full[i] = name_part
                header_via[i] = "header"
                header_decl[i] = type_word
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
        last = s.split(".")[-1]
        m = PREFIX_RE.match(last)
        prefixed = bool(m and m.group(1).upper() in CONTROL_PREFIXES)
        if nxt in PROP_KEYS and not prefixed:
            # A fresh label list starts right after this line - this is noise (e.g. a
            # page running-header artifact like the project name), not real control/
            # column data, which is always followed by its own values, not new labels.
            #
            # Not for a name with a control prefix, though. A WebDev dump opens EVERY control's
            # block with its full path followed straight by a label - "ZONE_Center.CELL_ActionBar.
            # BTN_Apply" / "Note" - so this rule was discarding the controls themselves: half of
            # them on the two WebDev corpora here, which tripped the low-yield warning on 72 of
            # 97 pages and left every button there without its handler (wxKanban f0df8d41).
            continue

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
        if via != "prefix":
            # Where labels and values alternate one-for-one, a word straight after a single label
            # is that label's VALUE: "Border" / "HTML", "Wrapping" / "In line with text". Taken
            # for a control it also cut the real control's block short, so the X/Y position below
            # it was read into the phantom instead (wxKanban f0df8d41). A compact table's first
            # row follows a whole run of labels, or the type header, and is not affected.
            back = [l.strip() for l in lines[max(0, i - 6):i] if l.strip()
                    and l.strip() != "GB" and not LANG_TAG_RE.match(l.strip())][-2:]
            if len(back) == 2 and back[1] in PROP_KEYS and back[0] not in PROP_KEYS \
                    and back[0] not in TYPE_HEADER_KIND:
                continue
        if decl_mode and (via != "prefix" or any(d.startswith(last) for d in declared_names)):
            # A table row or a table value in a dump that declares its controls: the control (if
            # it is one) has its own declaration, and its geometry is joined from the table below.
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
        if full is None:            # a declaration whose name the PDF lost: a boundary only
            continue
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
            decl=header_decl.get(s_i, ""),
            order=order, children=[],
        )
        prev = nodes.get(full)
        vias = (prev["via"], node["via"]) if prev is not None else ()
        if vias and "loose" not in vias and ("prefix" in vias or "header" in vias):
            # The same control printed a second time - a WebDev check box's "Option name" table,
            # a WinDev desktop control's geometry row and then its own "<Type> : <Name>" block.
            # The second print used to REPLACE the first, so whatever only the first carried was
            # lost. Merge instead: the first value found for each property stands, and the kind
            # comes from the stronger evidence (a declared type beats a name prefix). Only for a
            # name that is positively a control: a property value picked up loosely in many
            # places would collect captions from blocks that are not its own.
            for key in ("caption", "title", "state", "visible", "width", "binding", "x", "y"):
                if prev[key] in ("", None):
                    prev[key] = node[key]
            prev["password"] = prev["password"] or node["password"]
            if VIA_RANK.get(node["via"], 0) > VIA_RANK.get(prev["via"], 0):
                prev["kind"], prev["via"], prev["decl"] = node["kind"], node["via"], node["decl"]
            continue
        nodes[full] = node
        order += 1

    # Geometry from the column tables - those in this dump, and the first one or two, which start
    # on the window's last "General information" page and so land in .page.md.
    rows = geometry_rows(lines)
    page_md = path[:-len(".controls.md")] + ".page.md" if path.endswith(".controls.md") else None
    if page_md and os.path.exists(page_md):
        for name, seg_lines in _segments(page_md):
            if name == "General information":
                rows.extend(geometry_rows(seg_lines))
    join_geometry(nodes, rows)

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
        n["children"][:] = in_reading_order(n["children"], layout_key)
    for r in roots:
        fix(r)
    # popups are modal overlays (Y=0) — keep them out of the main flow, render last
    popups = [r for r in roots if r["kind"] == "popup"]
    roots[:] = (in_reading_order([r for r in roots if r["kind"] != "popup"], layout_key)
                + sorted(popups, key=layout_key))
    return roots, nodes


ROW_TOLERANCE = 10   # px: controls whose tops are this close share a row


def in_reading_order(nodes, layout_key):
    """
    Sort sibling controls top-to-bottom, and left-to-right within a row.

    A plain (Y, X) sort put every label AFTER its field: a caption sits a few pixels lower than the
    edit control beside it, so "Name:" rendered under the box it labels, on every form (wxKanban
    6611ee99). Controls whose tops are within ROW_TOLERANCE of the row's first control are one row,
    read by X. Controls with no position keep their document order, after the positioned ones.
    """
    placed = sorted((n for n in nodes if n["y"] is not None), key=layout_key)
    rows = []
    for n in placed:
        if rows and n["y"] - rows[-1][0]["y"] <= ROW_TOLERANCE:
            rows[-1].append(n)
        else:
            rows.append([n])
    ordered = [n for row in rows for n in sorted(
        row, key=lambda n: (n["x"] if n["x"] is not None else 10 ** 9, n["y"], n["order"]))]
    return ordered + sorted((n for n in nodes if n["y"] is None), key=layout_key)


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
    # WebDev browser events, always printed with their "(onload browser event)" annotation. Not
    # recognised, each one's code was appended to the handler above it.
    "Load", "Leave",
)
HANDLER_RE2 = re.compile(
    r"^(" + "|".join(sorted(SEPARATORLESS_EVENTS, key=len, reverse=True)) + r") (\w+)\s*\(")

# The same WinDev events printed with NO parenthesised owner at all - "Click BTN_Save",
# "Initialization of EDT_Date", "End of initialization of TABLE_conslist", "Select a menu in
# MENU_Main.OPT_Quit". Both regexes above end in a required "(", so none of these matched: on the
# 905 real pages here 4,290 "Click X" and 1,986 "Initialization of X" headers went unread, and
# reporters measured 98% and 88% of their applications' event code silently missing from Stage 2
# (wxKanban 10b1b9ce, 8707df30, 625350e0).
#
# Without the parenthesis there is no structural mark left, so this is an exact allow-list of the
# phrases PCSoft prints - every entry was read off the corpora or a field report - and the token
# after the phrase still has to pass the control-name gate. A general "<words> of <name>" form
# also matches property rows the dumps are full of ("Identifier of InvoiceCharges", "Use value
# from gStoredValue", "Data file loaded in memory").
EVENT_PHRASES = (
    "Click", "Click on", "Double click on", "Click on title of", "Click on the arrow of",
    "Click on a link of", "Right click on a link of",
    "Initialization of", "End of initialization of", "Global declarations of",
    "Whenever modifying", "Whenever modifying the list of files selected in",
    "Enter", "Exit", "Entry in", "Exit a row of", "Enter input mode in a row of",
    "Select a row in", "Display a row in", "Filter records of", "Select a menu in",
    "Select an element in", "Modify tab displayed in",
    "Get the Value property of", "Set the Value property of",
    "Request for refreshing the display of", "Display context menu of",
    "Increment", "Decrement", "Mouse leave",
    "Before creating an appointment in", "Enter input mode in an appointment of",
    "Exit input mode in an appointment of", "Select an appointment in",
    "Move an appointment in", "Resize an appointment in", "Delete an appointment from",
    "Reassign an appointment in", "Whenever changing a period in", "Select a period in",
    "Add a widget in", "Delete a widget from", "Move a widget in", "Resize a widget in",
    "Progress of transfer of", "Before loading the HTML page in", "Load resources in",
    "On each search via the search icon in",
    "Close", "Resize",
)
# Events of the window/page itself ("Close Client_Inv_AddCharge"). Their token must BE the page:
# "Close" in front of anything else is not a header.
WINDOW_ONLY_EVENTS = {"Close", "Resize"}
CTRL_PATH = r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*"
HANDLER_RE3 = re.compile(
    r"^(" + "|".join(sorted(EVENT_PHRASES, key=len, reverse=True)) + r") (" + CTRL_PATH
    + r")(?:\s*\(.*)?$")
# "( TableImport )" - the owner WinDev prints after a control's name, with its spaces.
OWNER_RE = re.compile(r"\(\s+([A-Za-z_]\w*)\s+\)")

HANDLERS = {}        # control seg -> list of (event, [code lines])
HANDLER_SRC = {}     # id(code list) -> the header line verbatim, annotations and all
HANDLERS_USED = {}   # handler fn name -> (seg, event, code) actually wired this page
PROCEDURES = []      # (header line, [code lines]) - the page's own local procedures, in order
ORPHANS = []         # code-section lines that sit under no recognised header
NEAR_MISSES = {}     # "<phrase> <real control>" lines that are not a known event phrase -> count

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


def match_handler_header(line, known=(), page=None, bare=True):
    """Return (event phrase, control seg) for a WLanguage event header, else None.

    `page` is the window/page itself: "Global declarations of WIN_Main" names no control, and
    unrecognised it was not merely unwired - its code ran on into the previous handler's body.

    `bare=False` refuses a header with nothing after the control name. parse_handlers passes it
    outside the element's code sections: in a property dump "Exit Queue" is a menu option's
    caption, and "Queue" an identifier-shaped value the control parser picked up.
    """
    for rx in (HANDLER_RE, HANDLER_RE2, HANDLER_RE3):
        m = rx.match(line)
        if not m:
            continue
        event, name = m.group(1).strip(), m.group(2)
        if not bare and not line[m.end(2):].strip():
            continue
        seg = name.split(".")[-1]
        if page and name == page:
            return event, page
        if event in WINDOW_ONLY_EVENTS:
            continue
        if is_handler_control_name(seg, known):
            return event, seg
        # "Click on title of Column1 ( TableImport )": a column called Column1 has no prefix to
        # recognise, but the table that owns it is named in the parentheses. An allow-listed event
        # phrase plus a real owner is evidence enough (wxKanban 10b1b9ce).
        if rx is not HANDLER_RE:
            owner = OWNER_RE.search(line[m.end(2):])
            if owner and (owner.group(1) in known or owner.group(1) == page):
                return event, seg
    return None


def event_label(event):
    """The event phrase without its trailing connector, for listing it beside a control name."""
    return re.sub(r"\s+(?:on|of|in)$", "", event)


# The order an element's sections are printed in the PDF. Read off the breadcrumb of every page of
# the four corpora PDFs here - 912 windows and pages, WinDev and WebDev - and it held for all of them.
# Each PDF page's breadcrumb names the section in force at the TOP of the page, so a section
# begins near the bottom of the page before: the window's code starts under the last "Information
# on controls" page (the end of .controls.md), and a handler opened at the bottom of the last
# "Code" page carries on at the top of the first "Control code" page.
#
# The splitter writes .page.md in a different order (Control code before Code) and the controls in
# a separate file, so read in file order those continuations land ABOVE their header - the
# "header appears after its code" symptom (wxKanban 4cbff833). Sections of one name keep their
# PDF order in the file, so a stable sort into this order puts every page back in sequence.
SECTION_ORDER = ("Image", "General information", "Information on controls",
                 "Information on menus", "Multilingual messages", "Code", "Control code",
                 "Procedures")
CODE_SECTIONS = ("Code", "Control code", "Procedures")
# Sections a block of code can run on into across a page break.
CODE_CHAIN = ("Information on controls", "Information on menus", "Multilingual messages") \
    + CODE_SECTIONS
LOCAL_PROC_RE = re.compile(r"^Local procedure [A-Za-z_]\w*")
PAGE_MARKER_RE = re.compile(r"^<!--\s*p\d+\s*-->$")


def _project_name(src_dir):
    """The application's name from the splitter's _project.md ("# <App> - Project overview")."""
    try:
        with open(os.path.join(src_dir or ".", "_project.md"), encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^#\s+(.+?)\s+-\s+Project overview\s*$", line)
                if m:
                    return m.group(1).strip()
    except OSError:
        pass
    return None


def _segments(path):
    """(section name, lines) in file order, with this tool's own watermark trailer removed."""
    text = _WM_TRAILER_RE.sub("", open(path, encoding="utf-8").read())
    lines = [l.rstrip() for l in text.split("\n")]
    if path.endswith(".controls.md"):
        return [("Information on controls", lines)]
    segs, name, cur = [], "", []
    for l in lines:
        if l.startswith("## "):
            segs.append((name, cur))
            name, cur = l[3:].strip(), []
        else:
            cur.append(l)
    segs.append((name, cur))
    return segs


def parse_handlers(*paths, known=(), page=None):
    """
    Extract WLanguage event-handler blocks from the given files (controls + page).

    The files are read as ONE stream in PDF order (see SECTION_ORDER), so a block runs on across
    a page break instead of ending at it. It used to end at every "## " heading - which the
    splitter writes once per PDF page - so a handler longer than the rest of its page lost its
    tail: ELSE branches, the transaction commit, the WHEN EXCEPTION clause (wxKanban 8707df30).
    A block ends at the next header, at a "Local procedure", at the in-page heading of the next
    section ("<PAGE>" over "Control code"), or where the stream leaves the element's code.
    """
    HANDLERS.clear()
    HANDLER_SRC.clear()
    PROCEDURES.clear()
    ORPHANS.clear()
    NEAR_MISSES.clear()
    segments, project = [], None
    for path in paths:
        if path and os.path.exists(path):
            segments.extend(_segments(path))
            project = project or _project_name(os.path.dirname(path))
    rank = {name: i for i, name in enumerate(SECTION_ORDER)}
    segments.sort(key=lambda s: -1 if s[0] == "" else rank.get(s[0], len(SECTION_ORDER)))

    cur = None         # the code list being collected, or None
    sub = None          # the section in force
    in_code = False     # inside the element's code - only there does a block cross a page
    for name, lines in segments:
        if name in CODE_CHAIN:
            if not in_code:
                cur = None
            in_code = in_code or name in CODE_SECTIONS
        else:
            cur, in_code = None, False
        sub = name
        text = [l for l in lines if l.strip() and not PAGE_MARKER_RE.match(l.strip())]
        # A running header reprinted at the top of the page: "<App>" / "<PAGE>" / "Control code".
        if (project and len(text) >= 3 and text[0].strip() == project
                and text[1].strip() == page and text[2].strip() == sub):
            text = text[1:]
        i = 0
        while i < len(text):
            l = text[i]
            s = l.strip()
            nxt = text[i + 1].strip() if i + 1 < len(text) else ""
            # "<PAGE>" over a section name is the heading of the next section. The same section
            # name again is that heading reprinted at a page break: the block carries on. A long
            # page name is wrapped over two lines by the PDF column.
            width = 0
            if page and s == page and nxt in SECTION_ORDER:
                width = 2
            elif (page and len(s) >= 8 and s + nxt == page and i + 2 < len(text)
                  and text[i + 2].strip() in SECTION_ORDER):
                nxt, width = text[i + 2].strip(), 3
            if width:
                if nxt != sub:
                    cur, sub = None, nxt
                    in_code = in_code or nxt in CODE_SECTIONS
                i += width
                continue
            m = match_handler_header(s, known, page, bare=in_code)
            if m:
                event, seg = m
                cur = []
                HANDLERS.setdefault(seg, []).append((event, cur))
                HANDLER_SRC[id(cur)] = s
            elif in_code and LOCAL_PROC_RE.match(s):
                cur = []
                PROCEDURES.append((s, cur))
            elif cur is not None:
                cur.append(l)
            elif in_code:
                ORPHANS.append(l)
                near = re.match(r"^([A-Z][a-z]+(?: [a-z]+){0,8}) (" + CTRL_PATH + r")(?:\s*\(.*)?$", s)
                if near and (near.group(2).split(".")[-1] in known or near.group(2) == page):
                    NEAR_MISSES[s] = NEAR_MISSES.get(s, 0) + 1
            i += 1


def handler_fn(seg, suffix=""):
    """A JS identifier for a handler: a page name can carry characters an identifier cannot."""
    return "on" + re.sub(r"\W", "_", seg) + suffix


def handler_for(seg):
    """Return (fn_name, event, code) for the first handler of a control, or None."""
    hs = HANDLERS.get(seg)
    if not hs:
        return None
    event, code = hs[0]
    fn = handler_fn(seg)
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
GAP_CONTROLS = {}  # gap kind -> the controls rendered as that placeholder on the current page
# Gap kinds whose placeholder has always stood alone (their children were never rendered).
LEGACY_GAP_KINDS = {"richtext", "gallery", "upload", "captcha", "chart"}


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
    decl = node.get("decl") or ""
    if k == "control" and decl:
        # Declared as "<Type> : <Name>" with a type this script does not map. It used to fall
        # through to the "pure layout leaf" case below and return nothing - deleted from the
        # .tsx while the run said "rendered generically, not dropped" (wxKanban 6611ee99).
        k = "unmapped"
    if k in GAP_RECO and k not in ("table", "looper"):
        GAPS_HIT.add(k)
        GAP_CONTROLS.setdefault(k, []).append(f"{node['seg']} ({decl})" if decl else node["seg"])
        text = f"[{node['seg']}] " + (f"{decl}: " if k == "unmapped" else "") + GAP_RECO[k]
        gap = V("div", "wx-gap", text=text, attrs={"data-gap": k})
        kids = [x for x in (build_vnode(c) for c in node["children"]) if x] \
            if k not in LEGACY_GAP_KINDS else []
        # A sidebar's panes, a dashboard's widgets: the controls inside a placeholder are real
        # and stay on the page.
        return V("div", "", children=[gap] + kids) if kids else gap
    if k == "separator":
        return V("div", "wx-sep")
    if k == "progress":
        # Recognised since b91866bf, but no branch rendered it, so it fell through to "pure layout
        # leaf" and every progress bar was still dropped from the page. shadcn has the primitive.
        return V("progress", "wx-progress", attrs={"value": "0", "max": "100"},
                 shadcn="Progress")
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
    "wx-progress": "w-full max-w-xl h-2 my-2",
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
    if v.shadcn == "Progress":
        return f'{pad}<Progress value={{0}} className="{cls}" />'
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


def page_code_note():
    """
    Carry the page's local procedures, and any code that sits under no recognised header.

    A "Local procedure" ends the handler above it. While it was not recognised, the procedure ran on
    into that handler's body and was ported as part of an event it does not belong to; recognised,
    it has to be carried here or its code is gone. Code under no header at all is listed too, so a
    header shape this script has never seen loses nothing - it shows up here, and in the run's
    warning, instead of vanishing.
    """
    out = []
    if PROCEDURES:
        out.append("// Local procedures of this page — legacy WLanguage called by the handlers; "
                   "port alongside them:")
        for src, code in PROCEDURES:
            out.append(f"//   {src}")
            out.extend(f"//     {ln}" for ln in code)
    if ORPHANS:
        out.append("// WLanguage under no recognised event header (see the Stage 2 warning) — "
                   "kept, not attributed:")
        out.extend(f"//     {ln}" for ln in ORPHANS)
    return "\n".join(out) + "\n" if out else ""


PLANE_NOTE = []   # header-comment lines describing the page's planes (set by main)


def plane_note(nodes):
    """
    Which control sits on which plane, when the window has more than one.

    A WinDev window shows one plane at a time (MyWindow..Plane), and the geometry tables say which
    planes each control is on. The generated page renders every plane at once, so the rebuild has
    to split them into views - which needs the membership, not just the fact (wxKanban 6611ee99).
    A switcher is not generated: which plane shows when is decided in the WLanguage.
    """
    sets = {}
    for n in nodes.values():
        if n.get("synth") or not n.get("plane"):
            continue
        sets[n["seg"]] = frozenset(p for p in n["plane"].split(",") if p != "0")
    planes = sorted(set().union(*sets.values()) if sets else set(), key=int)
    if len(planes) < 2:
        return []
    groups = {}
    for seg, ps in sets.items():
        if ps and ps != set(planes):
            groups.setdefault(ps, []).append(seg)
    out = [f"// PLANES: this window switches between planes {', '.join(planes)} (MyWindow..Plane). "
           "All of them are rendered at once",
           "// below - split them into views. Controls not listed are on every plane:"]
    for ps, segs in sorted(groups.items(), key=lambda kv: sorted(kv[0], key=int)):
        out.append(f"//   plane {','.join(sorted(ps, key=int))}: " + ", ".join(sorted(segs)))
    return out


def render_tsx(page, roots):
    body = to_jsx(build_page(roots), 2)
    comp = re.sub(r"\W", "", page)
    handlers, procs = emit_handlers()
    proc_note = "".join(l + "\n" for l in PLANE_NOTE) + unwired_handler_note() + page_code_note()
    if procs:
        proc_note += ("// Server procedures referenced by this page (become API endpoints — "
                      "see the converted .proc.md):\n//   "
                      + ", ".join(sorted(procs)) + "\n")
    handler_block = ("\n" + handlers + "\n") if handlers else ""
    extra_imports = ('import { Progress } from "@/components/ui/progress";\n'
                     if "<Progress " in body else "")
    return f"""// {page}.tsx - regenerated from legacy WebDev page {page}
// Stack: React + Tailwind + shadcn/ui (stack.md). Primary = indigo-600.
// Event handlers below are ported from the legacy WLanguage (review & implement).
{proc_note}import {{ Button }} from "@/components/ui/button";
import {{ Input }} from "@/components/ui/input";
import {{ Select }} from "@/components/ui/select";
import {{ Tabs, TabsList, TabsTrigger, TabsContent }} from "@/components/ui/tabs";
{extra_imports}
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
            fn = handler_fn(seg) if i == 0 else handler_fn(seg, f"_{i + 1}")
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
    proc_note = page_code_note()
    if procs:
        proc_note += ("// Server procedures referenced by this page (become API endpoints — "
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

Pages listed here were NOT laid out ("no layout emitted"), or were laid out with controls this
converter renders only as a placeholder ("component gaps"). Each entry says why. Control names and
events come from the dump verbatim and can be trusted; build what is missing from the running
application or its screenshots.
"""


# The watermark front matter and trailer rd.write_text() adds. This file is read-modify-written
# once per refused page, so both have to come off before it is written back — otherwise the
# re-stamp appends a second set of wxkanban* keys on every page after the first.
_WM_TRAILER_RE = re.compile(r"\n+---\s*\n+<!-- wxkanban:watermark -->.*\Z", re.S)
_WM_FRONTMATTER_RE = re.compile(r"\A---\r?\n(?:wxkanban\w+:[^\r\n]*\r?\n)+---\r?\n\s*")


def unstamp(md):
    """Strip the watermark front matter and trailer, so the content can be rewritten and re-stamped."""
    return _WM_FRONTMATTER_RE.sub("", _WM_TRAILER_RE.sub("", md or "")).strip()


def _write_gap_entry(gaps_path, marker, entry, state):
    """
    Put one page's entry into the gaps report, creating the report if this is the first one.

    A re-run of the same page replaces its entry and never duplicates it. Only that entry is
    replaced: everything after the marker used to be cut, so re-running one page deleted the
    entries of every page recorded after it.
    """
    os.makedirs(os.path.dirname(gaps_path) or ".", exist_ok=True)
    existing = ""
    if os.path.exists(gaps_path):
        existing = unstamp(open(gaps_path, encoding="utf-8").read())
    if not existing.strip():
        existing = GAPS_HEADER
    if marker in existing:
        head, rest = existing.split(marker, 1)
        nxt = rest.find("\n## ")
        tail = rest[nxt:] if nxt >= 0 else ""
        existing = head.rstrip() + "\n" + tail
    rd.write_text(gaps_path, existing.rstrip() + "\n" + entry, state)


def record_layout_gap(gaps_path, page, src, reason, state):
    """Append this page to the rebuild's gaps report, creating it if this is the first one."""
    marker = f"\n## {page} — no layout emitted\n"
    controls = "\n".join(f"- `{seg}` — " + ", ".join(event_label(ev) for ev, _ in hs)
                         for seg, hs in sorted(HANDLERS.items())) \
        or "- (no handler headers found either — nothing about this page is recoverable)"
    entry = (f"{marker}\n"
             f"**Source:** `{src}`\n\n"
             f"**Why:** {reason}.\n\n"
             f"**Controls and events recovered from the handler headers:**\n\n{controls}\n")
    _write_gap_entry(gaps_path, marker, entry, state)


def record_component_gaps(gaps_path, page, src, state):
    """
    Record the controls this page renders only as a GAP placeholder, and those it could not name.

    Every placeholder in the .tsx says "see rebuild/COMPONENT-GAPS.md", and nothing wrote that file
    unless a page was refused outright - so the promise pointed at nothing (wxKanban 6611ee99).
    """
    gaps = {k: v for k, v in GAP_CONTROLS.items() if k not in ("table", "looper")}
    if not gaps and not UNNAMED_DECLS:
        return False
    marker = f"\n## {page} — component gaps\n"
    lines = [f"- **{k}** — {GAP_RECO[k]}: " + ", ".join(f"`{c}`" for c in sorted(set(v)))
             for k, v in sorted(gaps.items())]
    if UNNAMED_DECLS:
        counts = {}
        for t in UNNAMED_DECLS:
            counts[t] = counts.get(t, 0) + 1
        lines.append("- **name lost** — declared with no name (the PDF column cut it), so not "
                     "rendered: " + ", ".join(f"{n} × {t}" for t, n in sorted(counts.items())))
    entry = f"{marker}\n**Source:** `{src}`\n\n" + "\n".join(lines) + "\n"
    _write_gap_entry(gaps_path, marker, entry, state)
    return True


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
    """Lower-cased names of the project's data files, queries and windows/pages, from the
    splitter's own filenames. A control bound to a query prints "QRY_Orders.Status" exactly as one
    bound to a data file prints "Orders.Status", and an internal window names the window it hosts;
    none of them is a control on this page."""
    cached = _DATA_FILE_CACHE.get(src_dir)
    if cached is None:
        try:
            cached = {fn.rsplit(".", 2)[0].lower() for fn in os.listdir(src_dir or ".")
                      if fn.endswith((".table.md", ".qry.md", ".page.md"))}
        except OSError:
            cached = set()
        _DATA_FILE_CACHE[src_dir] = cached
    return cached


def warn_low_yield(path, n_ctl, nodes=None):
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
    # Not past the start of the element's code, whose identifiers are variables, not controls.
    stop = code_heading_index([l.strip() for l in raw], os.path.basename(path).split(".")[0])
    if stop is not None:
        raw = raw[:stop]
    # A dotted identifier whose first segment names a DATA FILE is an HFSQL binding
    # ("SiteOwners.Owner_UniqueID"), not a control. Counted as control-shaped names they inflated
    # the denominator and tripped this warning on 10 pages whose extraction was in fact complete -
    # the @@CONTROL marker count matched the parsed count on every one of them (wxKanban 11207b9f).
    # (Minus this page itself: a WinDev desktop dump paths its controls "<PAGE>.TAB_Main.EDT_X".)
    known_tables = _known_data_files(os.path.dirname(path)) - {
        os.path.basename(path).split(".")[0].lower()}
    candidates = {
        l.strip() for l in raw
        if CANDIDATE_NAME_RE.match(l.strip() or "") and ("_" in l or "." in l)
        and l.strip().split(".")[0].lower() not in known_tables
    }
    if nodes is not None:
        # In a WinDev desktop dump one control is named up to three times - its declared path
        # ("TAB_Main.EDT_Date"), its geometry-table row ("EDT_Date"), and that row's name cut short
        # by the PDF column ("EDT_Dat") - which the old count took for three controls. Those
        # phantoms used to be parsed as controls too, which hid the double count; now that they
        # are not, count each name once.
        segs = {n["seg"] for n in nodes.values()}
        candidates = {c.split(".")[-1] if c.split(".")[-1] in segs else c for c in candidates}
        candidates = {c for c in candidates
                      if c in segs or not any(s != c and s.startswith(c) for s in segs)}
    if len(candidates) >= 10 and n_ctl < len(candidates) * 0.8:
        print(f"  !! WARNING: {n_ctl} controls parsed, but the dump names "
              f"{len(candidates)} control-shaped identifiers.")
        print("     Controls are being missed - most likely a name shape or a declared type this")
        print("     parser does not recognize. Review the generated .tsx directly rather than")
        print("     trusting the count.")

    if UNKNOWN_TYPES:
        print(f"  !! {len(UNKNOWN_TYPES)} unrecognized control type(s) - each control is kept as a "
              "visible GAP placeholder, not dropped:")
        for type_word, names in sorted(UNKNOWN_TYPES.items()):
            shown = ", ".join(names[:4]) + (f" …+{len(names) - 4}" if len(names) > 4 else "")
            print(f"       {type_word}: {shown}")
        print("     Report these to wxKanban (project_submit_feedback) so the type ships mapped "
              "and renders correctly.")
    if GEOMETRY_UNMATCHED:
        shown = ", ".join(sorted(set(GEOMETRY_UNMATCHED))[:6])
        print(f"  !! {len(GEOMETRY_UNMATCHED)} geometry-table row(s) match no control - the name "
              f"is cut by the PDF column and ambiguous ({shown}). Those controls keep document "
              "order, after the positioned ones.")
    if PLANE_NOTE:
        print("  !! " + PLANE_NOTE[0][3:].split(" (MyWindow")[0] + " - all are rendered at once; "
              "the .tsx header lists which control is on which plane.")
    if UNNAMED_DECLS:
        print(f"  !! {len(UNNAMED_DECLS)} control declaration(s) carry no name - the PDF column cut "
              "it off - so those controls are not rendered:")
        counts = {}
        for t in UNNAMED_DECLS:
            counts[t] = counts.get(t, 0) + 1
        print("       " + ", ".join(f"{n} x {t}" for t, n in sorted(counts.items())))


def report_handler_yield():
    """
    Say how much of the page's behaviour was read, and shout when some of it was not.

    The control count above says nothing about behaviour. A run that read no event header at all
    printed the same healthy summary as a complete one and wrote a .tsx of layout-only shells, which
    reads as "this legacy page had no code" rather than "we failed to read it" - the costliest
    failure a conversion can have, and three reports found it only by auditing the output by hand
    (wxKanban 10b1b9ce, 625350e0, f0df8d41).
    """
    n_ev = sum(len(hs) for hs in HANDLERS.values())
    print(f"  event handlers: {n_ev} read, {len(HANDLERS_USED)} attached to an element "
          f"(the rest are carried as comments); local procedures: {len(PROCEDURES)}")
    if not ORPHANS:
        return
    if not n_ev and not PROCEDURES:
        print(f"  !! WARNING: this page's code sections hold {len(ORPHANS)} line(s) of WLanguage, "
              "but NOT ONE event header in them was recognised - none of its behaviour is wired.")
    else:
        print(f"  !! {len(ORPHANS)} line(s) of WLanguage sit under no recognised event header - "
              "kept in the .tsx, but not attributed to any control.")
    if NEAR_MISSES:
        print("     These lines name a control of this page but lead with a phrase this script does "
              "not know as an event:")
        for s, n in sorted(NEAR_MISSES.items(), key=lambda kv: -kv[1])[:6]:
            print(f"       {s!r}" + (f" x{n}" if n > 1 else ""))
    print("     If one of them IS an event header, report its wording to wxKanban "
          "(project_submit_feedback).")


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

    # One run per page into a shared folder: continue the ledger instead of overwriting it, and
    # number above the splitter's tokens already in the page text (wxKanban f6df3914).
    state = rd.RedactionState.resume(os.path.join(args.out, rd.SIDECAR_NAME),
                                     os.path.join(os.path.dirname(args.page), rd.SIDECAR_NAME))
    page = os.path.basename(args.page).split(".")[0]
    roots, nodes = parse_controls(args.page)
    GAPS_HIT.clear()
    GAP_CONTROLS.clear()
    HANDLERS_USED.clear()
    PLANE_NOTE[:] = plane_note(nodes)
    parse_handlers(args.page, args.page.replace(".controls.md", ".page.md"),
                   known={n["seg"] for n in nodes.values()}, page=page)

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
        report_handler_yield()
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
        warn_low_yield(args.page, n_ctl, nodes)
        report_handler_yield()
        print(f"  -> {tsx_path}")
        print(f"  -> {html_path}")
        if record_component_gaps(args.gaps_out, page, args.page, state):
            print(f"  -> {args.gaps_out}")
        print(f"  captions needing review (GB/empty): ~{n_todo}")
    if GAPS_HIT:
        print("  component gaps (no shadcn primitive — see rebuild/COMPONENT-GAPS.md):")
        for g in sorted(GAPS_HIT):
            print(f"    - {g}: {GAP_RECO[g]}")

    sidecar_path = os.path.join(args.out, rd.SIDECAR_NAME)
    if rd.ledger_changed(state):
        rd.write_text(sidecar_path, rd.render_sidecar(state), state)
    print(rd.summary_line(state, sidecar_path))
    return rd.exit_code(len(state.findings), args.fail_on_secrets)


if __name__ == "__main__":
    sys.exit(main())
