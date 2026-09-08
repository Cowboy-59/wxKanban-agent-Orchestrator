#!/usr/bin/env python3
"""
pcsoft-doc-split.py - Split a PCSoft (WinDev/WebDev) generated *technical documentation*
PDF into one Markdown file per project element, deterministically (no LLM tokens).

The PDF has no bookmarks, but every page carries a breadcrumb running header:
    Part N <bullet> Type <bullet> Element <bullet> Subsection
We use that breadcrumb to group consecutive pages by element and emit:
    <name>.table.md    (Analysis - HFSQL data files)
    <name>.page.md     (windows / pages / templates: General info + Control code + Code + Procedures)
    <name>.controls.md (the verbose "Information on controls" dump, faithful sidecar)
    <name>.qry.md      (HFSQL queries)
    <name>.report.md   (reports)
    <name>.proc.md     (Sets of procedures - server & global WLanguage logic, incl. triggers)
    _project.md        (Project - project overview / element list / code stats)
    _schema.md         (Analysis - analysis overview / item dictionary / links)
    index.md           (manifest of everything)
    _discarded.md      (pages NOT captured by any element - review before discarding; written
                        only when something was dropped, so a real element behind an unmapped
                        breadcrumb Type is surfaced for the developer to keep)

Classification is driven by the breadcrumb *Type* segment (segs[1]), NOT the Part NUMBER:
part numbering is not stable across PCSoft exports (queries land in Part 4 in some docs and
Part 6 in others; procedure sets in Part 5 or Part 7), so keying on the number silently
dropped whole sections (real queries, the entire procedure/trigger layer).

Usage:
    python scripts/pcsoft-doc-split.py --pdf conversion/docs/WW_Newsletter_Documentation.pdf --out pre-convert
"""
import argparse
import os
import re
import unicodedata
import sys

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
import wxconv_redact as rd  # noqa: E402 - the watermark stamp now lives inside rd.write_text()

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF not installed. Run: pip install pymupdf")

BULLET = "•"  # real bullet
# Breadcrumb separator in this doc family extracts as U+203A (single right angle quote);
# also accept U+2039 and various bullets for other doc variants.
SEP_RE = re.compile("\\s*[›‹•·▪∙�]\\s*")
DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")

# cp1252 -> utf8 mojibake repairs (keys are explicit codepoints, no pasted glyphs)
MOJIBAKE = {
    "�": BULLET,   # replacement char used for the breadcrumb bullet
    "’": "'", "‘": "'",
    "“": '"', "”": '"',
    "–": "-", "—": "-",
    " ": " ",
}


def clean_text(s: str, state=None, source: str = "") -> str:
    for k, v in MOJIBAKE.items():
        s = s.replace(k, v)
    # [SCOPE 125 / T008] Credential redaction runs HERE — after the mojibake repair and before
    # breadcrumb parsing — so no page body ever holds a credential literal. Every emitted file,
    # _discarded.md and index.md included, is assembled from these bodies, so this single call
    # covers every path text can take out of the PDF. `state` is optional so the function stays
    # callable (and testable) without a redaction run.
    if state is not None:
        s, _ = rd.redact(s, state, source=source)
    return s


def crumb_segments(page_text: str):
    """Return the breadcrumb segments from the first non-empty line of a page."""
    for line in page_text.split("\n"):
        if line.strip():
            return [seg.strip() for seg in SEP_RE.split(line.strip()) if seg.strip()]
    return []


def strip_header(page_text: str, project_name: str, page_no: int) -> str:
    """Remove the repeated breadcrumb / date / page-number / project-title header lines."""
    lines = page_text.split("\n")
    out = []
    removed_breadcrumb = removed_date = removed_pageno = removed_title = False
    for i, ln in enumerate(lines):
        s = ln.strip()
        if i < 6:
            if not removed_breadcrumb and SEP_RE.search(s) and s.startswith("Part"):
                removed_breadcrumb = True
                continue
            if not removed_date and DATE_RE.match(s):
                removed_date = True
                continue
            if not removed_pageno and s == str(page_no):
                removed_pageno = True
                continue
            if not removed_title and s == project_name:
                removed_title = True
                continue
        out.append(ln)
    while out and not out[0].strip():
        out.pop(0)
    while out and not out[-1].strip():
        out.pop()
    return "\n".join(out)


# ---- element-key extraction per part -------------------------------------------------

WRAPPER_SEGS = {"Data files and items", "Files and items", "Tables and items", "Analysis",
                "Database schema", "Project", "Page", "Query", "Set of procedures", "..."}

# Breadcrumb subsection labels that mark a per-data-file structure dump. WinDev desktop docs
# use "Files and items"; some WebDev variants use "Data files and items".
TABLE_SUBSECTIONS = ("Data files and items", "Files and items", "Tables and items")

# Exact-string matching against English cost one customer 48 tables: their export used a heading
# variant not in the tuple, every data-file page fell through to the "schema" bucket, and the run
# reported success having written zero .table.md files. PCSoft is a French product and exports are
# generated in the IDE's language, so the string is not even reliably English.
#
# Match on MEANING instead: a data-file word AND an item word in the same heading. That tolerates
# word order, connectors, articles and pluralisation, which exact strings do not. Accents are
# stripped before comparison so "données" matches "donnees".
_DATAFILE_WORDS = (
    "data file", "datafile", "file",           # en
    "fichier", "fichiers de donnees",          # fr
    "fichero", "archivo",                      # es
    "datei", "datendatei",                     # de
    "arquivo", "ficheiro",                     # pt
    # it uses "file" (borrowed) - covered above
)
_ITEM_WORDS = (
    "item", "iten",                            # en / pt ("itens" is the pt plural)
    "rubrique",                                # fr - WinDev's word for a field
    "campo", "rubrica",                        # es / pt / it
    "element", "feld",                         # de
    "voce", "voci",                            # it
)


def _fold(text):
    """Lowercase and strip accents, so localized headings compare on their letters."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def is_table_subsection(sub, extra=()):
    """True when this breadcrumb subsection names a per-data-file item dump, in any language."""
    if not sub:
        return False
    if sub in TABLE_SUBSECTIONS or sub in extra:
        return True
    folded = _fold(sub)
    if any(_fold(e) == folded for e in extra):
        return True
    has_file = any(w in folded for w in _DATAFILE_WORDS)
    has_item = any(w in folded for w in _ITEM_WORDS)
    return has_file and has_item

# Map the breadcrumb *Type* segment (segs[1]) to an output kind. Keyed on the Type, not the
# Part number, because part numbering is not stable across PCSoft exports (queries: Part 4 or
# Part 6; procedure sets: Part 5 or Part 7). Keying on the number silently dropped elements.
TYPE_KIND = {
    "Project": "project",
    "Analysis": "analysis",                  # -> table (per data file) or schema (overview)
    # WebDev exports name the analysis "Database schema" and its per-table subsection "Tables and
    # items". Unmapped, the Type classified as nothing and the ENTIRE data model went to
    # _discarded.md while the run exited 0 - 296 pages and all 112 tables on one report
    # (wxKanban 11207b9f), 27 of 30 pages and all 12 tables on another (b9942029).
    "Database schema": "analysis",
    "Query": "qry",
    "Report": "report",
    "Set of procedures": "proc",
    "Collection of procedures": "proc",
    "Class": "proc",
    "Table of contents": "toc",
}
# Any Type naming a window/page/template ("WINDEV window", "WINDEV window template",
# "WEBDEV page", "Internal window", "Mobile window", ...) is a UI element -> page.
PAGE_TYPE_RE = re.compile(r"\b(window|page)\b", re.I)


EXTRA_TABLE_SUBSECTIONS = []   # filled from --table-subsection

# A breadcrumb segment PCSoft replaced because the path was too wide to print.
ELIDED_RE = re.compile(r"^\.{2,}$|^…$")

# The per-data-file page opens with "<name> data file items" (and its localized equivalents),
# which is how an elided breadcrumb is recovered from content.
ITEM_HEADER_RE = re.compile(
    # "data" is optional: WinDev desktop English prints "<name> file items" and WebDev prints
    # "<name> table items", where other exports print "<name> data file items". Requiring the
    # full phrase cost one conversion all 145 data files - 151 pages went to _discarded.md and
    # Stage 3 refused for want of any *.table.md (wxKanban 3060d36a, b9942029).
    r"^(?P<name>\S+)\s+(?:(?:data\s+)?(?:file|table)\s+items"   # en
    r"|rubriques\s+du\s+fichier"                        # fr
    r"|campos\s+del\s+(?:fichero|archivo)"              # es
    r"|elemente\s+der\s+datei|felder\s+der\s+datei"     # de
    r"|voci\s+del\s+file"                               # it
    r"|itens\s+do\s+(?:arquivo|ficheiro))",             # pt
    re.I,
)


# The Analysis "General information" page prints its counts as a block of labels followed by a
# block of numbers, in the same order:
#     Generation #  /  Number of data files  /  Nb items  /  Nb links  /  Nb connections  /  Nb groups
#     1  /  25  /  130  /  26  /  0  /  0
# The label wraps ("Number of data" / "files"), so the labels are matched on their leading words.
_COUNT_LABELS = (
    re.compile(r"^generation\s*#", re.I),
    # "Number of tables" is the WebDev wording; PPE prints the label WRAPPED across two lines
    # ("Number of data" / "files"), so the file-word tail must stay optional or the gate that
    # compares declared-vs-written silently never runs (wxKanban 11207b9f).
    re.compile(r"^(number of (data|tables?)|nb (data )?(files?|tables?)"
               r"|nombre de (fichiers|tables))", re.I),
)


def declared_datafile_count(pages):
    """The data-file count the analysis states about itself, or None if not found."""
    for p in pages:
        if p.get("kind") != "schema":
            continue
        lines = [l.strip() for l in (p.get("body") or "").split("\n") if l.strip()]
        for i, line in enumerate(lines):
            if not _COUNT_LABELS[1].match(line):
                continue
            # Numbers follow the label block; the data-file count is the one after the
            # generation number, so take the first run of integers and read its second entry.
            nums = []
            for cand in lines[i:]:
                if re.fullmatch(r"\d+", cand):
                    nums.append(int(cand))
                elif nums:
                    break
            if len(nums) >= 2:
                return nums[1]
    return None


def recover_table_name(body):
    """Find the data-file name from a page body when the breadcrumb could not supply it."""
    for line in (body or "").split("\n")[:40]:
        m = ITEM_HEADER_RE.match(line.strip())
        if m:
            return m.group("name")
    return None


# Words that mean "the data model" in a breadcrumb Type, across the export languages this kit has
# met. Used only by the safety gate below - never to classify a page - so a loose match here costs
# at most a warning, while a miss costs the entire schema.
_ANALYSIS_TYPE_WORDS = ("analys", "analis", "schema", "schéma", "esquema", "datenmodell", "modele")


def _looks_like_analysis_type(typ):
    """True when a breadcrumb Type names the data model, whether or not TYPE_KIND maps it."""
    folded = _fold(typ or "")
    return any(w in folded for w in (_fold(x) for x in _ANALYSIS_TYPE_WORDS))


def recover_element_name(body):
    """
    Find an element's name from a page body when the breadcrumb carried no Element segment.

    The first content page of each Part carries a divider-style breadcrumb ("Part N > Type") with
    no Element, so classify() places the Type but leaves name None and key_for() then drops the
    page. It is real content: on one export it cost a class its opening declarations and a
    procedure set its first procedure, and on another an entire query's General information
    section (wxKanban 19db1f08, a075d21f).

    Such a page opens with the element name and then its subsection. The Part DIVIDER page itself
    opens with "Part N", which is what excludes it from this recovery.
    """
    lines = [l.strip() for l in (body or "").split("\n") if l.strip()]
    if not lines or re.match(r"^Part\s+\d+", lines[0]):
        return None
    # An element name is an identifier, never a sentence: this is the same shape test the item
    # parser uses, and it is what keeps prose pages from inventing an element.
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.\-]*", lines[0]) and len(lines[0]) <= 64:
        return lines[0]
    return None


# A breadcrumb segment that is a filesystem path to the analysis. Analysis breadcrumbs embed it,
# which is precisely why they are the ones PCSoft elides for width.
# No trailing word boundary: this replaced a plain `".ana" in s` substring test, and a boundary
# would stop excluding a segment like "Model.analysis" that the substring test excluded.
ANALYSIS_PATH_RE = re.compile(r"\.(?:wda|ana)", re.I)


def name_from_breadcrumb(segs, extra=()):
    """
    The element name a breadcrumb carries, ignoring wrapper labels and filesystem paths.

    An elided Type does not erase the name. 'Part 2 > ... > Tables and items > Job_Spec >
    Tables and items' still says Job_Spec, which is why this is a stronger recovery than reading
    the page body: the body header is printed only on a table's FIRST page, and only in wordings
    the header regex happens to know.

    Subsection labels are excluded BY MEANING as well as by the wrapper set, because a heading
    variant that only is_table_subsection() recognises would otherwise survive the filter and be
    returned as the table's own name.
    """
    cand = [s for s in segs[:-1]
            if s not in WRAPPER_SEGS and not s.startswith("Part")
            and not ANALYSIS_PATH_RE.search(s) and "\\" not in s
            and not is_table_subsection(s, extra)]
    return cand[-1] if cand else None


def breadcrumb_is_analysis(segs, extra=()):
    """
    True when a breadcrumb belongs to the data model even though its Type segment was elided.

    Two independent signals, either of which is conclusive: a segment that is the .wda/.ana path,
    or a segment that names a per-data-file item dump.
    """
    return any(ANALYSIS_PATH_RE.search(s) or is_table_subsection(s, extra) for s in (segs or []))


def place_elided_page(typ, sub, segs, body, extra=()):
    """
    Place a page whose breadcrumb Type PCSoft elided to "...", or return None to leave it alone.

    PCSoft elides when the breadcrumb is too wide, and Analysis breadcrumbs embed the full
    .ana/.wda filesystem path — so Analysis pages are exactly the ones that get elided, and the
    pages lost this way are the ones with the LONGEST names, not the least important ones.

    Three sources of truth, strongest first:

    1. the page body's "<name> ... items" header — but it is printed only on a table's FIRST page,
       and only in the wordings ITEM_HEADER_RE knows;
    2. the BREADCRUMB, which names the table on EVERY page of it. One WEBDEV export lost all 43
       tables and its entire analysis because only (1) was tried and its body header used a
       wording ITEM_HEADER_RE did not have — 109 pages discarded on a run that exited 0
       (wxKanban 7ce2f50a). `--table-subsection` could not rescue it either: that flag feeds only
       is_table_subsection(), which classify() consults on its 'Analysis' branch, and an elided
       Type never reaches that branch. Consulting it HERE is what makes the documented remedy work
       for the case that actually needs it;
    3. failing a name, whether the breadcrumb proves this is the data model at all — the Item
       dictionary, the ER chart, General information, Links carry no element name, and _schema.md
       is what reads them. Without them Stage 3 has no dictionary to reconcile against.
    """
    if not ELIDED_RE.match(typ or ""):
        return None
    name = recover_table_name(body)
    if not name and is_table_subsection(sub, extra):
        name = name_from_breadcrumb(segs, extra)
    if name:
        return ("table", name, "Data files and items")
    if breadcrumb_is_analysis(segs, extra):
        return ("schema", None, sub or "Analysis")
    return None


def classify(segs):
    """
    Map a page's breadcrumb to (part_num, group_kind, element_name, subsection).
    group_kind in {project, schema, table, page, qry, report, proc, toc, other}.
    Driven by the Type segment (segs[1]); element_name is None for grouped buckets.
    """
    if not segs or not segs[0].startswith("Part"):
        return (0, "other", None, None)
    m = re.match(r"Part\s+(\d+)", segs[0])
    part = int(m.group(1)) if m else 0
    typ = segs[1] if len(segs) > 1 else ""
    sub = segs[-1] if len(segs) > 1 else ""
    kind = TYPE_KIND.get(typ)

    if kind == "project":
        return (part, "project", None, sub)
    if kind == "analysis":
        if is_table_subsection(sub, EXTRA_TABLE_SUBSECTIONS):
            name = name_from_breadcrumb(segs, EXTRA_TABLE_SUBSECTIONS)
            if name:
                return (part, "table", name, "Data files and items")
        return (part, "schema", None, sub)
    if kind in ("qry", "report", "proc"):
        name = segs[2] if len(segs) > 2 else None
        return (part, kind, name, sub)
    if kind == "toc":
        return (part, "toc", None, sub)
    if kind is None and PAGE_TYPE_RE.search(typ):
        name = segs[2] if len(segs) > 2 else None
        return (part, "page", name, sub)
    return (part, "other", None, sub)


SUFFIX = {"table": ".table.md", "page": ".page.md", "qry": ".qry.md",
          "report": ".report.md", "proc": ".proc.md"}
# Page subsections that are behavior (kept in the main .page.md), in output order:
BEHAVIOR_ORDER = ["General information", "Control code", "Code", "Procedures"]
CONTROLS_SUB = "Information on controls"


def safe_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", name).strip()


def compress_ranges(nums):
    """[1,2,3,7,9,10] -> '1-3, 7, 9-10' for compact page-range display."""
    nums = sorted(set(nums))
    out, start, prev = [], nums[0], nums[0]
    for n in nums[1:]:
        if n == prev + 1:
            prev = n
            continue
        out.append(f"{start}-{prev}" if start != prev else f"{start}")
        start = prev = n
    out.append(f"{start}-{prev}" if start != prev else f"{start}")
    return ", ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf")
    ap.add_argument("--out", default="pre-convert")
    ap.add_argument("--dry-run", action="store_true", help="report grouping, write nothing")
    ap.add_argument("--table-subsection", action="append", metavar="HEADING", default=[],
                    help="Treat this breadcrumb subsection as the per-data-file item list. "
                         "Repeatable. Report it to wxKanban so it ships recognised.")
    ap.add_argument("--allow-no-tables", action="store_true",
                    help="Permit an Analysis that yields zero data files (rare but legitimate).")
    rd.add_redaction_args(ap)
    args = ap.parse_args()
    EXTRA_TABLE_SUBSECTIONS.extend(args.table_subsection or [])

    # [SCOPE 125 / T008] Scan mode reads artifacts that already exist and never opens a PDF, so it
    # returns before fitz is used. That is also why wxconv_redact imports nothing but `re` — a
    # developer auditing past exposure should not need PyMuPDF installed to do it.
    if args.scan_only:
        findings = rd.scan_tree(args.scan_only)
        print(rd.render_scan_report(findings, args.scan_only))
        return rd.exit_code(len(findings), args.fail_on_secrets)

    if not args.pdf:
        ap.error("--pdf is required unless --scan-only is used")

    state = rd.RedactionState()
    doc = fitz.open(args.pdf)
    project_name = (crumb_segments(doc[0].get_text()) or ["project"])[0]

    # Pass 1: per-page classification + cleaned body
    pages = []
    for i in range(doc.page_count):
        raw = clean_text(
            doc[i].get_text(), state, source="%s p%d" % (os.path.basename(args.pdf), i + 1)
        )
        segs = crumb_segments(raw)
        part, kind, name, sub = classify(segs)
        typ = segs[1] if len(segs) > 1 else ""
        body = strip_header(raw, project_name, i + 1)

        # Recover pages whose breadcrumb PCSoft elided.
        #
        # When the full breadcrumb is too wide, PCSoft replaces segments with "..." — so the Type
        # segment reads "..." and classify() cannot place the page. It was then dropped as
        # unclassifiable and listed in _discarded.md under a Type of "...", which reads as noise
        # next to that file's advice that discards are "mostly the cover and section dividers".
        # Since only long names get elided, the pages lost this way are the ones with the longest
        # names, not the least important ones: it cost a real conversion two data files whose
        # columns then existed nowhere in the output.
        #
        # The body still says "<name> data file items", so the element is recoverable from content
        # when the breadcrumb is not.
        placed = place_elided_page(typ, sub, segs, body, EXTRA_TABLE_SUBSECTIONS) \
            if kind in (None, "other") else None
        if placed:
            kind, name, sub = placed

        pages.append(dict(no=i + 1, part=part, kind=kind, name=name, sub=sub, typ=typ, body=body))

    # Pass 1b: recover pages the breadcrumb alone could not place.
    #
    # Two shapes, both of which discarded real content while the run exited 0:
    #
    #  (a) An ELIDED Type ("...") on a page of the Analysis. PCSoft elides when the breadcrumb is
    #      too wide, and Analysis breadcrumbs embed the full .ana/.wda filesystem path, so Analysis
    #      pages are exactly the ones that get elided. The content-based recovery above only reaches
    #      a table's FIRST page, because "<name> ... items" is printed only there - so continuation
    #      pages, composite keys, and the whole Item dictionary were still lost (one export's
    #      _schema.md came out 14KB instead of 100KB, and a table vanished entirely). Which Part
    #      carries the Analysis is LEARNED from the pages whose Type classified normally, because
    #      part numbering is not stable across exports and must not be hardcoded.
    #
    #  (b) A Part-DIVIDER breadcrumb, which names a Type but no Element (see recover_element_name).
    analysis_parts = {p["part"] for p in pages if p["kind"] in ("schema", "table")}
    for idx, p in enumerate(pages):
        if p["kind"] in (None, "other") and ELIDED_RE.match(p["typ"] or "") \
                and p["part"] in analysis_parts:
            recovered = recover_table_name(p["body"])
            if recovered:
                p.update(kind="table", name=recovered, sub="Data files and items")
            else:
                # A continuation page, the Item dictionary, General information or Links. It
                # belongs to the analysis even though no name is recoverable from it; "schema"
                # is the bucket that keeps it, and _schema.md is what reads it downstream.
                p.update(kind="schema", sub=p["sub"] or "Analysis")

        if p["kind"] in ("table", "page", "qry", "report", "proc") and not p["name"]:
            recovered = recover_element_name(p["body"])
            if not recovered:
                # A title-only lead-in page carries no name of its own; it belongs to the element
                # that starts on the next page, which does carry the full breadcrumb.
                nxt = pages[idx + 1] if idx + 1 < len(pages) else None
                if nxt and nxt["kind"] == p["kind"] and nxt["name"]:
                    recovered = nxt["name"]
            if recovered:
                p["name"] = recovered

    # Pass 2: group into elements
    elements = {}
    order = []

    def key_for(p):
        if p["kind"] in ("project", "schema"):
            return p["kind"]
        if p["kind"] in ("table", "page", "qry", "report", "proc") and p["name"]:
            return f'{p["kind"]}::{p["name"]}'
        return None

    for p in pages:
        k = key_for(p)
        if not k:
            continue
        if k not in elements:
            elements[k] = dict(kind=p["kind"], name=p["name"], pages=[])
            order.append(k)
        elements[k]["pages"].append(p)

    if not args.dry_run:
        os.makedirs(args.out, exist_ok=True)

    manifest = []

    def write(path, text):
        # [SCOPE 125 / T008] Delegates to the shared funnel (FR-007). Two things happen here that
        # used to be inline: the defence-in-depth re-scrub, which catches anything assembled from a
        # source other than a page body, and the watermark stamp, which write_text owns for every
        # script now rather than only this one. Redaction is idempotent, so text already cleaned in
        # clean_text() passes through unchanged.
        return rd.write_text(path, text, state, dry_run=args.dry_run, generator="wxConversion")

    for k in order:
        el = elements[k]
        kind, name = el["kind"], el["name"]
        pgs = el["pages"]
        pr = f'{pgs[0]["no"]}-{pgs[-1]["no"]}'

        if kind in ("project", "schema"):
            title = "Project overview" if kind == "project" else "Analysis / Schema"
            fname = "_project.md" if kind == "project" else "_schema.md"
            parts_md = [f"# {project_name} - {title}\n", f"_Source: PDF pages {pr}_\n"]
            for p in pgs:
                if p["body"].strip():
                    parts_md.append(f"\n## {p['sub']} (p{p['no']})\n\n{p['body']}\n")
            size = write(os.path.join(args.out, fname), "\n".join(parts_md))
            manifest.append((title, kind, pr, fname, size))
            continue

        disp = safe_name(name)
        main_file = disp + SUFFIX[kind]

        control_pgs = [p for p in pgs if p["sub"] == CONTROLS_SUB]
        body_pgs = [p for p in pgs if p["sub"] != CONTROLS_SUB]

        md = [f"# {name}\n", f"_Type: {kind}  |  Source: PDF pages {pr}_\n"]
        if control_pgs and kind in ("page", "report"):
            md.append(f"_UI control details: see [{disp}.controls.md]({disp}.controls.md)_\n")
        seen = set()
        for want in BEHAVIOR_ORDER:
            for p in body_pgs:
                if p["sub"] == want and p["no"] not in seen and p["body"].strip():
                    md.append(f"\n## {p['sub']}\n\n{p['body']}\n")
                    seen.add(p["no"])
        for p in body_pgs:
            if p["no"] not in seen and p["body"].strip():
                md.append(f"\n## {p['sub']}\n\n{p['body']}\n")
                seen.add(p["no"])
        size = write(os.path.join(args.out, main_file), "\n".join(md))
        manifest.append((name, kind, pr, main_file, size))

        if control_pgs:
            cpr = f'{control_pgs[0]["no"]}-{control_pgs[-1]["no"]}'
            cmd = [f"# {name} - Information on controls\n",
                   f"_Type: {kind} (UI controls)  |  Source: PDF pages {cpr}_\n",
                   f"_Behavior/code: see [{main_file}]({main_file})_\n"]
            for p in control_pgs:
                cmd.append(f"\n<!-- p{p['no']} -->\n{p['body']}\n")
            cfile = disp + ".controls.md"
            csize = write(os.path.join(args.out, cfile), "\n".join(cmd))
            manifest.append((name + " (controls)", "controls", cpr, cfile, csize))

    # ---- discarded / not-captured pages — surface for human review, never silently drop.
    # The original bug this guards against: real elements (queries, procedure sets) landing in
    # an unmapped breadcrumb Type and being dropped without a trace. Anything not grouped into a
    # written element is reported here so the developer can decide whether to keep it.
    captured = {p["no"] for el in elements.values() for p in el["pages"]}
    discarded = [p for p in pages if p["no"] not in captured]
    if discarded:
        by_type = {}
        for p in discarded:
            by_type.setdefault(p["typ"] or "(no breadcrumb / cover)", []).append(p["no"])
        dmd = [
            f"# {project_name} - pages NOT captured (review before discarding)\n",
            f"_{len(discarded)} of {doc.page_count} PDF pages were not grouped into any element._\n",
            "Most of these are the cover, the table of contents, and section dividers - safe to ignore.",
            "**But** if any breadcrumb **Type** below names a real element kind - a window/page, a query,",
            "a report, or a set of procedures - that element was **not** converted (its Type is unmapped in",
            "`classify()`'s `TYPE_KIND`/`PAGE_TYPE_RE`). Tell wxConversion to keep it so the logic is not",
            "lost, and report the unmapped Type so the splitter can be extended.\n",
            "| Breadcrumb Type | Pages | Page numbers |",
            "|---|---|---|",
        ]
        for typ in sorted(by_type, key=lambda t: (-len(by_type[t]), t)):
            dmd.append(f"| {typ} | {len(by_type[typ])} | {compress_ranges(by_type[typ])} |")
        write(os.path.join(args.out, "_discarded.md"), "\n".join(dmd) + "\n")

    # ---- manifest / index
    by_kind = {}
    for _, kind, _, _, size in manifest:
        d = by_kind.setdefault(kind, [0, 0])
        d[0] += 1
        d[1] += size
    idx = [f"# {project_name} - converted elements (index)\n",
           f"_Generated from {os.path.basename(args.pdf)} ({doc.page_count} pages)_\n",
           "\n## Summary\n",
           "| Kind | Files | Bytes |", "|---|---|---|"]
    for kind in sorted(by_kind):
        idx.append(f"| {kind} | {by_kind[kind][0]} | {by_kind[kind][1]:,} |")
    total = sum(s for *_, s in manifest)
    idx.append(f"| **total** | **{len(manifest)}** | **{total:,}** |")
    if discarded:
        idx.append(f"\n> ⚠️ **{len(discarded)} pages were not captured** — see "
                   "[`_discarded.md`](_discarded.md) and review before discarding; you may want to keep some.")
    idx.append("\n## Elements\n")
    idx.append("| Element | Kind | PDF pages | File | Bytes |")
    idx.append("|---|---|---|---|---|")
    for disp, kind, pr, fname, size in manifest:
        idx.append(f"| {disp} | {kind} | {pr} | {fname} | {size:,} |")
    write(os.path.join(args.out, "index.md"), "\n".join(idx))

    # ---- console report
    print(f"PDF: {args.pdf}  ({doc.page_count} pages)")
    print(f"Out: {args.out}{'  (DRY RUN)' if args.dry_run else ''}")
    for kind in sorted(by_kind):
        print(f"  {kind:10s}: {by_kind[kind][0]:3d} files, {by_kind[kind][1]:>10,} bytes")
    print(f"  {'TOTAL':10s}: {len(manifest):3d} files, {total:>10,} bytes "
          f"(~{total // 4:,} tokens est.)")
    if discarded:
        print(f"  {'NOT CAPTURED':12s}: {len(discarded):3d} pages -> {args.out}/_discarded.md "
              "(REVIEW — keep any real elements)")

    # [SCOPE 125 / T008] Credential report. Rendered from the accumulated state and written last, so
    # it covers every emission this run made, and written through write() so it is watermarked like
    # every other generated .md. The summary line prints unconditionally — including when nothing was
    # found — because a run that says nothing about credentials is the defect this scope fixes.
    sidecar_path = os.path.join(args.out, rd.SIDECAR_NAME)
    if state.findings:
        write(sidecar_path, rd.render_sidecar(state))
    print(rd.summary_line(state, sidecar_path))

    # ---- completeness gate: an Analysis that yielded no data files
    #
    # This is the failure that cost one customer 48 tables. Their export used a subsection heading
    # the matcher did not know, so every data-file page fell through to the "schema" bucket. The
    # pages WERE captured, so nothing appeared in _discarded.md, and the run printed a summary and
    # exited 0. A conversion that reports success having read no tables is worse than one that
    # crashes, because the next stage builds a schema on the gap.
    #
    # An Analysis with genuinely zero data files is possible but rare, so this is a hard stop with
    # an explicit opt-out rather than a warning nobody reads.
    # ---- reconcile against the export's OWN declared count
    #
    # The Analysis "General information" page states how many data files the analysis holds. That
    # number is the export's own truth, so comparing it against what was written catches every
    # cause of loss at once — an unrecognised heading, an elided breadcrumb, a page-grouping slip —
    # including causes not yet known. Three separate reporters converged on asking for exactly this.
    declared = declared_datafile_count(pages)
    written = by_kind.get("table", [0, 0])[0]
    if declared is not None and written != declared and not args.allow_no_tables:
        print("", file=sys.stderr)
        print(f"doc-split: the analysis declares {declared} data file(s) but {written} were "
              "extracted.", file=sys.stderr)
        missing = declared - written
        if missing > 0:
            print(f"  {missing} data file(s) produced no .table.md. Their columns will be absent "
                  "from the generated schema,", file=sys.stderr)
            print("  and nothing downstream can tell that apart from a smaller database.",
                  file=sys.stderr)
            print("  Check _discarded.md: a breadcrumb Type of '...' means PCSoft elided a long "
                  "name, and those pages", file=sys.stderr)
            print("  are real elements, not dividers.", file=sys.stderr)
        else:
            print("  More tables than declared - likely a page-grouping error splitting one file "
                  "in two.", file=sys.stderr)
        print("  Re-run with --allow-no-tables only if you have confirmed the difference is real.",
              file=sys.stderr)
        return 3

    tables_written = by_kind.get("table", [0, 0])[0]
    # The gate used to look only at pages ALREADY classified as analysis, which is precisely the
    # set that is empty when the failure is an unrecognised Type: one export named the analysis
    # "Database schema", nothing classified as analysis, and so the hard stop built for exactly
    # this case never saw it - 296 pages and all 112 tables were discarded on a green run
    # (wxKanban 11207b9f). Trigger on the Type WORD as well, so a Type wording nobody has met yet
    # still stops the run instead of silently emptying the data model.
    analysis_pages = [p for p in pages if p.get("kind") in ("table", "schema")
                      or _looks_like_analysis_type(p.get("typ"))]
    if analysis_pages and tables_written == 0 and not args.allow_no_tables:
        seen_subs = sorted({p.get("sub") for p in analysis_pages if p.get("sub")})
        unmapped_types = sorted({p.get("typ") for p in analysis_pages
                                 if p.get("kind") in (None, "other") and p.get("typ")})
        print("", file=sys.stderr)
        print(f"doc-split: the Analysis has {len(analysis_pages)} page(s) but produced ZERO data "
              "files.", file=sys.stderr)
        print("  Almost always this is a subsection heading the splitter does not recognise, not an "
              "analysis with no tables.", file=sys.stderr)
        if unmapped_types:
            print("  Breadcrumb Type(s) that look like an analysis but are NOT mapped:",
                  file=sys.stderr)
            for t in unmapped_types[:8]:
                print(f"      {t}", file=sys.stderr)
        print("  Subsection headings seen under Analysis:", file=sys.stderr)
        for sub in seen_subs[:12]:
            print(f"      {sub}", file=sys.stderr)
        if len(seen_subs) > 12:
            print(f"      ...and {len(seen_subs) - 12} more", file=sys.stderr)
        print("", file=sys.stderr)
        print("  If one of those names the per-data-file item list, re-run with:", file=sys.stderr)
        print('      --table-subsection "<that heading>"', file=sys.stderr)
        print("  then report it to wxKanban (project_submit_feedback) so it ships recognised.",
              file=sys.stderr)
        print("  If this analysis genuinely has no data files, re-run with --allow-no-tables.",
              file=sys.stderr)
        return 3

    return rd.exit_code(len(state.findings), args.fail_on_secrets)


if __name__ == "__main__":
    sys.exit(main())
