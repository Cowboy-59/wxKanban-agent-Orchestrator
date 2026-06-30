#!/usr/bin/env python3
"""
clarion-dict-to-sql.py - Generate DDL + an ER diagram from a converted Clarion dictionary.

Input : pre-convert/*.table.md  (one per FILE; each embeds the verbatim [FILE] block in a ```clarion
        fence) and pre-convert/_schema.md (the [RELATION] links fence).
Output: rebuild/db/schema.<dialect>.sql  - CREATE TABLE + PRIMARY KEY + FK constraints
        rebuild/db/ER-diagram.md          - Mermaid erDiagram + per-table field docs + migration notes

Field names/types are kept faithful by default. The Clarion file PREFIX (CUS:) is stripped from the
emitted column name (noted in a comment); pass --keep-prefix to preserve it. The Clarion TYPE is
mapped to the nearest target type; lengths/precision are recovered from the field PICTURE when the
TYPE alone does not carry them.

Usage:
    python scripts/clarion-dict-to-sql.py --dialect postgres --out rebuild/db
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

# Clarion TYPE -> internal key.
CLARION_TYPE = {
    "BYTE": "uint1", "SHORT": "int2", "USHORT": "int4", "SIGNED": "int4", "UNSIGNED": "int4",
    "LONG": "int4", "ULONG": "int8", "DATE": "date", "TIME": "time", "BOOL": "boolean",
    "SREAL": "real", "REAL": "double", "DECIMAL": "numeric", "PDECIMAL": "numeric",
    "STRING": "varchar", "CSTRING": "varchar", "PSTRING": "varchar",
    "MEMO": "text", "BLOB": "blob", "GROUP": "group",
}

# internal key -> target type, per dialect.
TYPEMAP = {
    "firebird": {
        "uint1": "SMALLINT", "int2": "SMALLINT", "int4": "INTEGER", "int8": "BIGINT",
        "date": "DATE", "time": "TIME", "boolean": "BOOLEAN", "real": "FLOAT",
        "double": "DOUBLE PRECISION", "numeric": "NUMERIC({p},{s})",
        "varchar": "VARCHAR({n})", "text": "BLOB SUB_TYPE TEXT", "blob": "BLOB SUB_TYPE BINARY",
    },
    "postgres": {
        "uint1": "SMALLINT", "int2": "SMALLINT", "int4": "INTEGER", "int8": "BIGINT",
        "date": "DATE", "time": "TIME", "boolean": "BOOLEAN", "real": "REAL",
        "double": "DOUBLE PRECISION", "numeric": "NUMERIC({p},{s})",
        "varchar": "VARCHAR({n})", "text": "TEXT", "blob": "BYTEA",
    },
    "mssql": {
        "uint1": "TINYINT", "int2": "SMALLINT", "int4": "INT", "int8": "BIGINT",
        "date": "DATE", "time": "TIME", "boolean": "BIT", "real": "REAL",
        "double": "FLOAT", "numeric": "DECIMAL({p},{s})",
        "varchar": "NVARCHAR({n})", "text": "NVARCHAR(MAX)", "blob": "VARBINARY(MAX)",
    },
    "mysql": {
        "uint1": "TINYINT UNSIGNED", "int2": "SMALLINT", "int4": "INT", "int8": "BIGINT",
        "date": "DATE", "time": "TIME", "boolean": "TINYINT(1)", "real": "FLOAT",
        "double": "DOUBLE", "numeric": "DECIMAL({p},{s})",
        "varchar": "VARCHAR({n})", "text": "LONGTEXT", "blob": "LONGBLOB",
    },
}

FENCE_RE = re.compile(r"```clarion\n(.*?)```", re.S)
ROW_RE = re.compile(r"^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$")


def fence_body(path):
    m = FENCE_RE.search(open(path, encoding="utf-8").read())
    return m.group(1) if m else ""


def strip_prefix(name, prefix):
    if prefix and name.upper().startswith(prefix.upper() + ":"):
        return name.split(":", 1)[1]
    return name.split(":", 1)[1] if ":" in name else name


def parse_table_md(path):
    """Read the normalized *.table.md the splitter wrote: `- prefix:` / `- primary-key:` metadata
    plus the | Field | Clarion type | Length | Decimals | Picture | table. Input-format-agnostic."""
    text = open(path, encoding="utf-8").read()
    name = os.path.basename(path).split(".")[0]
    nm = re.search(r"^#\s*Table:\s*(.+)$", text, re.M)
    if nm:
        name = nm.group(1).strip()
    prefix = (re.search(r"^-\s*prefix:\s*(.*)$", text, re.M) or [None, ""])
    prefix = prefix.group(1).strip() if hasattr(prefix, "group") else ""
    pkm = re.search(r"^-\s*primary-key:\s*(.*)$", text, re.M)
    pk = [c.strip() for c in (pkm.group(1) if pkm else "").split(",") if c.strip()]
    fields = []
    for ln in text.split("\n"):
        m = ROW_RE.match(ln)
        if not m:
            continue
        col, ctype = m.group(1), m.group(2)
        if col.lower() in ("field", "---") or ctype.lower() == "clarion type" or set(col) <= {"-"}:
            continue
        length = int(m.group(3)) if m.group(3).isdigit() else None
        dec = int(m.group(4)) if m.group(4).isdigit() else None
        fields.append(dict(name=col, ctype=ctype.upper(), length=length, decimals=dec,
                           picture=m.group(5) or None))
    return dict(name=name, prefix=prefix or None, pk=pk, fields=fields)


REL_ROW_RE = re.compile(r"^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$")


def parse_relations(text):
    """Return list of dict(parent, child, parent_field, child_field) from `_schema.md`.

    Prefers the `| Parent | Parent key | Child | Child key |` table (field-level links recovered
    from generated ABC `AddRelationLink`); falls back to the older FILE-pair fence (file-level only,
    fields = None) for dictionaries that carried only `[RELATION]`/`FILE` pairs."""
    rels = []
    for ln in text.split("\n"):
        m = REL_ROW_RE.match(ln)
        if not m:
            continue
        parent, pkey, child, ckey = (g.strip() for g in m.groups())
        low = parent.lower()
        if low in ("parent", "field") or set(parent) <= {"-"} or low == "---":
            continue
        rels.append(dict(parent=parent, child=child,
                         parent_field=pkey or None, child_field=ckey or None))
    if rels:
        return rels
    # legacy fence fallback: consecutive FILE lines inside a [RELATION] block
    parent = None
    for ln in text.split("\n"):
        if ln.strip().upper().startswith("[RELATION]"):
            parent = None
        m = re.match(r"\s*FILE\b[\s(']*([^)'\n]+)", ln)
        if m:
            v = m.group(1).strip().strip("'\")")
            if parent is None:
                parent = v
            else:
                rels.append(dict(parent=parent, child=v, parent_field=None, child_field=None))
                parent = None
    return rels


def col_type(f, dialect):
    key = CLARION_TYPE.get((f.get("ctype") or "").upper(), "varchar")
    if key == "group":
        return None
    tm = TYPEMAP[dialect]
    t = tm.get(key, "VARCHAR(255)")
    if "{n}" in t:
        t = t.format(n=f.get("length") or 255)
    if "{p}" in t:
        t = t.format(p=f.get("length") or 18, s=f.get("decimals") if f.get("decimals") is not None else 4)
    return t


def emit_ddl(tables, links, dialect, keep_prefix):
    out = [f"-- DDL dialect={dialect}. Generated from the Clarion dictionary.",
           "-- Names/types FAITHFUL (1:1). File prefix "
           + ("kept" if keep_prefix else "stripped (original noted in comment)") + ".",
           "-- PRIMARY KEY taken from the dictionary PRIMARY key; review composite keys.",
           "-- Clarion has no boolean/unsigned parity on every target — verify edge cases.", ""]
    valid = {t["name"] for t in tables}
    for t in tables:
        out.append(f"CREATE TABLE {t['name']} (")
        cols = []
        for f in t["fields"]:
            ct = col_type(f, dialect)
            if ct is None:
                out.append(f"  -- {f.get('name')}: GROUP (composite) — flatten or model separately")
                continue
            raw = f.get("name") or "col"
            col = raw if keep_prefix else strip_prefix(raw, t["prefix"])
            cmt = f"  -- {raw}" + (f"  picture {f['picture']}" if f.get("picture") else "")
            cols.append((f"{col} {ct}", cmt))
        if t["pk"]:
            pkcols = ", ".join(t["pk"])
            cols.append((f"CONSTRAINT PK_{t['name']} PRIMARY KEY ({pkcols})", ""))
        lines = []
        for idx, (c, cmt) in enumerate(cols):
            comma = "," if idx < len(cols) - 1 else ""
            lines.append(f"  {c}{comma}{cmt}")
        out.append("\n".join(lines))
        out.append(");\n")
    out.append("-- ---- Foreign keys (from the dictionary relation graph) ----")
    prefix_of = {t["name"]: t["prefix"] for t in tables}
    for r in links:
        parent, child = r["parent"], r["child"]
        if parent not in valid or child not in valid:
            continue
        pf = [strip_prefix(c.strip(), prefix_of.get(parent)) for c in (r.get("parent_field") or "").split(",") if c.strip()]
        cf = [strip_prefix(c.strip(), prefix_of.get(child)) for c in (r.get("child_field") or "").split(",") if c.strip()]
        if keep_prefix:
            pf = [c.strip() for c in (r.get("parent_field") or "").split(",") if c.strip()]
            cf = [c.strip() for c in (r.get("child_field") or "").split(",") if c.strip()]
        if pf and cf and len(pf) == len(cf):
            out.append(f"ALTER TABLE {child} ADD CONSTRAINT FK_{child}_{parent} "
                       f"FOREIGN KEY ({', '.join(cf)}) REFERENCES {parent} ({', '.join(pf)});")
        else:
            out.append(f"-- {child} -> {parent}: add FK once the join columns are confirmed")
            out.append(f"-- ALTER TABLE {child} ADD CONSTRAINT FK_{child}_{parent} "
                       f"FOREIGN KEY (<{parent}id>) REFERENCES {parent} (<id>);")
    return "\n".join(out) + "\n"


def emit_er(tables, links, dialect, keep_prefix):
    out = ["# Database (ER diagram & field reference)", "",
           f"_Generated from the Clarion dictionary. Target dialect: **{dialect}**. "
           f"Field names/types faithful (1:1)._", "",
           "## Entity-relationship diagram", "", "```mermaid", "erDiagram"]
    valid = {t["name"] for t in tables}
    for r in links:
        if r["parent"] in valid and r["child"] in valid:
            out.append(f"    {r['parent']} ||--o{{ {r['child']} : has")
    out.append("```")
    out.append("\n## Tables\n")
    for t in tables:
        out.append(f"### {t['name']}" + (f"  _(prefix `{t['prefix']}`)_" if t["prefix"] else "") + "\n")
        out.append("| Column | Clarion type | Picture | Target type | PK |")
        out.append("|---|---|---|---|---|")
        for f in t["fields"]:
            ct = col_type(f, dialect) or "*(group)*"
            raw = f.get("name") or ""
            col = raw if keep_prefix else strip_prefix(raw, t["prefix"])
            ispk = "✓" if col in t["pk"] else ""
            out.append(f"| {col} | {f.get('ctype') or ''} | {f.get('picture') or ''} | {ct} | {ispk} |")
        out.append("")
    out.append(MIGRATION_NOTE)
    return "\n".join(out) + "\n"


MIGRATION_NOTE = """## Migrating the data out of Clarion

Clarion data lives in **TopSpeed (`.tps`)**, **Clarion `.dat`**, or **Btrieve/Pervasive** ISAM files
that the target DB cannot read directly. Export it from the Clarion side first:

> **Action required (developer):** write a small **Clarion export procedure** that opens each file,
> loops it (`SET(key)` / `NEXT(file)` until end-of-file), and serializes each record to **JSON**
> (one JSON array per table, or NDJSON). A loader then reads that JSON and inserts into the target DB
> using the DDL in this folder.

Migration checklist for the loader step:
- **Clarion `DATE`** is an integer = days since **1800-12-28** → convert to an ISO date.
- **Clarion `TIME`** is an integer = **centiseconds since midnight** (1 = 00:00:00.00) → convert.
- Strings are usually **Windows-1252** → convert to **UTF-8**; trim trailing spaces from `STRING`.
- `DECIMAL`/`PDECIMAL` carry sign+implied decimal — preserve precision/scale.
- Empty strings and 0-dates often mean **NULL** — decide per column.
- Load order must respect FKs (parents before children).
- `MEMO`/`BLOB` → export as base64 in the JSON, or to files + store a path.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dialect", default="postgres", choices=list(TYPEMAP))
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/db")
    ap.add_argument("--keep-prefix", action="store_true")
    args = ap.parse_args()

    tables = []
    for p in sorted(glob.glob(os.path.join(args.src, "*.table.md"))):
        t = parse_table_md(p)
        if t["fields"] or t["name"]:
            tables.append(t)
    schema_path = os.path.join(args.src, "_schema.md")
    links = parse_relations(open(schema_path, encoding="utf-8").read()) if os.path.exists(schema_path) else []

    os.makedirs(args.out, exist_ok=True)
    sql_path = os.path.join(args.out, f"schema.{args.dialect}.sql")
    er_path = os.path.join(args.out, "ER-diagram.md")
    open(sql_path, "w", encoding="utf-8").write(emit_ddl(tables, links, args.dialect, args.keep_prefix))
    open(er_path, "w", encoding="utf-8").write(
        stamp_markdown(emit_er(tables, links, args.dialect, args.keep_prefix),
                       kind='converted', generator='cwConversion'))

    nfields = sum(len(t["fields"]) for t in tables)
    print(f"dialect={args.dialect}  tables={len(tables)}  fields={nfields}  relations={len(links)}")
    print(f"  -> {sql_path}")
    print(f"  -> {er_path}")
    for t in tables:
        pk = ",".join(t["pk"]) or "(none)"
        print(f"    {t['name']}: {len(t['fields'])} fields  pk={pk}")


if __name__ == "__main__":
    main()
