#!/usr/bin/env python3
"""
pcsoft-queries-to-scope.py - Document the PCSoft HFSQL queries (QRY_*) as ONE scope.

Input : pre-convert/*.qry.md
Output: rebuild/scopes/QRY-queries-scope.md  - one scope, a section per query:
          inferred purpose, result columns, parameters, selection conditions,
          a RECONSTRUCTED SQL SELECT, and the literal SQL fragment present in the doc.

NOTE: the source PDF clips each query's SQL text box, so only the first line(s) of the
verbatim SQL survive. The result items + selection conditions ARE complete, so we
reconstruct a faithful equivalent SELECT and flag it as reconstructed.

Usage:
    python scripts/pcsoft-queries-to-scope.py --out rebuild/scopes
"""
import argparse
import sys
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
import wxconv_redact as rd  # noqa: E402 - the watermark stamp now lives inside rd.write_text()

COND_RE = re.compile(r"\b(is equal to|is different from|is greater|is less|is in the list|"
                     r"Contains|starts with|is between|is not)\b", re.I)


def parse_links(schema_path):
    """FK edges from the analysis: list of (src_tbl, src_item, dst_tbl, dst_item)."""
    if not os.path.exists(schema_path):
        return []
    txt = [l.strip() for l in open(schema_path, encoding="utf-8").read().split("\n")]
    links, i = [], 0
    while i < len(txt):
        if txt[i] == "Data file" and i + 2 < len(txt):
            src_tbl, dst_tbl = txt[i + 1], txt[i + 2]
            j = i + 3
            while j < len(txt) and txt[j] != "Item":
                j += 1
            if j + 2 < len(txt):
                src_item = re.sub(r"\s*\(.*\)$", "", txt[j + 1])
                dst_item = re.sub(r"\s*\(.*\)$", "", txt[j + 2])
                if re.match(r"^\w+$", src_tbl) and re.match(r"^\w+$", dst_tbl):
                    links.append((src_tbl, src_item, dst_tbl, dst_item))
            i = j + 1
        else:
            i += 1
    return links


def build_edges(links):
    """edges[(a,b)] = (col_a, col_b) join condition, both directions."""
    e = {}
    for s_t, s_i, d_t, d_i in links:
        e.setdefault((d_t, s_t), (d_i, s_i))
        e.setdefault((s_t, d_t), (s_i, d_i))
    return e


def block_after(lines, header, stops):
    """Return the lines between `header` and the next stop header."""
    return [l for blk in blocks_after(lines, header, stops) for l in blk]


def blocks_after(lines, header, stops):
    """
    Every block introduced by `header`, not just the first.

    A query whose documentation spans several PDF pages reprints its section heading on each one,
    so "Result items" occurs more than once in a single .qry.md. Reading only the first occurrence
    means the continuation columns live in a block nothing looks at - they were previously picked
    up by accident, because the single block ran on past the SQL box and swallowed the reprinted
    heading with it. Once the SQL box became a stop (it has to be - it was contaminating the list),
    that accident stopped paying, and QRY_InvoiceChargesQCOFClientDate lost seven real columns.

    A stop is a section heading only when it is NOT immediately followed by a result origin. A
    result item may be NAMED like a heading - a Photo table's `Image` column prints as the line
    "Image" directly above "Photo.Image" - and taking it for the Image section closed the block on
    the query's first item, so all five of its columns were lost (wxKanban 270ff1c4). A real
    heading is never followed by a "Table.Column" line; an item's name always is.
    """
    out, cur, collecting = [], [], False
    for idx, l in enumerate(lines):
        if l == header:
            if collecting and cur:
                out.append(cur)
            cur, collecting = [], True
            continue
        if not collecting:
            continue
        if l in stops and not _is_origin(lines[idx + 1] if idx + 1 < len(lines) else ""):
            out.append(cur)
            cur, collecting = [], False
            continue
        cur.append(l)
    if collecting and cur:
        out.append(cur)
    return out


# A line belonging to the verbatim SQL box rather than to the Result-items table. Both a trailing
# comma and an " AS " alias are SQL punctuation the documentation table never prints.
_SQL_LINE_RE = re.compile(r"\s+AS\s+|,$|^(SELECT|FROM|WHERE|ORDER\s+BY|GROUP\s+BY|JOIN)\b", re.I)
_SQL_START_RE = re.compile(r"^(SELECT)\b|^SQL code of", re.I)


def _looks_like_sql(line):
    return bool(_SQL_LINE_RE.search(line or ""))


def _sql_box_start(block):
    """Index at which the verbatim SQL box begins, or len(block) if it does not appear."""
    for i, line in enumerate(block):
        if _SQL_START_RE.match(line):
            return i
    return len(block)


# A result origin: "Table.Column", or "Table.*" for a whole table. A result origin may name a whole
# table: anchoring on \w+\.\w+ dropped every wildcard item, so a query selecting five whole tables
# documented zero result columns (wxKanban a075d21f).
_ORIGIN_RE = re.compile(r"^\w+\.(?:\w+|\*)")
_IDENT_RE = re.compile(r"^\w+$")


def _is_origin(line):
    return bool(_ORIGIN_RE.match(line or "")) and not _looks_like_sql(line)


# The Type column of the Result-items table. A record ENDS at its type, which is what lets an item
# with no "Table.Column" origin - a calculated or aggregate item - be read at all. Labels as PCSoft
# prints them; the parenthesised tail may be cut by the column ("Automatic identifier (8 ").
_ITEM_TYPE_RE = re.compile(
    r"^(?:(?:unsigned\s+)?\d+-byte\s+(?:integer|real)|automatic\s+identifier"
    r"|(?:unicode\s+)?string|(?:unicode\s+)?text\s+memo|binary\s+memo|binary\s+string"
    r"|other\s+binary\s+memo|image\s+\(binary\s+memo\)|memo|boolean|date\s+and\s+time|datetime"
    r"|date|time|duration|currency|monetary|numeric|decimal|real|double|password)"
    r"(?:\s*\([^)]*\)?)?$", re.I)
# What may follow a type inside the same record: a format annotation ("(yyyymmddhhmmssccc)"), the
# wrapped tail of "Automatic identifier (8 bytes)", or the Sort column's order number.
_TYPE_TAIL_RE = re.compile(r"^\([^)]*\)?$|^\d*\s*bytes?\)$|^\d+$", re.I)
# The table's own column headers and footnote legend, and the page furniture a continuation page
# reprints. None of these is ever part of a record.
_ITEM_NOISE = {"Origin", "Type", "Sort", "¹", "Simple* ¹", "Calculated* ¹", "Aggregate* ¹",
               "General information", "Information on the result"}
_ITEM_NOISE_RE = re.compile(r"^(?:Simple|Calculated|Aggregate)\* :|^## ")
# An aggregate item prints its function in the Origin column: "sum of OrdLine.Quantity",
# "number of Review.Mark not 'Null'". Mapped to the SQL the query editor generates for it.
_AGGREGATE_RE = re.compile(r"^(sum|average|maximum|minimum|number|count)\s+of\b", re.I)
_AGGREGATE_SQL = {"sum": "SUM", "average": "AVG", "maximum": "MAX", "minimum": "MIN",
                  "number": "COUNT", "count": "COUNT"}
# The alias column wraps a long name onto a second line ("the_maximum_PhotoNumbe" / "r"). Only a
# fragment this long can have wrapped; a short name followed by an identifier-shaped line is a name
# followed by its expression ("MinPrice" / "CASE").
_ALIAS_WRAP_MIN = 20


def _aggregate_text(lines):
    """
    "sum of T.C" / "number of T.C not 'Null'", rejoined from its column-wrapped lines.

    The Origin column cuts a long item name mid-word ("...CharacteristicV" / "alueID not 'Null'"),
    so a plain join leaves a space inside the name. The phrase has a fixed grammar and an item
    reference never contains a space, so the reference is reassembled with its spaces removed.
    """
    text = " ".join(lines)
    m = re.match(r"^(\w+)\s+of\s+(.+?)((?:\s+not\s+'Null')?)\s*$", text, re.I)
    if m:
        ref = re.sub(r"\s+", "", m.group(2))
        if re.fullmatch(r"\w+\.(?:\w+|\*)", ref):
            return f"{m.group(1)} of {ref}{m.group(3)}"
    return text


def _split_records(blk, qname):
    """
    Cut a Result-items block into (lines, type) records, each ending at its Type cell.

    A line that reads as a type but is followed by an origin is an item NAMED like a type ("Date"
    above "Orders.Date"), so it starts a record rather than ending one. A trailing record with no
    type (the table was cut by a page or the SQL box) is returned with type None.
    """
    recs, pending, i = [], [], 0
    while i < len(blk):
        line = blk[i]
        nxt = blk[i + 1] if i + 1 < len(blk) else ""
        if line in _ITEM_NOISE or _ITEM_NOISE_RE.match(line) or line == qname:
            i += 1
            continue
        # The page header reprints the query name, wrapped like any long cell ("QRY_..Dat" / "e").
        if qname and len(line) >= 8 and qname.startswith(line) and line + nxt == qname:
            i += 2
            continue
        if _ITEM_TYPE_RE.match(line) and not _is_origin(nxt):
            recs.append((pending, line))
            pending = []
            i += 1
            while i < len(blk) and _TYPE_TAIL_RE.match(blk[i]):
                i += 1
            continue
        pending.append(line)
        i += 1
    if pending:
        recs.append((pending, None))
    return recs


def _pair_origins(lines):
    """The original rule, for a record that is neither cleanly simple nor cleanly calculated: every
    origin line is an item, named by the line above it."""
    out = []
    for j, line in enumerate(lines):
        if _is_origin(line):
            # An origin directly above is the previous item, never this item's name.
            alias = lines[j - 1] if j > 0 and not _is_origin(lines[j - 1]) else line.split(".")[-1]
            if not _looks_like_sql(alias):
                out.append(dict(alias=alias, origin=line, expr=None, kind="simple"))
    return out


def _classify_record(lines, has_type):
    """
    Turn one record's lines into result columns.

    simple     : name fragment(s), then "Table.Column" (possibly wrapped onto identifier fragments)
    aggregate  : name fragment(s), then "sum of T.C" / "number of T.C not 'Null'" (may wrap)
    calculated : a name, then its expression - or, where the export does not print the expression,
                 the name alone. Calculated items used to be dropped without a word, so a query read
                 as documented in full while columns were missing from it (wxKanban 899bdd0b).
    """
    if not lines:
        return []
    k = next((j for j, l in enumerate(lines) if _is_origin(l)), None)
    if k is not None and all(_IDENT_RE.match(l) for l in lines[:k]) \
            and all(_IDENT_RE.match(l) for l in lines[k + 1:]):
        alias = "".join(lines[:k]) or lines[k].split(".")[-1]
        return [dict(alias=alias, origin=lines[k] + "".join(lines[k + 1:]), expr=None,
                     kind="simple")]
    if not has_type:
        return _pair_origins(lines)
    a = next((j for j, l in enumerate(lines) if _AGGREGATE_RE.match(l)), None)
    if a is not None and a >= 1 and all(_IDENT_RE.match(l) for l in lines[:a]):
        return [dict(alias="".join(lines[:a]), origin=None, expr=_aggregate_text(lines[a:]),
                     kind="aggregate")]
    if not _IDENT_RE.match(lines[0]):
        return _pair_origins(lines)
    # A calculated item. Two consecutive (name, origin) lines further down mean this is not one
    # expression but two records run together by a type this parser does not know - fall back to
    # the original pairing rather than inventing an expression out of real columns.
    if any(_IDENT_RE.match(lines[j - 1]) and _is_origin(lines[j]) for j in range(2, len(lines))):
        return _pair_origins(lines)
    n = 1
    while n < len(lines) - 1 and len(lines[n - 1]) >= _ALIAS_WRAP_MIN and _IDENT_RE.match(lines[n]):
        n += 1
    return [dict(alias="".join(lines[:n]), origin=None, expr=" ".join(lines[n:]),
                 kind="calculated")]


def parse_result_columns(blk, qname=""):
    """Every result column of a Result-items block, in source order."""
    cols = []
    for lines, rtype in _split_records(blk, qname):
        cols.extend(_classify_record(lines, rtype is not None))
    return cols


def parse_query(path):
    name = os.path.basename(path).split(".")[0]
    lines = [l.strip() for l in open(path, encoding="utf-8").read().split("\n") if l.strip()]
    q = dict(name=name, qtype="", items=[], cols=[], params=[], conds=[], sql_fragment="")

    # query type
    for i, l in enumerate(lines):
        if l == "Query type" and i + 1 < len(lines):
            q["qtype"] = lines[i + 1]
            break

    # result items: records of (alias, origin Table.Col, type) — anchor on origin containing '.'
    ITEM_STOPS = {"Query parameters", "Advanced settings", "Image", "Additional information"}
    blks = [b[:_sql_box_start(b)] for b in blocks_after(lines, "Result items", ITEM_STOPS)]
    # The verbatim SQL box follows the Result-items table on the SAME page, and its lines are
    # shaped like origins ("SiteOwners.UniqueID AS UniqueID,"), so the walk ran straight off the
    # end of the table and kept pairing SQL line N with line N+1 as (alias, origin). It
    # contaminated 19 of 141 queries on one export and left two of them documented ENTIRELY by
    # junk, while the run reported success (wxKanban 899bdd0b). Stop at the SQL box.
    # Read record by record (each ends at its Type cell) rather than "the line above every origin":
    # that rule could not see a calculated or aggregate item at all, and it named a column after
    # whatever line preceded an origin - "number of" when an aggregate wrapped, a WHEN clause inside
    # a CASE expression, the tail of a wrapped name (wxKanban 899bdd0b). One block per page: a
    # record never continues across the reprinted heading, and the page furniture at the foot of
    # the previous page must not be read as the next page's first name.
    q["cols"] = [c for b in blks for c in parse_result_columns(b, name)]
    q["items"] = [(c["alias"], c["origin"]) for c in q["cols"] if c["kind"] == "simple"]

    # parameters. "p\w+_?" never matched this document family's real parameter names
    # ("ParamStartDate_Start", "ParamusGUIDAreaID"), so ALL parameters of ALL queries were reported
    # as none - a query that takes arguments read as one that does not (wxKanban a075d21f).
    pblk = block_after(lines, "Query parameters", {"Advanced settings", "Image",
                                                   "Additional information"})
    for l in pblk:
        if re.fullmatch(r"p\w+_?", l) or re.fullmatch(r"[Pp]aram\w*", l):
            if l not in q["params"]:
                q["params"].append(l)

    # Selection conditions. Requiring a "." dropped every condition on an UNQUALIFIED column
    # ("RecordDeleted  is equal to 0"), which is most of them, so queries read as unfiltered. Inside
    # the Selection-conditions block the comparison phrase is a safe anchor on its own; outside it,
    # keep requiring the qualifier so prose elsewhere on the page cannot become a condition.
    cblk = block_after(lines, "Selection conditions", {"Result items", "Query parameters",
                                                       "Advanced settings", "Image",
                                                       "Additional information"})
    for l in cblk:
        if COND_RE.search(l):
            q["conds"].append(re.sub(r"\s{2,}", " ", l).strip())
    for l in lines:
        if COND_RE.search(l) and "." in l:
            cond = re.sub(r"\s{2,}", " ", l).strip()
            if cond not in q["conds"]:
                q["conds"].append(cond)

    # literal SQL fragment present in the doc
    for i, l in enumerate(lines):
        if l.startswith("SQL code of"):
            q["sql_fragment"] = "\n".join(lines[i + 1:i + 12])
            break
    return q


_EXPR_TABLE_RE = re.compile(r"\b([A-Za-z_]\w*)\.(?:[A-Za-z_]\w*|\*)")


def tables_of(q):
    t = []
    for _, origin in q["items"]:
        tbl = origin.split(".")[0]
        if tbl not in t:
            t.append(tbl)
    # A count-only query has no simple item, so it read as "Tables: ?" although its aggregate names
    # the table outright ("number of NLUser.NLUserID not 'Null'").
    for c in q.get("cols", []):
        for tbl in _EXPR_TABLE_RE.findall(c["expr"] or ""):
            if tbl not in t:
                t.append(tbl)
    for c in q["conds"]:
        m = re.match(r"(\w+)\.", c)
        if m and m.group(1) not in t:
            t.append(m.group(1))
    return t


def _aggregate_sql(expr):
    """'sum of T.C' -> 'SUM(T.C)'; 'number of T.C not 'Null'' -> 'COUNT(T.C)'. None if unreadable."""
    m = re.match(r"^(\w+)\s+of\s+(\w+\.(?:\w+|\*))(?:\s+not\s+'Null')?\s*$", expr or "", re.I)
    if not m or m.group(1).lower() not in _AGGREGATE_SQL:
        return None
    return f"{_AGGREGATE_SQL[m.group(1).lower()]}({m.group(2)})"


def _column_sql(c):
    if c["kind"] == "simple":
        return f"{c['origin']} AS {c['alias']}"
    if c["kind"] == "aggregate":
        agg = _aggregate_sql(c["expr"])
        return f"{agg} AS {c['alias']}" if agg else f"/* !! {c['expr']} */ AS {c['alias']}"
    if c["expr"]:
        return f"{c['expr']} AS {c['alias']}"
    # Deliberately not runnable: a placeholder such as NULL would execute and return a column of
    # nothing, which is exactly the silent gap this marks.
    return f"/* !! calculated item: expression NOT in the export */ AS {c['alias']}"


def _column_md(c):
    if c["kind"] == "simple":
        return f"- `{c['alias']}` ← `{c['origin']}`"
    if c["expr"]:
        return f"- `{c['alias']}` ← {c['kind']}: `{c['expr']}`"
    return (f"- `{c['alias']}` ← calculated — **expression NOT in the export**; recover it from "
            "the WinDev project before rebuilding this query")


def reconstruct_sql(q, edges):
    cols_all = q.get("cols") or [dict(alias=a, origin=o, expr=None, kind="simple")
                                 for a, o in q["items"]]
    if not cols_all:
        return "-- (no result items captured)"
    cols = ",\n  ".join(_column_sql(c) for c in cols_all)
    tbls = tables_of(q)
    frm = tbls[0] if tbls else "?"
    # greedily join each remaining table to one already in the FROM/JOIN set via an FK edge
    joined = [frm] if tbls else []
    joins = ""
    for t in tbls[1:]:
        cond = None
        for other in joined:
            if (t, other) in edges:
                ci, cj = edges[(t, other)]
                cond = f"{t}.{ci} = {other}.{cj}"
                break
        joins += f"\n  JOIN {t} ON {cond}" if cond else f"\n  JOIN {t} ON /* no FK in analysis */ ..."
        joined.append(t)
    where = ""
    if q["conds"]:
        terms = []
        for c in q["conds"]:
            c2 = re.sub(r"\bis equal to\b", "=", c)
            c2 = re.sub(r"\bContains\b", "LIKE", c2, flags=re.I)
            terms.append(c2)
        where = "\nWHERE " + "\n  AND ".join(terms)
    group = ""
    plain = [c["origin"] for c in cols_all if c["kind"] == "simple"]
    if plain and any(c["kind"] == "aggregate" for c in cols_all):
        group = ("\n-- GROUP BY inferred: the export does not print it (the query editor groups"
                 " by every non-aggregate item)\nGROUP BY " + ", ".join(plain))
    return f"SELECT\n  {cols}\nFROM {frm}{joins}{where}{group};"


def infer_purpose(q):
    n = q["name"].replace("QRY_", "")
    words = re.sub(r"(?<!^)(?=[A-Z])", " ", n).strip()
    base = f"Returns {words.lower()}"
    if q["conds"]:
        filt = ", ".join(re.sub(r"\s+is.*$", "", c).split(".")[-1] for c in q["conds"][:3])
        base += f", filtered by {filt}"
    if q["params"]:
        base += f" (parameters: {', '.join(q['params'])})"
    return base + "."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/scopes")
    rd.add_redaction_args(ap, scan=False)
    args = ap.parse_args()

    # rebuild/scopes/_redactions.md is shared with the procedures and reports stages: continue it,
    # never overwrite it, and number above the splitter's tokens (wxKanban f6df3914).
    state = rd.RedactionState.resume(os.path.join(args.out, rd.SIDECAR_NAME),
                                     os.path.join(args.src, rd.SIDECAR_NAME))

    files = sorted(glob.glob(os.path.join(args.src, "*.qry.md")))
    queries = [parse_query(f) for f in files]

    # A query whose source clearly HAS a result-items table but whose result set came out empty is
    # an extractor failure, not a query without columns - and it used to pass silently, leaving two
    # report-feeding queries undocumented on a green run (wxKanban 899bdd0b). Named here, with the
    # source file, so it is actionable rather than merely counted.
    empty = []
    for path, q in zip(files, queries):
        q["empty"] = False
        if q["cols"]:
            continue
        if re.search(r"^\s*Result items\s*$",
                     open(path, encoding="utf-8", errors="replace").read(), re.M):
            empty.append((q["name"], os.path.basename(path)))
            q["empty"] = True
    if empty:
        print(f"queries-to-scope: !! {len(empty)} query/queries have a 'Result items' table in the "
              "source but ZERO result columns were recovered:", file=sys.stderr)
        for name, fn in empty[:12]:
            print(f"      {name}  ({fn})", file=sys.stderr)
        if len(empty) > 12:
            print(f"      ...and {len(empty) - 12} more", file=sys.stderr)
        print("  Their result sets are UNDOCUMENTED in the scope below. Recover them from the "
              "source PDF, and report this to wxKanban.", file=sys.stderr)
    # A calculated item whose expression the export does not print is a known gap, not a parse
    # failure - but it is still a column the rebuild cannot write from this document (899bdd0b).
    blind = [(q["name"], c["alias"]) for q in queries for c in q["cols"]
             if c["kind"] == "calculated" and not c["expr"]]
    if blind:
        print(f"queries-to-scope: !! {len(blind)} calculated column(s) have NO expression in the "
              "export (only the name and type are printed):", file=sys.stderr)
        for name, alias in blind[:12]:
            print(f"      {name}.{alias}", file=sys.stderr)
        if len(blind) > 12:
            print(f"      ...and {len(blind) - 12} more", file=sys.stderr)
        print("  The scope marks each one; recover the expressions from the WinDev project.",
              file=sys.stderr)
    edges = build_edges(parse_links(os.path.join(args.src, "_schema.md")))
    os.makedirs(args.out, exist_ok=True)

    md = ["# Scope — Database Queries (QRY_*)", "",
          "_One scope for all read queries used by the app. Generated from the converted "
          "`*.qry.md`._", "",
          "> **SQL caveat:** the source PDF clips each query's SQL box, so the **verbatim** SQL "
          "is only partially present. The result columns, parameters, and selection conditions "
          "ARE complete, so each query below has a **reconstructed** SQL SELECT (review joins — "
          "they come from the schema's foreign keys, not the original SQL). Exception: an export "
          "may print a calculated column's name without its expression; each such column is "
          "marked **expression NOT in the export**.", "",
          f"## Summary ({len(queries)} queries)", "",
          "| Query | Type | Tables | Parameters | Purpose |", "|---|---|---|---|---|"]
    for q in queries:
        md.append(f"| {q['name']} | {q['qtype'] or 'Select'} | {', '.join(tables_of(q)) or '?'} "
                  f"| {', '.join(q['params']) or '-'} | {infer_purpose(q)} |")
    md.append("\n---\n")

    for q in queries:
        md.append(f"## {q['name']}\n")
        md.append(f"**Purpose (inferred):** {infer_purpose(q)}\n")
        md.append(f"- **Type:** {q['qtype'] or 'Select query'}")
        md.append(f"- **Tables:** {', '.join(tables_of(q)) or '?'}")
        if q["params"]:
            md.append(f"- **Parameters:** {', '.join(q['params'])}")
        if q["cols"]:
            md.append("\n**Result columns:**\n")
            for c in q["cols"]:
                md.append(_column_md(c))
        elif q.get("empty"):
            # The console warning alone was not enough: the scope is what the next stage reads.
            md.append("\n**Result columns:** **!! NOT RECOVERED** — the source has a Result-items "
                      "table but no column could be read from it. Recover them from the source "
                      "PDF.")
        if q["conds"]:
            md.append("\n**Selection conditions:**\n")
            for c in q["conds"]:
                md.append(f"- {c}")
        md.append("\n**Reconstructed SQL:**\n")
        md.append("```sql\n" + reconstruct_sql(q, edges) + "\n```")
        if q["sql_fragment"]:
            md.append("\n**Literal SQL fragment present in the doc (truncated by the PDF):**\n")
            md.append("```sql\n" + q["sql_fragment"] + "\n```")
        md.append("\n---\n")

    out_path = os.path.join(args.out, "QRY-queries-scope.md")
    # [SCOPE 125 / T009] Through the shared funnel (FR-007): redacts, accumulates findings, and
    # stamps the watermark on .md — so the manual stamp_markdown call is gone, not duplicated.
    rd.write_text(out_path, "\n".join(md) + "\n", state)
    print(f"queries={len(queries)}  -> {out_path}")
    for q in queries:
        print(f"  {q['name']}: {len(q['cols'])} cols, {len(q['conds'])} conds, "
              f"{len(q['params'])} params")

    sidecar_path = os.path.join(args.out, rd.SIDECAR_NAME)
    if rd.ledger_changed(state):
        rd.write_text(sidecar_path, rd.render_sidecar(state), state)
    print(rd.summary_line(state, sidecar_path))
    return rd.exit_code(len(state.findings), args.fail_on_secrets)


if __name__ == "__main__":
    sys.exit(main())
