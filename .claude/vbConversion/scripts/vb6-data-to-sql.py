#!/usr/bin/env python3
"""
vb6-data-to-sql.py - Reconstruct a data model from a converted VB6 project (no declarative dictionary).

VB6 has NO data dictionary (unlike Clarion's .dct). The model is INFERRED from three signals the
splitter already captured into pre-convert/:
  1. Data controls (`VB.Data`, or ADO `Adodc`) in *.controls.md — `RecordSource` (a table or a SQL
     SELECT), `Connect`/`Connection`, `DatabaseName`, `RecordsetType`.
  2. Bound controls — `DataSource = <dataControl>` + `DataField = <column>` give the columns of that
     data source's table (and which screen field edits each).
  3. Code in *.page.md / *.proc.md — `datX.RecordSource = "select ... from T ..."`,
     `datX.DatabaseName = App.Path & "..mdb path.."`, and `Recordset.AddNew/Update/Delete` (the CRUD).

Output (under --out, default rebuild/db/):
  schema.<dialect>.sql  - CREATE TABLE per inferred table (columns from bound DataFields; types are
                          UNKNOWN in VB6 binding, emitted as the dialect's text type with a verify note
                          + light name-based hints) and the bound-field → screen-field map in comments.
  ER-diagram.md         - Mermaid erDiagram (one entity per data source) + per-table field reference +
                          the Jet/.mdb → target-DB migration note.

VB6 carries no foreign keys at the form layer; relationships live in the .mdb (Jet) — surfaced as a
TODO to confirm against the database, never invented.

Usage:
    python scripts/vb6-data-to-sql.py --dialect postgres --src pre-convert --out rebuild/db
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

FENCE_RE = re.compile(r"```(?:vb)?\n(.*?)```", re.S)
BEGIN_RE = re.compile(r"^\s*Begin\s+(\S+)\s+(\S+)\s*$", re.I)
END_RE = re.compile(r"^\s*End\s*$", re.I)
PROP_RE = re.compile(r"^\s*(\w+)\s*=\s*(.*)$")

TYPEMAP = {
    "postgres": {"text": "VARCHAR(255)", "memo": "TEXT", "date": "DATE", "int": "INTEGER", "bool": "BOOLEAN"},
    "mssql": {"text": "NVARCHAR(255)", "memo": "NVARCHAR(MAX)", "date": "DATE", "int": "INT", "bool": "BIT"},
    "mysql": {"text": "VARCHAR(255)", "memo": "TEXT", "date": "DATE", "int": "INT", "bool": "TINYINT(1)"},
}


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
    # Normalize CRLF/CR → LF so the fence regex (which anchors on `\n`) matches
    # markdown written in text mode on Windows.
    return text.replace("\r\n", "\n").replace("\r", "\n")


def all_fences(text):
    return "\n".join(m.group(1) for m in FENCE_RE.finditer(text))


def parse_data_sources(struct_text):
    """From a form's raw Begin..End structure, return:
       data_ctrls: {name: {recordsource, connect, databasename, recordsettype}}
       bound:      {datasource_name: [(datafield, bound_control_name)]}"""
    lines = struct_text.split("\n")
    data_ctrls, bound = {}, {}
    stack = []  # (ctype, name, props)
    for ln in lines:
        m = BEGIN_RE.match(ln)
        if m:
            stack.append([m.group(1), m.group(2), {}])
            continue
        if END_RE.match(ln):
            if not stack:
                continue
            ctype, name, props = stack.pop()
            low = ctype.lower()
            if low in ("vb.data", "msadodc.adodc") or low.endswith(".adodc"):
                data_ctrls[name] = {
                    "recordsource": props.get("RecordSource", "").strip('"'),
                    "connect": props.get("Connect", props.get("ConnectionString", "")).strip('"'),
                    "databasename": props.get("DatabaseName", "").strip('"'),
                    "recordsettype": props.get("RecordsetType", ""),
                }
            ds = props.get("DataSource", "").strip('"')
            df = props.get("DataField", "").strip('"')
            if ds and df:
                bound.setdefault(ds, [])
                if (df, name) not in bound[ds]:
                    bound[ds].append((df, name))
            continue
        pm = PROP_RE.match(ln)
        if pm and stack:
            stack[-1][2][pm.group(1)] = pm.group(2).strip()
    return data_ctrls, bound


def table_from_recordsource(rs):
    """A bare table name, or the first FROM table of a SELECT."""
    if not rs:
        return None
    m = re.search(r"\bfrom\s+\[?([A-Za-z0-9_ ]+?)\]?\s*(?:where|order|group|$)", rs, re.I)
    if m:
        return m.group(1).strip()
    return rs.strip().strip("[]")


def scan_code_for_sources(code_text, data_ctrls):
    """Pick up dynamic `datX.RecordSource = "..."`, `.DatabaseName = ...`, and CRUD verbs from code."""
    crud = set()
    for m in re.finditer(r"(\w+)\.RecordSource\s*=\s*(.+)", code_text, re.I):
        name, val = m.group(1), m.group(2)
        sqlm = re.search(r'"([^"]*\bfrom\b[^"]*)"', val, re.I) or re.search(r'"([^"]+)"', val)
        if name in data_ctrls and sqlm and not data_ctrls[name].get("recordsource"):
            data_ctrls[name]["recordsource"] = sqlm.group(1)
    for m in re.finditer(r"(\w+)\.DatabaseName\s*=\s*(.+)", code_text, re.I):
        name = m.group(1)
        if name in data_ctrls and not data_ctrls[name].get("databasename"):
            data_ctrls[name]["databasename"] = m.group(2).strip()
    for verb in ("AddNew", "Update", "Delete", "Edit", "MoveNext", "MovePrevious", "FindFirst", "Seek"):
        if re.search(rf"\.{verb}\b", code_text, re.I):
            crud.add(verb)
    return crud


def col_type(field, dialect):
    f = field.lower()
    tm = TYPEMAP[dialect]
    if any(k in f for k in ("date", "birth", "dob")):
        return tm["date"]
    if "notes" in f or "memo" in f or "comment" in f or "description" in f:
        return tm["memo"]
    if f in ("id",) or f.endswith("id") or f.endswith("count") or f.endswith("qty"):
        return tm["int"]
    return tm["text"]


def sanitize(col):
    """A SQL-safe column id; spaces/odd chars → underscore. Original kept in a comment."""
    s = re.sub(r"[^A-Za-z0-9_]", "_", col).strip("_")
    return s or "col"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dialect", default="postgres", choices=list(TYPEMAP))
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/db")
    args = ap.parse_args()

    data_ctrls, bound, crud, dbfiles = {}, {}, set(), set()
    for p in sorted(glob.glob(os.path.join(args.src, "*.controls.md"))):
        dc, bd = parse_data_sources(all_fences(read(p)))
        data_ctrls.update(dc)
        for ds, fields in bd.items():
            bound.setdefault(ds, [])
            for f in fields:
                if f not in bound[ds]:
                    bound[ds].append(f)
    for p in sorted(glob.glob(os.path.join(args.src, "*.page.md")) + glob.glob(os.path.join(args.src, "*.proc.md"))):
        crud |= scan_code_for_sources(all_fences(read(p)), data_ctrls)

    # Resolve a table per data control, attaching its bound columns.
    tables = []
    for name, info in data_ctrls.items():
        tbl = table_from_recordsource(info.get("recordsource")) or name
        cols = bound.get(name, [])
        dbm = re.search(r"[\\/]([\w ]+\.(?:mdb|accdb))", info.get("databasename", ""), re.I)
        if dbm:
            dbfiles.add(dbm.group(1))
        tables.append(dict(name=tbl, source_control=name, info=info, cols=cols))

    os.makedirs(args.out, exist_ok=True)
    tm = TYPEMAP[args.dialect]

    sql = [f"-- DDL dialect={args.dialect}. INFERRED from VB6 data bindings — no dictionary existed.",
           "-- Column TYPES are unknown at the VB6 binding layer: emitted as the dialect text type with",
           f"-- light name-based hints (date/notes/id). VERIFY every type/length against the source DB"
           + (f" ({', '.join(sorted(dbfiles))})." if dbfiles else "."),
           "-- VB6 carries no FKs at the form layer; relationships live in the Jet/.mdb — confirm there.", ""]
    er = ["# Database (inferred ER diagram & field reference)", "",
          f"_Reconstructed from VB6 Data-control bindings. Target dialect: **{args.dialect}**._", "",
          "## Entity-relationship diagram", "", "```mermaid", "erDiagram"]
    for t in tables:
        er.append(f"    {sanitize(t['name'])} {{")
        for df, _ in t["cols"]:
            er.append(f"        {col_type(df, args.dialect).split('(')[0].lower()} {sanitize(df)}")
        er.append("    }")
    er.append("```\n")

    for t in tables:
        sql.append(f"CREATE TABLE {sanitize(t['name'])} (")
        # (definition, inline-comment) pairs; the column-separator comma must go
        # BEFORE the `-- comment` or the comment swallows it and the DDL breaks.
        entries = [(f"id {tm['int']} GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY",
                    "synthesized; VB6 form bound no key")]
        for df, ctrl in t["cols"]:
            col, ct = sanitize(df), col_type(df, args.dialect)
            cmt = f'bound "{df}" <- {ctrl}' + ("  (renamed: spaces)" if col != df else "")
            entries.append((f"{col} {ct}", cmt))
        out_lines = []
        for i, (defn, cmt) in enumerate(entries):
            comma = "," if i < len(entries) - 1 else ""
            out_lines.append(f"  {defn}{comma}  -- {cmt}")
        sql.append("\n".join(out_lines))
        sql.append(");\n")
        er.append(f"### {sanitize(t['name'])}  _(VB6 source: `{t['source_control']}`, "
                  f"RecordSource `{t['info'].get('recordsource') or '?'}`)_\n")
        er.append("| Column (target) | Bound DataField | Edited by control | Inferred type |")
        er.append("|---|---|---|---|")
        for df, ctrl in t["cols"]:
            er.append(f"| {sanitize(df)} | {df} | {ctrl} | {col_type(df, args.dialect)} |")
        er.append("")

    er.append("## CRUD observed in code\n")
    er.append((", ".join(sorted(crud)) or "_(none detected)_") + "\n")
    er.append("""## Migrating the data out of Access (Jet)

The legacy data lives in an **Access `.mdb`/`.accdb` (Jet)** the target DB cannot read directly.

> **Action required (developer):** export each table to JSON/CSV (Access export, `mdb-tools`, or a
> small ADO/DAO dump script), then load into the target DB using this DDL. Confirm the **real column
> types, lengths, and the primary key** against the `.mdb` — the VB6 form binding does not carry them.

Notes for the loader:
- Access column names with **spaces** were renamed (underscore); the original is in a column comment.
- Access `Yes/No` → boolean; `Date/Time` → date/timestamp; `Memo` → text/clob; `AutoNumber` → identity.
- The form bound **no primary key**, so an `id` identity column is synthesized — replace it if the
  `.mdb` already has a key (e.g. `ContactID`).
""")

    open(os.path.join(args.out, f"schema.{args.dialect}.sql"), "w", encoding="utf-8").write("\n".join(sql) + "\n")
    open(os.path.join(args.out, "ER-diagram.md"), "w", encoding="utf-8").write(stamp_markdown("\n".join(er) + "\n", kind='converted', generator='vbConversion'))

    print(f"dialect={args.dialect}  data-controls={len(data_ctrls)}  tables={len(tables)}")
    for t in tables:
        print(f"  {t['name']}: {len(t['cols'])} columns  (from {t['source_control']})")
    if dbfiles:
        print(f"  source DB: {', '.join(sorted(dbfiles))}")
    if crud:
        print(f"  CRUD in code: {', '.join(sorted(crud))}")


if __name__ == "__main__":
    main()
