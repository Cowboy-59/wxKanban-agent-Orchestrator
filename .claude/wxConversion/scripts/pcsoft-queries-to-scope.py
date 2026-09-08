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
    """
    out, cur, collecting = [], [], False
    for l in lines:
        if l == header:
            if collecting and cur:
                out.append(cur)
            cur, collecting = [], True
            continue
        if not collecting:
            continue
        if l in stops:
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


def parse_query(path):
    name = os.path.basename(path).split(".")[0]
    lines = [l.strip() for l in open(path, encoding="utf-8").read().split("\n") if l.strip()]
    q = dict(name=name, qtype="", items=[], params=[], conds=[], sql_fragment="")

    # query type
    for i, l in enumerate(lines):
        if l == "Query type" and i + 1 < len(lines):
            q["qtype"] = lines[i + 1]
            break

    # result items: records of (alias, origin Table.Col, type) — anchor on origin containing '.'
    ITEM_STOPS = {"Query parameters", "Advanced settings", "Image", "Additional information"}
    blk = [l for b in blocks_after(lines, "Result items", ITEM_STOPS)
           for l in b[:_sql_box_start(b)]]
    # The verbatim SQL box follows the Result-items table on the SAME page, and its lines are
    # shaped like origins ("SiteOwners.UniqueID AS UniqueID,"), so the walk ran straight off the
    # end of the table and kept pairing SQL line N with line N+1 as (alias, origin). It
    # contaminated 19 of 141 queries on one export and left two of them documented ENTIRELY by
    # junk, while the run reported success (wxKanban 899bdd0b). Stop at the SQL box.
    j = 0
    while j < len(blk):
        # A result origin may name a whole table ("Table.*"): anchoring on \w+\.\w+ dropped every
        # wildcard item, so a query selecting five whole tables documented zero result columns
        # (wxKanban a075d21f).
        if re.match(r"^\w+\.(?:\w+|\*)", blk[j]) and not _looks_like_sql(blk[j]):
            origin = blk[j].strip()
            alias = blk[j - 1].strip() if j > 0 else origin.split(".")[-1]
            if not _looks_like_sql(alias):
                q["items"].append((alias, origin))
        j += 1

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


def tables_of(q):
    t = []
    for _, origin in q["items"]:
        tbl = origin.split(".")[0]
        if tbl not in t:
            t.append(tbl)
    for c in q["conds"]:
        m = re.match(r"(\w+)\.", c)
        if m and m.group(1) not in t:
            t.append(m.group(1))
    return t


def reconstruct_sql(q, edges):
    if not q["items"]:
        return "-- (no result items captured)"
    cols = ",\n  ".join(f"{origin} AS {alias}" for alias, origin in q["items"])
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
    return f"SELECT\n  {cols}\nFROM {frm}{joins}{where};"


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

    state = rd.RedactionState()

    files = sorted(glob.glob(os.path.join(args.src, "*.qry.md")))
    queries = [parse_query(f) for f in files]

    # A query whose source clearly HAS a result-items table but whose result set came out empty is
    # an extractor failure, not a query without columns - and it used to pass silently, leaving two
    # report-feeding queries undocumented on a green run (wxKanban 899bdd0b). Named here, with the
    # source file, so it is actionable rather than merely counted.
    empty = []
    for path, q in zip(files, queries):
        if q["items"]:
            continue
        if re.search(r"^\s*Result items\s*$",
                     open(path, encoding="utf-8", errors="replace").read(), re.M):
            empty.append((q["name"], os.path.basename(path)))
    if empty:
        print(f"queries-to-scope: !! {len(empty)} query/queries have a 'Result items' table in the "
              "source but ZERO result columns were recovered:", file=sys.stderr)
        for name, fn in empty[:12]:
            print(f"      {name}  ({fn})", file=sys.stderr)
        if len(empty) > 12:
            print(f"      ...and {len(empty) - 12} more", file=sys.stderr)
        print("  Their result sets are UNDOCUMENTED in the scope below. Recover them from the "
              "source PDF, and report this to wxKanban.", file=sys.stderr)
    edges = build_edges(parse_links(os.path.join(args.src, "_schema.md")))
    os.makedirs(args.out, exist_ok=True)

    md = ["# Scope — Database Queries (QRY_*)", "",
          "_One scope for all read queries used by the app. Generated from the converted "
          "`*.qry.md`._", "",
          "> **SQL caveat:** the source PDF clips each query's SQL box, so the **verbatim** SQL "
          "is only partially present. The result columns, parameters, and selection conditions "
          "ARE complete, so each query below has a **reconstructed** SQL SELECT (review joins — "
          "they come from the schema's foreign keys, not the original SQL).", "",
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
        if q["items"]:
            md.append("\n**Result columns:**\n")
            for alias, origin in q["items"]:
                md.append(f"- `{alias}` ← `{origin}`")
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
        print(f"  {q['name']}: {len(q['items'])} cols, {len(q['conds'])} conds, "
              f"{len(q['params'])} params")

    sidecar_path = os.path.join(args.out, rd.SIDECAR_NAME)
    if state.findings:
        rd.write_text(sidecar_path, rd.render_sidecar(state), state)
    print(rd.summary_line(state, sidecar_path))
    return rd.exit_code(len(state.findings), args.fail_on_secrets)


if __name__ == "__main__":
    sys.exit(main())
