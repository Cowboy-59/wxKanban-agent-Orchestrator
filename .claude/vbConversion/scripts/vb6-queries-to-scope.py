#!/usr/bin/env python3
"""
vb6-queries-to-scope.py - Collect the SQL a VB6 app runs into one queries scope.

VB6 has no stored "queries" object; SQL lives in code as string literals (often concatenated with
`& _`), as `DataControl.RecordSource = "..."`, and as `Recordset.Open "..."` / `db.OpenRecordset`.
This documents each as a query with its source procedure cited.

Input : pre-convert/*.page.md, *.proc.md (code fences) + *.controls.md (static RecordSource on Data
        controls).
Output: rebuild/scopes/QRY-queries-scope.md

Usage:
    python scripts/vb6-queries-to-scope.py --src pre-convert --out rebuild/scopes
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

FENCE_RE = re.compile(r"```(?:vb)?\n(.*?)```", re.S)
SQL_KW = re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE)\b", re.I)
RECSRC_RE = re.compile(r"(\w+)\.RecordSource\s*=\s*(.+)", re.I)
OPEN_RE = re.compile(r"\.(?:Open|OpenRecordset)\s+(.+)", re.I)
STR_RE = re.compile(r'"([^"]*)"')


def read(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin-1", "replace")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def fences(text):
    return "\n".join(m.group(1) for m in FENCE_RE.finditer(text))


def current_proc(lines, idx):
    """Name of the Sub/Function enclosing line idx (best effort)."""
    for k in range(idx, -1, -1):
        m = re.match(r"^\s*(?:Public|Private|Friend|Static)*\s*(?:Sub|Function)\s+(\w+)", lines[k], re.I)
        if m:
            return m.group(1)
    return "(module-level)"


def first_string(expr):
    m = STR_RE.search(expr)
    return (m.group(1), expr.rstrip().endswith("& _")) if m else (None, False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/scopes")
    args = ap.parse_args()

    findings = []  # (source_label, proc, kind, sql, continued)
    # 1) dynamic SQL in code
    for p in sorted(glob.glob(os.path.join(args.src, "*.page.md")) + glob.glob(os.path.join(args.src, "*.proc.md"))):
        label = os.path.basename(p)
        lines = fences(read(p)).split("\n")
        for i, ln in enumerate(lines):
            for rx, kind in ((RECSRC_RE, "RecordSource"), (OPEN_RE, "Recordset.Open")):
                m = rx.search(ln)
                if not m:
                    continue
                expr = m.group(m.lastindex)
                sql, cont = first_string(expr)
                if sql and SQL_KW.search(sql + (" from" if kind == "RecordSource" else "")):
                    findings.append((label, current_proc(lines, i), kind, sql, cont))
            # bare SQL string literals
            if SQL_KW.search(ln):
                for sm in STR_RE.finditer(ln):
                    if SQL_KW.search(sm.group(1)):
                        findings.append((label, current_proc(lines, i), "inline SQL", sm.group(1),
                                         ln.rstrip().endswith("& _")))
    # 2) static RecordSource on Data controls
    for p in sorted(glob.glob(os.path.join(args.src, "*.controls.md"))):
        for m in re.finditer(r'RecordSource\s*=\s*"([^"]+)"', fences(read(p))):
            findings.append((os.path.basename(p), "(Data control)", "RecordSource (static)", m.group(1), False))

    # dedupe by (sql, kind)
    seen, uniq = set(), []
    for f in findings:
        key = (f[2], f[3].strip().lower())
        if key not in seen:
            seen.add(key)
            uniq.append(f)

    os.makedirs(args.out, exist_ok=True)
    out = ["# Queries scope (VB6 SQL)", "",
           "_Reconstructed from VB6 code (`RecordSource` / `Recordset.Open` / inline SQL). VB6 has no_"
           "_ stored-query object, so each query is cited to the procedure that runs it. SQL built by_"
           "_ `& _` string concatenation may be truncated at the first literal — verify the full text._", ""]
    if not uniq:
        out.append("_No SQL found in code or RecordSource. The app likely binds tables directly via_"
                   " Data controls — see the database scope.\n")
    else:
        out.append(f"**{len(uniq)} distinct query/queries** found.\n")
        for label, proc, kind, sql, cont in uniq:
            out.append(f"## {kind} — `{proc}`  _({label})_\n")
            out.append("```sql\n" + sql + ("  -- …concatenated, continues (& _)" if cont else "") + "\n```\n")
            verb = (SQL_KW.search(sql) or [None])
            out.append(f"- Operation: {SQL_KW.search(sql).group(1).upper() if SQL_KW.search(sql) else 'table bind'}")
            out.append("- Rebuild: expose as a REST endpoint / data-layer query; parameterize any "
                       "string-concatenated values (SQL-injection risk in the original).\n")
    open(os.path.join(args.out, "QRY-queries-scope.md"), "w", encoding="utf-8").write(stamp_markdown("\n".join(out) + "\n", kind='converted', generator='vbConversion'))
    print(f"queries={len(uniq)}  -> {os.path.join(args.out, 'QRY-queries-scope.md')}")


if __name__ == "__main__":
    main()
