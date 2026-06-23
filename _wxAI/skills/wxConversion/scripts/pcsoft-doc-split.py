#!/usr/bin/env python3
"""
pcsoft-doc-split.py - Split a PCSoft (WinDev/WebDev) generated *technical documentation*
PDF into one Markdown file per project element, deterministically (no LLM tokens).

The PDF has no bookmarks, but every page carries a breadcrumb running header:
    Part N <bullet> Type <bullet> Element <bullet> Subsection
We use that breadcrumb to group consecutive pages by element and emit:
    <name>.table.md    (Part 2 - HFSQL data files)
    <name>.page.md     (Part 3 - WebDev pages: General info + Control code + Code + Procedures)
    <name>.controls.md (Part 3 - the verbose "Information on controls" dump, faithful sidecar)
    <name>.qry.md      (Part 4 - HFSQL queries)
    <name>.proc.md     (Part 5 - Sets of procedures / COL_TOOLS)
    _project.md        (Part 1 - project overview / element list / code stats)
    _schema.md         (Part 2 - analysis overview / item dictionary / links)
    index.md           (manifest of everything)

Usage:
    python scripts/pcsoft-doc-split.py --pdf conversion/docs/WW_Newsletter_Documentation.pdf --out pre-convert
"""
import argparse
import os
import re
import sys

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


def clean_text(s: str) -> str:
    for k, v in MOJIBAKE.items():
        s = s.replace(k, v)
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

WRAPPER_SEGS = {"Data files and items", "Analysis", "Project", "Page", "Query",
                "Set of procedures", "..."}


def classify(segs):
    """
    Map a page's breadcrumb to (part_num, group_kind, element_name, subsection).
    group_kind in {project, schema, table, page, qry, proc, toc, other}
    element_name is None for grouped buckets (project/schema).
    """
    if not segs or not segs[0].startswith("Part"):
        return (0, "other", None, None)
    m = re.match(r"Part\s+(\d+)", segs[0])
    part = int(m.group(1)) if m else 0
    sub = segs[-1] if len(segs) > 1 else ""

    if part == 1:
        return (1, "project", None, sub)
    if part == 2:
        if "Data files and items" in segs and segs[-1] == "Data files and items":
            cand = [s for s in segs[:-1]
                    if s not in WRAPPER_SEGS and not s.startswith("Part")
                    and ".wda" not in s and ".ana" not in s and "\\" not in s]
            name = cand[-1] if cand else None
            if name:
                return (2, "table", name, "Data files and items")
        return (2, "schema", None, sub)
    if part == 3:
        name = segs[2] if len(segs) > 2 else None
        return (3, "page", name, sub)
    if part == 4:
        name = segs[2] if len(segs) > 2 else None
        return (4, "qry", name, sub)
    if part == 5:
        name = segs[2] if len(segs) > 2 else None
        return (5, "proc", name, sub)
    if part == 6:
        return (6, "toc", None, sub)
    return (part, "other", None, sub)


SUFFIX = {"table": ".table.md", "page": ".page.md", "qry": ".qry.md", "proc": ".proc.md"}
# Page subsections that are behavior (kept in the main .page.md), in output order:
BEHAVIOR_ORDER = ["General information", "Control code", "Code", "Procedures"]
CONTROLS_SUB = "Information on controls"


def safe_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", name).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", default="pre-convert")
    ap.add_argument("--dry-run", action="store_true", help="report grouping, write nothing")
    args = ap.parse_args()

    doc = fitz.open(args.pdf)
    project_name = (crumb_segments(doc[0].get_text()) or ["project"])[0]

    # Pass 1: per-page classification + cleaned body
    pages = []
    for i in range(doc.page_count):
        raw = clean_text(doc[i].get_text())
        segs = crumb_segments(raw)
        part, kind, name, sub = classify(segs)
        body = strip_header(raw, project_name, i + 1)
        pages.append(dict(no=i + 1, part=part, kind=kind, name=name, sub=sub, body=body))

    # Pass 2: group into elements
    elements = {}
    order = []

    def key_for(p):
        if p["kind"] in ("project", "schema"):
            return p["kind"]
        if p["kind"] in ("table", "page", "qry", "proc") and p["name"]:
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
        size = len(text.encode("utf-8"))
        if not args.dry_run:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
        return size

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
        if control_pgs and kind == "page":
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


if __name__ == "__main__":
    main()
