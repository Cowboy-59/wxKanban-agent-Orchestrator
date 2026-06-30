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
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

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
    try:
        i = lines.index(header)
    except ValueError:
        return []
    out = []
    for l in lines[i + 1:]:
        if l in stops:
            break
        out.append(l)
    return out


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
    blk = block_after(lines, "Result items", ITEM_STOPS)
    j = 0
    while j < len(blk):
        if "." in blk[j] and re.match(r"^\w+\.\w+", blk[j]):
            origin = blk[j].strip()
            alias = blk[j - 1].strip() if j > 0 else origin.split(".")[-1]
            q["items"].append((alias, origin))
        j += 1

    # parameters (pXxx tokens that appear under "Query parameters")
    pblk = block_after(lines, "Query parameters", {"Advanced settings", "Image",
                                                   "Additional information"})
    for l in pblk:
        if re.fullmatch(r"p\w+_?", l):
            if l not in q["params"]:
                q["params"].append(l)

    # selection conditions (lines that contain a comparison phrase)
    for l in lines:
        if COND_RE.search(l) and "." in l:
            q["conds"].append(re.sub(r"\s{2,}", " ", l).strip())

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
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.src, "*.qry.md")))
    queries = [parse_query(f) for f in files]
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
    open(out_path, "w", encoding="utf-8").write(
        stamp_markdown("\n".join(md) + "\n", kind="converted", generator="wxConversion"))
    print(f"queries={len(queries)}  -> {out_path}")
    for q in queries:
        print(f"  {q['name']}: {len(q['items'])} cols, {len(q['conds'])} conds, "
              f"{len(q['params'])} params")


if __name__ == "__main__":
    main()
