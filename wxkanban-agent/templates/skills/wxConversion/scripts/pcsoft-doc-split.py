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

WRAPPER_SEGS = {"Data files and items", "Files and items", "Analysis", "Project", "Page",
                "Query", "Set of procedures", "..."}

# Breadcrumb subsection labels that mark a per-data-file structure dump. WinDev desktop docs
# use "Files and items"; some WebDev variants use "Data files and items".
TABLE_SUBSECTIONS = ("Data files and items", "Files and items")

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
    r"^(?P<name>\S+)\s+(?:data\s+file\s+items"          # en
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
    re.compile(r"^(number of data|nb (data )?files|nombre de fichiers)", re.I),
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
            cand = [s for s in segs[:-1]
                    if s not in WRAPPER_SEGS and not s.startswith("Part")
                    and ".wda" not in s and ".ana" not in s and "\\" not in s]
            name = cand[-1] if cand else None
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
        if kind in (None, "other") and ELIDED_RE.match(typ or ""):
            recovered = recover_table_name(body)
            if recovered:
                kind, name, sub = "table", recovered, "Data files and items"

        pages.append(dict(no=i + 1, part=part, kind=kind, name=name, sub=sub, typ=typ, body=body))

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
    analysis_pages = [p for p in pages if p.get("kind") in ("table", "schema")]
    if analysis_pages and tables_written == 0 and not args.allow_no_tables:
        seen_subs = sorted({p.get("sub") for p in analysis_pages if p.get("sub")})
        print("", file=sys.stderr)
        print(f"doc-split: the Analysis has {len(analysis_pages)} page(s) but produced ZERO data "
              "files.", file=sys.stderr)
        print("  Almost always this is a subsection heading the splitter does not recognise, not an "
              "analysis with no tables.", file=sys.stderr)
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
