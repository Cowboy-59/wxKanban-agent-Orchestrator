#!/usr/bin/env python3
"""
clarion-app-split.py - Split raw Clarion source into one Markdown file per element (no LLM tokens).

Handles BOTH common shapes of Clarion source:
  * Text exports:  --txd dictionary export, --txa application export ([SECTION] bracket grammar).
  * Generated ABC source: --clw "*.clw" (the real handover artifact when the .app/.dct are binary):
    inline `name FILE,DRIVER(...),PRE(xx) ... RECORD ... END END` dictionaries, top-level
    `Name PROCEDURE` elements owning `WINDOW(...)`/`REPORT(...)` structures, `|` line continuations,
    and ABC class-method procedures (`ThisWindow.Init PROCEDURE`) that belong to their owner.

Outputs under --out (default pre-convert/):
    <file>.table.md     one per dictionary FILE  (normalized field table + raw block)
    <proc>.page.md      one per PROCEDURE owning a WINDOW  (overview + embeds)
    <proc>.controls.md  faithful sidecar: the verbatim WINDOW ... END structure
    <proc>.report.md    one per PROCEDURE owning a REPORT
    <proc>.proc.md      procedures with no WINDOW/REPORT (business logic)
    <name>.view.md      one per VIEW structure found
    _schema.md          dictionary relations (text-export path; binary .dct has none in .clw)
    _project.md         app overview: element list, module list
    index.md            manifest
    _discarded.md       unclassified sections (review before discarding)

Each element file embeds the VERBATIM Clarion source inside a ```clarion fence; *.table.md ALSO
carries a normalized field table + `- prefix:` / `- primary-key:` metadata so clarion-dict-to-sql.py
is independent of which input shape produced it.

Usage:
    python scripts/clarion-app-split.py --clw "E:/path/PEOPLE/*.clw" --out pre-convert
    python scripts/clarion-app-split.py --txa App.txa --txd App.txd --clw "src/*.clw" --out pre-convert
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

# Clarion structure keywords that open a block closed by a matching END.
STRUCT_OPENERS = {
    "WINDOW", "REPORT", "SHEET", "TAB", "GROUP", "OPTION", "MENUBAR", "MENU",
    "TOOLBAR", "ITEMIZE", "QUEUE", "FORM", "BAND", "HEADER", "FOOTER", "DETAIL",
    "BREAK", "VIEW", "JOIN", "RECORD", "FILE", "CLASS", "MODULE", "ITEMGROUP",
}
# Clarion field data types (for inline `Name TYPE(args)` field declarations).
FIELD_TYPES = {
    "BYTE", "SHORT", "USHORT", "LONG", "ULONG", "SIGNED", "UNSIGNED", "SREAL", "REAL",
    "DECIMAL", "PDECIMAL", "BFLOAT4", "BFLOAT8", "STRING", "CSTRING", "PSTRING", "ASTRING",
    "MEMO", "BLOB", "DATE", "TIME", "BOOL",
}


def read_text(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", "replace")


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("_") or "unnamed"


def fence(body):
    return f"## Source\n\n```clarion\n{body.rstrip()}\n```\n"


def first_token(line):
    m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)", line)
    return m.group(1).upper() if m else ""


def strip_comment(line):
    """Drop a trailing Clarion `!comment` not inside quotes (cheap, quote-aware)."""
    inq = False
    for i, c in enumerate(line):
        if c == "'":
            inq = not inq
        elif c == "!" and not inq:
            return line[:i]
    return line


def extract_structure(lines, i, opener):
    """From line i (opening `opener`), return (block_text, end_index) by balancing openers vs END."""
    depth = 0
    out = []
    n = len(lines)
    while i < n:
        ln = lines[i]
        tok = first_token(ln)
        out.append(ln)
        if tok == "END" or re.match(r"\s*END\s*$", ln) or re.match(r"\s*\.\s*$", ln):
            depth -= 1
            if depth <= 0:
                return "\n".join(out), i + 1
        elif tok in STRUCT_OPENERS or re.search(r"\b(WINDOW|REPORT|VIEW|SHEET|TAB|GROUP|OPTION)\s*\(", ln, re.I):
            # only count a real structure opener on this line, once
            depth += 1
        i += 1
    return "\n".join(out), n


# ----------------------------------------------------------------- unified field/dictionary model
def parse_field_type(expr):
    """`STRING(30)` -> (STRING,30,None); `DECIMAL(9,2)` -> (DECIMAL,9,2); `LONG` -> (LONG,None,None)."""
    m = re.match(r"([A-Za-z]+)\s*(?:\(\s*(\d+)?\s*(?:,\s*(\d+))?\s*\))?", expr)
    if not m:
        return None, None, None
    t = m.group(1).upper()
    if t not in FIELD_TYPES:
        return None, None, None
    return t, (int(m.group(2)) if m.group(2) else None), (int(m.group(3)) if m.group(3) else None)


def parse_clw_dictionary(text):
    """Parse inline `name FILE,...,PRE(xx) ... RECORD ... END END` declarations from generated .clw.
    Returns list of dict(name, prefix, pk[], fields[])."""
    lines = text.split("\n")
    files = []
    i, n = 0, len(lines)
    while i < n:
        ln = strip_comment(lines[i])
        m = re.match(r"^(\S+)\s+FILE\b(.*)$", ln, re.I)
        if not m:
            i += 1
            continue
        name = m.group(1)
        pm = re.search(r"\bPRE\s*\(\s*([A-Za-z0-9]+)\s*\)", m.group(2), re.I)
        prefix = pm.group(1) if pm else None
        block, end = extract_structure(lines, i, "FILE")
        files.append(dict(name=name, prefix=prefix, raw=block,
                          **parse_file_body(block.split("\n"), prefix)))
        i = end
    return files


def parse_file_body(blines, prefix):
    """From the lines of a FILE...END block, return dict(pk[], fields[])."""
    fields, keys = [], []
    in_record = False
    for ln in blines:
        s = strip_comment(ln).strip()
        if not s:
            continue
        up = s.upper()
        km = re.match(r"^(\S+)\s+KEY\s*\(([^)]*)\)(.*)$", s, re.I)
        if km:
            comps = [strip_prefix(c.strip(), prefix) for c in km.group(2).split(",") if c.strip()]
            keys.append(dict(comps=comps, primary="PRIMARY" in km.group(3).upper()))
            continue
        if up.startswith("RECORD"):
            in_record = True
            continue
        if up == "END" or up == ".":
            in_record = False
            continue
        if in_record:
            fm = re.match(r"^(\S+)\s+(.+)$", s)
            if fm:
                t, length, dec = parse_field_type(fm.group(2))
                if t:
                    fields.append(dict(name=fm.group(1), ctype=t, length=length,
                                       decimals=dec, picture=None))
    pk = []
    for k in keys:
        if k["primary"]:
            pk = k["comps"]
            break
    if not pk and keys:
        pk = keys[0]["comps"]  # generated source rarely marks PRIMARY; first key is the usual PK
    return dict(pk=pk, fields=fields)


RELLINK_RE = re.compile(
    r"AddRelationLink\s*\(\s*([A-Za-z0-9]+)\s*:\s*([A-Za-z0-9_]+)\s*,\s*"
    r"([A-Za-z0-9]+)\s*:\s*([A-Za-z0-9_]+)\s*\)", re.I)


def parse_clw_relations(texts, files):
    """Recover the dictionary FK graph from generated ABC business-class modules (`*_BC*.clw`).
    ABC wires relations as `SELF.AddRelationLink(PAR:field, CHILD:field)` inside each
    RelationManager's `DeferedAddRelations` routine — the parent (the SELF / "one" side) is the
    first argument, the child (the related / "many" side) the second. The Clarion field PREFIX
    (`AUT:`, `JOB:`) maps back to its FILE via `PRE()`; a composite FK appears as several links
    between the same file pair. Returns (relations, unresolved_prefixes) where each relation is the
    unified model dict(parent, child, parent_field, child_field, raw) — field lists comma-joined.
    The binary `.dct` is NOT needed: the generated `_BC` source carries the whole graph."""
    pref2file = {f["prefix"].upper(): f["name"] for f in files if f.get("prefix")}
    grouped, order, unresolved = {}, [], set()
    for text in texts:
        for m in RELLINK_RE.finditer(text):
            ppre, pfld, cpre, cfld = m.group(1), m.group(2), m.group(3), m.group(4)
            par, chi = pref2file.get(ppre.upper()), pref2file.get(cpre.upper())
            if not par or not chi:
                unresolved.add(ppre.upper() if not par else cpre.upper())
                continue
            key = (par, chi)
            if key not in grouped:
                grouped[key] = []
                order.append(key)
            if (pfld, cfld) not in grouped[key]:
                grouped[key].append((pfld, cfld))
    rels = []
    for par, chi in order:
        pairs = grouped[(par, chi)]
        pf, cf = ",".join(p for p, _ in pairs), ",".join(c for _, c in pairs)
        rels.append(dict(parent=par, child=chi, parent_field=pf, child_field=cf,
                         raw=f"{par}({pf}) 1--* {chi}({cf})"))
    return rels, sorted(unresolved)


def parse_txd(text):
    """Bracket-format dictionary (.txd). Returns (files, relations) in the unified model."""
    lines = text.split("\n")
    files, relations = [], []
    cur, cur_field, cur_key, pending_rel = None, None, None, None
    for ln in lines:
        s = ln.strip()
        up = s.upper()
        if up.startswith("[FILE]"):
            cur = dict(name=None, prefix=None, raw=[ln], fields=[], keys=[])
            files.append(cur)
            cur_field = cur_key = None
            continue
        if up.startswith("[RELATION]"):
            cur = None
            pending_rel = dict(parent=None, child=None, parent_field=None, child_field=None, raw=[ln])
            relations.append(pending_rel)
            continue
        if up.startswith("[FIELD]") or up.startswith("[COLUMN]"):
            cur_field = dict(name=None, ctype=None, length=None, decimals=None, picture=None)
            if cur is not None:
                cur["fields"].append(cur_field)
                cur["raw"].append(ln)
            continue
        if up.startswith("[KEY]"):
            cur_key = dict(comps=[], primary=False)
            if cur is not None:
                cur["keys"].append(cur_key)
                cur["raw"].append(ln)
            continue
        if up.startswith("[") and not up.startswith("[ATTRIBUTES]"):
            if up.startswith("[DICTIONARY]") or up.startswith("[POOL]") or up.startswith("[OPTION]"):
                cur = pending_rel = None
            continue
        if cur is not None:
            cur["raw"].append(ln)
        elif pending_rel is not None:
            pending_rel["raw"].append(ln)
        m = re.match(r"([A-Za-z]+)\b[\s(']*([^)'\n]*)", s)
        if not m:
            continue
        key, val = m.group(1).upper(), m.group(2).strip().strip("'\")")
        if key == "PREFIX" and cur is not None:
            cur["prefix"] = val
        elif key == "NAME":
            if cur_field is not None and cur_field.get("name") is None:
                cur_field["name"] = val
            elif cur is not None and cur["name"] is None:
                cur["name"] = val
        elif key == "TYPE" and cur_field is not None:
            t, length, dec = parse_field_type(val)
            cur_field["ctype"] = t or val.upper()
            cur_field["length"], cur_field["decimals"] = length, dec
        elif key in ("PICTURE", "PICT") and cur_field is not None:
            cur_field["picture"] = val
            if cur_field.get("length") is None:
                pl = re.search(r"@[sS](\d+)", val)
                if pl:
                    cur_field["length"] = int(pl.group(1))
        elif key in ("ATTRIBUTE", "ATTRIBUTES") and cur_key is not None and "PRIMARY" in up:
            cur_key["primary"] = True
        elif key in ("COMPONENT", "FIELD") and cur_key is not None:
            cur_key["comps"].append(strip_prefix(val, cur["prefix"] if cur else None))
        elif key == "FILE" and pending_rel is not None:
            if pending_rel["parent"] is None:
                pending_rel["parent"] = val
            else:
                pending_rel["child"] = val
    # finalize PK + raw join
    for idx, f in enumerate(files):
        if not f["name"]:
            f["name"] = f"file{idx + 1}"
        pk = []
        for k in f.get("keys", []):
            if k["primary"]:
                pk = k["comps"]
                break
        f["pk"] = pk
        f["raw"] = "\n".join(f["raw"])
    return files, relations


def strip_prefix(name, prefix):
    if prefix and name.upper().startswith(prefix.upper() + ":"):
        return name.split(":", 1)[1]
    return name.split(":", 1)[1] if ":" in name else name


# --------------------------------------------------------------------- application: procedures
def split_txa_procedures(text):
    lines = text.split("\n")
    blocks, cur_name, cur, started = [], None, [], False
    for ln in lines:
        if ln.strip().upper().startswith("[PROCEDURE]"):
            if cur:
                blocks.append((cur_name or "_GLOBAL", cur))
            cur_name, cur, started = None, [ln], True
            continue
        cur.append(ln)
        if cur_name is None and started:
            m = re.match(r"\s*NAME\b[\s(']*([^)'\n]+)", ln)
            if m:
                cur_name = m.group(1).strip().strip("'\")")
    if cur:
        blocks.append((cur_name or "_GLOBAL", cur))
    return blocks


OPENER_LINE_RE = re.compile(
    r"^\s*(?:\S+\s+)?(WINDOW|REPORT|VIEW|SHEET|TAB|GROUP|OPTION|MENUBAR|MENU|TOOLBAR|ITEMIZE|"
    r"QUEUE|CLASS|RECORD|FILE|MODULE|MAP|JOIN)\b", re.I)
PROC_BOUNDARY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)[ \t]+PROCEDURE\b")


def depth_delta(ln):
    s = strip_comment(ln)
    if re.match(r"\s*(END|\.)\s*$", s):
        return -1
    if OPENER_LINE_RE.match(s):
        return 1
    return 0


def split_clw_procedures(text):
    """Yield (name, body_lines) for each top-level `Name PROCEDURE` definition. A boundary counts
    ONLY at structure depth 0, so ABC method PROTOTYPES inside `CLASS ... END` / `MAP ... END`
    (e.g. `Ask PROCEDURE(),DERIVED`) and dotted method implementations (`ThisWindow.Ask PROCEDURE`)
    stay inside their owner's body instead of being split out as separate elements."""
    lines = text.split("\n")
    starts, depth = [], 0
    for idx, ln in enumerate(lines):
        m = PROC_BOUNDARY_RE.match(ln)
        if m and depth == 0 and "." not in m.group(1):
            starts.append((idx, m.group(1)))
        depth = max(0, depth + depth_delta(ln))
    out = []
    for k, (s, name) in enumerate(starts):
        e = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        out.append((name, lines[s:e]))
    return out


def find_structures(block_lines, kind):
    out, i, n = [], 0, len(block_lines)
    while i < n:
        ln = block_lines[i]
        if first_token(ln) == kind or re.search(rf"\b{kind}\s*\(", ln, re.I) and not ln.strip().startswith("!"):
            # only treat as a structure if it looks like `label KIND(` or `KIND(`
            if re.match(rf"^\s*{kind}\b", ln, re.I) or re.match(rf"^\S+\s+{kind}\s*\(", ln, re.I):
                txt, j = extract_structure(block_lines, i, kind)
                out.append(txt)
                i = j
                continue
        i += 1
    return out


# ----------------------------------------------------------------------------- writers
def write_if_new(path, content, written, dry):
    written.append(os.path.basename(path))
    if dry or os.path.exists(path):
        return
    if str(path).endswith('.md'):
        content = stamp_markdown(content, kind='converted', generator='cwConversion')
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


def table_md(f):
    rows = ["| Field | Clarion type | Length | Decimals | Picture |", "|---|---|---|---|---|"]
    for fld in f["fields"]:
        rows.append(f"| {fld.get('name') or ''} | {fld.get('ctype') or ''} "
                    f"| {fld.get('length') if fld.get('length') is not None else ''} "
                    f"| {fld.get('decimals') if fld.get('decimals') is not None else ''} "
                    f"| {fld.get('picture') or ''} |")
    return (f"# Table: {f['name']}\n\n"
            f"- prefix: {f['prefix'] or ''}\n"
            f"- primary-key: {', '.join(f.get('pk') or []) or ''}\n\n"
            f"## Fields\n\n" + "\n".join(rows) + "\n\n"
            + fence(f["raw"] if isinstance(f["raw"], str) else "\n".join(f["raw"])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--txa")
    ap.add_argument("--txd")
    ap.add_argument("--clw", help="glob for .clw modules (generated or hand-coded)")
    ap.add_argument("--out", default="pre-convert")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.dry_run:
        os.makedirs(args.out, exist_ok=True)
    written, discarded, manifest = [], [], []
    clw_files = sorted(glob.glob(args.clw)) if args.clw else []

    # ---- dictionary: prefer .txd; else inline FILE decls in the .clw set ----
    files, relations, rel_unresolved = [], [], []
    if args.txd and os.path.exists(args.txd):
        files, relations = parse_txd(read_text(args.txd))
    else:
        clw_texts = [read_text(path) for path in clw_files]
        for text in clw_texts:
            files.extend(parse_clw_dictionary(text))
        # Recover the FK graph from generated ABC `*_BC*.clw` AddRelationLink calls.
        relations, rel_unresolved = parse_clw_relations(clw_texts, files)
    seen_tbl = set()
    for f in files:
        if f["name"] in seen_tbl:
            continue
        seen_tbl.add(f["name"])
        fname = safe_name(f["name"])
        write_if_new(os.path.join(args.out, f"{fname}.table.md"), table_md(f), written, args.dry_run)
        manifest.append(f"- `{fname}.table.md` — FILE {f['name']} ({len(f['fields'])} fields, "
                        f"pk={', '.join(f.get('pk') or []) or 'none'})")
    if relations:
        rel_rows = ["| Parent | Parent key | Child | Child key |", "|---|---|---|---|"]
        rel_raw = []
        for r in relations:
            rel_rows.append(f"| {r['parent'] or '?'} | {r.get('parent_field') or ''} "
                            f"| {r['child'] or '?'} | {r.get('child_field') or ''} |")
            raw = r.get("raw")
            rel_raw.append(raw if isinstance(raw, str) else "\n".join(raw or []))
        note = ("\n\n_Field-level links recovered from generated ABC `*_BC*.clw` `AddRelationLink` "
                "calls (parent → child key pairs). Verify against the dictionary._"
                if any(r.get("parent_field") for r in relations) else "")
        schema_md = ("# Dictionary relations\n\n" + "\n".join(rel_rows) + note
                     + "\n\n" + fence("\n".join(rel_raw)))
        write_if_new(os.path.join(args.out, "_schema.md"), schema_md, written, args.dry_run)
        manifest.append(f"- `_schema.md` — {len(relations)} relations"
                        + (" (field-level FKs)" if any(r.get("parent_field") for r in relations) else ""))
    if rel_unresolved:
        discarded.append("[RELATION] AddRelationLink prefixes with no matching FILE PRE() — FK "
                         f"skipped: {', '.join(rel_unresolved)}")

    proc_names = []

    def emit_procedure(name, block, origin):
        raw = "\n".join(block)
        windows = find_structures(block, "WINDOW")
        reports = find_structures(block, "REPORT")
        views = find_structures(block, "VIEW")
        pname = safe_name(name)
        proc_names.append(f"{name} {origin}")
        if windows:
            write_if_new(os.path.join(args.out, f"{pname}.controls.md"),
                         f"# Window controls: {name}\n\n{fence(windows[0])}", written, args.dry_run)
            page_md = (f"# Page (window): {name}\n\nControls in `{pname}.controls.md`. "
                       f"Procedure source / embeds below.\n\n" + fence(raw))
            write_if_new(os.path.join(args.out, f"{pname}.page.md"), page_md, written, args.dry_run)
            manifest.append(f"- `{pname}.page.md` (+controls) — {name} [WINDOW] {origin}")
        elif reports:
            rep_md = (f"# Report: {name}\n\n{fence(reports[0])}\n## Procedure source (print-time embeds)"
                      f"\n\n{fence(raw)}")
            write_if_new(os.path.join(args.out, f"{pname}.report.md"), rep_md, written, args.dry_run)
            manifest.append(f"- `{pname}.report.md` — {name} [REPORT] {origin}")
        elif name == "_GLOBAL":
            write_if_new(os.path.join(args.out, "_global.proc.md"),
                         f"# Global / module data and embeds\n\n{fence(raw)}", written, args.dry_run)
            manifest.append("- `_global.proc.md` — global data/embeds")
        else:
            write_if_new(os.path.join(args.out, f"{pname}.proc.md"),
                         f"# Procedure (logic): {name}\n\n{fence(raw)}", written, args.dry_run)
            manifest.append(f"- `{pname}.proc.md` — {name} [logic] {origin}")
        for vi, v in enumerate(views):
            vname = safe_name(f"{name}_view{vi + 1}" if len(views) > 1 else name)
            write_if_new(os.path.join(args.out, f"{vname}.view.md"),
                         f"# View (query): {name}\n\n{fence(v)}", written, args.dry_run)
            manifest.append(f"- `{vname}.view.md` — VIEW in {name} {origin}")

    # ---- application: prefer the .txa export; fall back to .clw only when no .txa is present ----
    if args.txa and os.path.exists(args.txa):
        for name, block in split_txa_procedures(read_text(args.txa)):
            emit_procedure(name, block, "(txa)")
    else:
        for path in clw_files:
            base = os.path.basename(path)
            for name, block in split_clw_procedures(read_text(path)):
                emit_procedure(name, block, f"({base})")

    # ---- _project.md ----
    proj = ["# Project overview (Clarion source)", ""]
    if args.txa:
        proj.append(f"- Application export: `{args.txa}`")
    if args.txd:
        proj.append(f"- Dictionary export: `{args.txd}`")
    if clw_files:
        proj.append(f"- .clw modules: {len(clw_files)}")
        proj += [f"  - `{p}`" for p in clw_files]
    proj += ["", f"- Dictionary FILEs: {len(seen_tbl)}", f"- Procedures: {len(proc_names)}"]
    proj += [f"  - {n}" for n in proc_names]
    write_if_new(os.path.join(args.out, "_project.md"), "\n".join(proj) + "\n", written, args.dry_run)

    idx = ["# Conversion manifest (pre-convert)", "",
           "_Generated by clarion-app-split.py. Downstream scripts re-parse each element file._", ""]
    idx += sorted(set(manifest))
    write_if_new(os.path.join(args.out, "index.md"), "\n".join(idx) + "\n", written, args.dry_run)

    print(f"wrote {len(set(written)) - 1} element files to {args.out}/")
    for line in sorted(set(manifest)):
        print("  " + line)
    if discarded:
        print("\nNOT CAPTURED (see _discarded.md):")
        for d in discarded:
            print("  " + d)


if __name__ == "__main__":
    main()
