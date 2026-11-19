"""
Stage 3 (pcsoft-schema-to-sql.py) field-report tests, one per defect, named by its wxKanban
feedback reference - plus `test_runningheader_*`, a defect found on a real export with no report
filed against it. Each failed against the v1.7.67 script and passes with the fix.

Fixtures are synthetic and shaped like real splitter output: one line per PDF text run, one
'## <subsection>' heading per source page. No customer names.

Run directly: `python test_field_reports_schema.py` (exit 0 = pass), or under pytest.
"""

import importlib.util
import os
import sqlite3
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def _load(filename, modname):
    spec = importlib.util.spec_from_file_location(modname, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SCHEMA = _load("pcsoft-schema-to-sql.py", "schema_mod_fr")

_HEADER = ["Caption", "Type", "Size", "Unique Key", "Key with Duplicates", "Direction",
           "GDPR", "Default value"]
_DICT_HEADER = ["Item", "Type", "Size", "Unique Key", "Key with Duplicates", "Used by..."]


def _table_md(name, pages, running_header=None):
    """A .table.md as the splitter writes it. `running_header` is printed at the top of every
    continuation page, between the page's '## ' heading and its reprinted column headers."""
    out = ["# %s" % name, "", "_Type: table  |  Source: PDF pages 10-12_", ""]
    for n, body in enumerate(pages):
        out += ["## Data files and items", ""]
        if n == 0:
            out.append("%s data file items" % name)
        elif running_header:
            out.append(running_header)
        out += _HEADER + body + [""]
    return "\n".join(out) + "\n"


def _write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def _parse(name, pages, running_header=None):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "%s.table.md" % name)
        _write(path, _table_md(name, pages, running_header))
        return SCHEMA.parse_table(path)[1]


def _run_stage3(src, out, dialect="postgres"):
    return subprocess.run([sys.executable, os.path.join(HERE, "pcsoft-schema-to-sql.py"),
                           "--dialect", dialect, "--src", src, "--out", out],
                          capture_output=True, text=True, encoding="utf-8",
                          env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8"))


def _f(name, hfsql, key, size=None, default=None, caption=""):
    return dict(name=name, caption=caption, hfsql=hfsql, key=key,
                size=size, default=default, components=None)


# ------------------------------------------------------------- running page header (no report)

_PAGE_1 = ["OrderID", "OrderID", "Automatic identifier (8 ", "bytes)",
           "Customer", "Customer", "String", "40"]
_PAGE_2 = ["Total", "Total", "Currency",
           "Shipped", "Shipped", "Date"]
_PAGE_3 = ["Weight", "Weight", "4-byte integer"]


def test_runningheader_page_header_is_not_read_as_a_field():
    """
    A line printed at the top of every page sits between the page heading and the reprinted
    column headers. It was read as an item name: it took the next field's caption and type, and
    that field vanished - 799 columns on one real export.
    """
    names = [f["name"] for f in _parse("Orders", [_PAGE_1, _PAGE_2, _PAGE_3], "ACME")]
    assert names == ["OrderID", "Customer", "Total", "Shipped", "Weight"], names
    # an export without a running header is untouched
    names = [f["name"] for f in _parse("Orders", [_PAGE_1, _PAGE_2, _PAGE_3])]
    assert names == ["OrderID", "Customer", "Total", "Shipped", "Weight"], names


def test_runningheader_dictionary_page_header_is_not_an_item():
    """In the Item dictionary the same line became the owner of the page's first item."""
    lines = ["# Analysis", "",
             "## Item dictionary (p80)", "", "ACME"] + _DICT_HEADER + [
             "OrderID", "Automatic identifier", "Orders",
             "## Item dictionary (p81)", "", "ACME"] + _DICT_HEADER + [
             "Total", "Currency", "Orders"]
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "_schema.md")
        _write(path, "\n".join(lines) + "\n")
        items, _ = SCHEMA._parse_item_dictionary_full(path, {"Orders"})
    assert items == {"OrderID": {"orders"}, "Total": {"orders"}}, items


def test_runningheader_stage3_ddl_executes():
    """End to end: one header column per continuation page made the CREATE TABLE fail."""
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pc"), os.path.join(tmp, "db")
        os.makedirs(src)
        _write(os.path.join(src, "Orders.table.md"),
               _table_md("Orders", [_PAGE_1, _PAGE_2, _PAGE_3], "ACME"))
        r = _run_stage3(src, out, "sqlite")
        assert r.returncode == 0, r.stdout + r.stderr
        ddl = open(os.path.join(out, "schema.sqlite.sql"), encoding="utf-8").read()
    assert "ACME" not in ddl, ddl
    db = sqlite3.connect(":memory:")
    db.executescript(ddl)
    cols = [row[1] for row in db.execute("PRAGMA table_info(Orders)")]
    assert cols == ["OrderID", "Customer", "Total", "Shipped", "Weight"], cols


# -------------------------------------------------------------------------------- 1854bd85

def test_1854bd85_duplicate_column_is_commented_and_the_table_still_creates():
    """Two columns of one name failed the WHOLE CREATE TABLE, every index and FK on it too."""
    tables = [("Policy", [_f("PolicyID", "Automatic identifier", "identifier"),
                          _f("NoticeSentDat", "Date", "date", caption="Notice sent date"),
                          _f("NoticeSentDat", "String", "varchar", 50, caption="Notice sent by")])]
    for dialect in ("postgres", "mssql", "mysql", "firebird", "sqlite"):
        ddl = SCHEMA.emit_ddl(tables, [], dialect)
        create = ddl[ddl.index("CREATE TABLE Policy"):]
        create = create[:create.index(");")]
        assert create.count("NoticeSentDat") == 1, (dialect, create)
        assert "-- DUPLICATE: Policy.NoticeSentDat appears twice" in ddl, (dialect, ddl)
    sqlite3.connect(":memory:").executescript(SCHEMA.emit_ddl(tables, [], "sqlite"))


def test_1854bd85_fk_on_a_column_its_table_lacks_is_not_declared():
    """One FK was emitted on a garbled column name, and the statement failed when run."""
    tables = [("Product", [_f("ProductID", "Automatic identifier", "identifier")]),
              ("OrdLine", [_f("OrdLineID", "Automatic identifier", "identifier"),
                           _f("ProductID", "8-byte integer", "int8")])]
    links = [("Product", "ProductID", "OrdLine", "ProductIdent")]
    ddl = SCHEMA.emit_ddl(tables, links, "postgres")
    assert "ALTER TABLE" not in ddl, ddl
    assert ("-- REVIEW: foreign key OrdLine.ProductIdent -> Product(ProductID) NOT declared: "
            "OrdLine has no column ProductIdent") in ddl, ddl


def test_1854bd85_numeric_precision_is_flagged():
    """The export prints no Numeric precision; (21,18) GPS columns became (18,4) without a word."""
    with_num = [("Site", [_f("SiteID", "Automatic identifier", "identifier"),
                          _f("Latitude", "Numeric", "numeric"),
                          _f("Longitude", "Numeric", "numeric")])]
    ddl = SCHEMA.emit_ddl(with_num, [], "postgres")
    assert "ALSO REVIEW: numeric precision" in ddl, ddl
    assert "all 2 such column(s) below are NUMERIC(18,4)" in ddl, ddl
    assert "below are DECIMAL(18,4)" in SCHEMA.emit_ddl(with_num, [], "mssql")
    # no Numeric column, no note: an export it does not apply to is unchanged
    plain = [("Site", [_f("SiteID", "Automatic identifier", "identifier"),
                       _f("Price", "Currency", "money")])]
    assert "numeric precision" not in SCHEMA.emit_ddl(plain, [], "postgres")


def test_1854bd85_migration_note_carries_the_load_gotchas():
    note = SCHEMA.MIGRATION_NOTE
    for phrase in ("trailing spaces", "no parent", "NOT VALID", "VALIDATE CONSTRAINT",
                   "NOT NULL", "empty time"):
        assert phrase in note, phrase


# -------------------------------------------------------------------------------- ee8dc32e

def test_ee8dc32e_fk_to_a_non_key_parent_column_is_not_declared_on_any_dialect():
    """
    'there is no unique constraint matching given keys for referenced table': the one error left
    in the report's DDL. SQLite already held such a link back; every other target failed it.
    """
    tables = [("Product", [_f("ProductID", "Automatic identifier", "identifier"),
                           _f("Reference", "String", "varchar", 20)]),
              ("OrdLine", [_f("OrdLineID", "Automatic identifier", "identifier"),
                           _f("ProductID", "8-byte integer", "int8"),
                           _f("Reference", "String", "varchar", 20)])]
    links = [("Product", "ProductID", "OrdLine", "ProductID"),
             ("Product", "Reference", "OrdLine", "Reference")]
    for dialect in ("postgres", "mssql", "mysql", "firebird"):
        ddl = SCHEMA.emit_ddl(tables, links, dialect)
        assert "REFERENCES Product (ProductID);" in ddl, (dialect, ddl)
        assert "REFERENCES Product (Reference)" not in ddl, (dialect, ddl)
        assert ("-- REVIEW: foreign key OrdLine.Reference -> Product(Reference) NOT declared: "
                "Product.Reference is not its primary key") in ddl, (dialect, ddl)


# -------------------------------------------------------------------------------- 0a922271

def test_0a922271_composite_key_named_with_hash_is_kept():
    """'#'-joined composite-key names failed the identifier rule: 48 keys dropped, no warning."""
    body = ["OrderID", "OrderID", "Automatic identifier",
            "LineNo", "LineNo", "4-byte integer",
            "Rev", "Rev", "4-byte integer",
            "OrderID#LineNo#R", "OrderID + LineNo + Rev", "Composite key: ",
            "OrderID+LineNo+Rev", "12",
            "Legacy#Code",                      # '#' line that is NOT a composite key: a stray
            "Status", "Status", "String", "10"]
    fields = _parse("OrdLine", [body])
    names = [f["name"] for f in fields]
    assert names == ["OrderID", "LineNo", "Rev", "OrderID#LineNo#R", "Status"], names
    key = fields[3]
    assert (key["key"], key["components"]) == ("composite", "OrderID+LineNo+Rev"), key
    ddl = SCHEMA.emit_ddl([("OrdLine", fields)], [], "postgres")
    assert "ON OrdLine (OrderID, LineNo, Rev);" in ddl, ddl


# -------------------------------------------------------------------------------- a075d21f

def test_a075d21f_collapsed_cut_names_are_separated_by_caption_tail():
    """
    Two rows cut to one printed name were reported with candidates in length order, which is
    not source order - applied by position they swap columns. The row caption ends with exactly
    one candidate's missing tail, which is what separates them.
    """
    body = ["ShipmentID", "ShipmentID", "Automatic identifier",
            "DeliveryNotificationR", "Delivery notification received date", "Date",
            "DeliveryNotificationR", "Delivery notification recipient", "String", "50"]
    rows = ["ShipmentID", "Automatic identifier", "Shipment",
            "DeliveryNotificationRecipient", "String", "50", "Shipment",
            "DeliveryNotificationReceivedDate", "Date", "Shipment",
            # the dictionary's own longest entry sets its column width; the candidates sit well
            # inside it, so neither is suspected of being cut by the dictionary too
            "WarehouseConsolidationReferenceTextLong", "String", "80", "Shipment"]
    with tempfile.TemporaryDirectory() as tmp:
        _write(os.path.join(tmp, "Shipment.table.md"), _table_md("Shipment", [body]))
        _write(os.path.join(tmp, "_schema.md"), "\n".join(
            ["# Analysis", "", "## Item dictionary (p80)", ""] + _DICT_HEADER + rows) + "\n")
        tables = [SCHEMA.parse_table(os.path.join(tmp, "Shipment.table.md"))]
        applied, unresolved = SCHEMA.recover_truncated_names(tables, tmp)
    got = [(f["name"], f["key"]) for f in tables[0][1]]
    assert got == [("ShipmentID", "identifier"), ("DeliveryNotificationReceivedDate", "date"),
                   ("DeliveryNotificationRecipient", "varchar")], (got, unresolved)
    assert not unresolved, unresolved
    # Too little evidence stays unresolved: a tail of 'I' / 'ID' ends captions by chance.
    assert SCHEMA._pick_by_caption_tail("HeaderI", "Header ID", ["HeaderID", "HeaderIX"]) is None
    # ...and so does a caption that matches more than one tail, or none.
    assert SCHEMA._pick_by_caption_tail("Abc", "abc x date", ["AbcDate", "AbcXDate"]) is None
    assert SCHEMA._pick_by_caption_tail("Abc", "something else", ["AbcDate", "AbcTime"]) is None


def test_a075d21f_report_warns_candidates_are_not_in_source_order():
    md = SCHEMA.render_truncation_report(
        [], [("T", "AbcDe", ["AbcDeFg", "AbcDeHij"], "several dictionary items extend this name")])
    assert "NOT in the order the rows appear in the source" in md, md


# -------------------------------------------------------------------------------- a31aac60

def test_a31aac60_keyword_column_is_not_made_case_sensitive():
    """
    'Status', 'Size', 'Type', 'value' were quoted in their printed case. On PostgreSQL that made
    each the one case-sensitive column in its table - the report counted 53 of them as dropped.
    Quoted for safety, they must still fold like the bare names beside them.
    """
    tables = [("Contacts", [_f("ContactID", "Automatic identifier", "identifier"),
                            _f("Status", "String", "varchar", 10),
                            _f("State Abrv", "Unicode string", "uvarchar", 2)])]
    pg = SCHEMA.emit_ddl(tables, [], "postgres")
    assert '"status" VARCHAR(10)' in pg and '"Status"' not in pg, pg
    assert '"State Abrv"' in pg, "a name that cannot be bare keeps its case"
    assert '"STATUS" VARCHAR(10)' in SCHEMA.emit_ddl(tables, [], "firebird")
    assert "[Status] NVARCHAR(10)" in SCHEMA.emit_ddl(tables, [], "mssql")


# -------------------------------------------------------------------------------- 4d285663

def test_4d285663_unknown_type_that_swallows_the_next_field_is_reported():
    """
    An unknown one-word type followed by a record whose caption repeats its name: the type search
    ran on into that record, so its column vanished and its type went to this one - silently,
    unless another occurrence of the same type happened to fit a shape the gate knew.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "Member.table.md")
        _write(path, _table_md("Member", [["MemberID", "MemberID", "Automatic identifier",
                                           "Initial", "Initial", "Character",
                                           "Surname", "Surname", "Unicode string", "40"]]))
        unmapped = []
        SCHEMA.parse_table(path, unmapped)
    assert [(u["type"], u["field"]) for u in unmapped] == [("Character", "Initial")], unmapped


# -------------------------------------------------------------------------------- b9942029

def test_b9942029_default_survives_an_item_named_and_captioned_after_a_type():
    """Item 'DateTime' captioned 'DateTime': the field BEFORE it lost its default."""
    fields = _parse("Log", [["Qty", "Qty", "4-byte integer", "0",
                             "DateTime", "DateTime", "Date and Time", "(yyyymmddhhmmssccc)",
                             "Note", "Note", "String", "30"]])
    got = [(f["name"], f["key"], f["default"]) for f in fields]
    assert got == [("Qty", "int4", "0"), ("DateTime", "datetime", None),
                   ("Note", "varchar", None)], got


# -------------------------------------------------------------------------------- d4e8ec3f

def test_d4e8ec3f_a_long_shortfall_is_listed_in_full():
    """The console names 25 unmatched items; past that the rest were simply cut off."""
    rows = ["IDClient", "Automatic identifier", "Client", "Name", "String", "40", "Client"]
    lost = ["Extra%02d" % n for n in range(30)]
    for item in lost:
        rows += [item, "String", "10", "Client"]
    general = ["## General information", "Generation #", "Number of data files", "Nb items",
               "Nb links", "Nb connections", "Nb groups", "1", "1", str(len(lost) + 2),
               "0", "0", "0"]
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pc"), os.path.join(tmp, "db")
        os.makedirs(src)
        _write(os.path.join(src, "Client.table.md"), _table_md("Client", [[
            "IDClient", "IDClient", "Automatic identifier", "Name", "Name", "String", "40"]]))
        _write(os.path.join(src, "_schema.md"), "\n".join(
            ["# Analysis", "", "## Item dictionary (p80)", ""] + _DICT_HEADER + rows + general)
            + "\n")
        r = _run_stage3(src, out)
        assert r.returncode == 0, r.stdout + r.stderr
        path = os.path.join(out, "unmatched-items.md")
        assert os.path.exists(path), r.stdout
        listing = open(path, encoding="utf-8").read()
    assert "all 30 are listed in" in r.stdout, r.stdout
    assert all("| %s | Client |" % item in listing for item in lost), listing


# -------------------------------------------------------------------------------- 6ff76692

def test_6ff76692_links_shortfall_is_reported_and_names_unsplit_tables():
    """
    A Links section read as zero relationships printed 'links=0' and nothing else: a schema with
    every table and no foreign key looks plausible, so it went unnoticed.
    """
    general = ["## General information (p3)", "", "Generation #", "Number of data", "files",
               "Nb items", "Nb links", "Nb connections", "Nb groups",
               "1", "3", "4", "3", "0", "0"]
    links = ["## Links (p9)", "",
             "Data file", "Customer", "Invoice", "Item",
             "IDCustomer (Identifier of Customer)", "IDCustomer (Customer)",
             "Data file", "Customer", "Payment", "Item",
             "IDCustomer (Identifier of Customer)", "IDCustomer (Customer)",
             "Relation", "Invoice", "Customer", "Item",
             "IDInvoice (Identifier of Invoice)", "IDInvoice (Invoice)"]
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pc"), os.path.join(tmp, "db")
        os.makedirs(src)
        _write(os.path.join(src, "Customer.table.md"), _table_md("Customer", [[
            "IDCustomer", "IDCustomer", "Automatic identifier", "Name", "Name", "String", "40"]]))
        _write(os.path.join(src, "Invoice.table.md"), _table_md("Invoice", [[
            "IDInvoice", "IDInvoice", "Automatic identifier",
            "IDCustomer", "IDCustomer", "8-byte integer"]]))
        _write(os.path.join(src, "_schema.md"), "\n".join(["# Analysis", ""] + general + links))
        r = _run_stage3(src, out)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "!! LINKS: the analysis declares 3 link(s); this run read 1." in r.stdout, r.stdout
    assert "Customer -> Payment" in r.stdout, r.stdout
    assert "Others were not recognised in the Links section" in r.stdout, r.stdout


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = []
    for t in tests:
        try:
            t()
            print("PASS %s" % t.__name__)
        except AssertionError as err:
            failures.append(t.__name__)
            print("FAIL %s: %s" % (t.__name__, err))
        except Exception as err:  # noqa: BLE001 - a crash is a failure, reported the same way
            failures.append(t.__name__)
            print("ERROR %s: %s: %s" % (t.__name__, type(err).__name__, err))
    print("\n%d/%d passed" % (len(tests) - len(failures), len(tests)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
