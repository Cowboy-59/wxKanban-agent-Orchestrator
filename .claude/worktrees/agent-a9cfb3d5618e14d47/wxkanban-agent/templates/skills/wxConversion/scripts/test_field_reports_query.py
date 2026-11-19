"""
Field-reported defects in the query, procedure and redaction stages, one test per defect, named by
its wxKanban feedback reference.

Fixtures are built from the SHAPE each report describes, with placeholder names and values - never
a customer's identifiers or credentials. The real corpora catch regressions; these catch the
specific defect coming back.

Run directly: `python test_field_reports_query.py` (exit 0 = pass), or under pytest.
"""

import importlib.util
import os
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


QUERIES = _load("pcsoft-queries-to-scope.py", "queries_mod_q")
PROCS = _load("pcsoft-procs-to-scope.py", "procs_mod_q")
import wxconv_redact as rd  # noqa: E402


# ------------------------------------------------------------------------------ query fixtures

def _qry(name, items):
    """A .qry.md in the export's own layout: General information, Image, Additional information."""
    return "\n".join(
        ["# %s" % name, "", "## General information", "", name, "General information", name,
         "Query type", "Select query", name, "Information on the result", "Result items",
         "Origin", "Type", "Simple* \u00b9", "Calculated* \u00b9", "Aggregate* \u00b9", "Sort"]
        + list(items)
        + ["\u00b9", "Simple* : Simple item", "Calculated* : Calculated item",
           "Aggregate* : Aggregate item", "Query parameters", "Test* \u00b9", "Test value", "pID",
           "\u00b9", "Test* : This parameter is used in query test", "Advanced settings",
           "Display duplicates", "<Yes>", "", "", "## Image", "", name, "Image", "", "",
           "## Additional information", "", name, "Additional information",
           "Selection conditions", "Parameter used", "AlbumID  is equal to pID", "pID", ""]) + "\n"


def _run_queries(queries):
    """Run Stage 4 over {name: [result-item lines]}; return (completed process, scope markdown)."""
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pre-convert"), os.path.join(tmp, "scopes")
        os.makedirs(src)
        for name, items in queries.items():
            with open(os.path.join(src, name + ".qry.md"), "w", encoding="utf-8") as fh:
                fh.write(_qry(name, items))
        r = subprocess.run([sys.executable, os.path.join(HERE, "pcsoft-queries-to-scope.py"),
                            "--src", src, "--out", out],
                           capture_output=True, text=True, encoding="utf-8",
                           env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))
        path = os.path.join(out, "QRY-queries-scope.md")
        md = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
    return r, md


def _section(md, name):
    """The per-query section of the scope, so an assertion cannot be satisfied by another query."""
    start = md.index("## %s\n" % name)
    end = md.find("\n---\n", start)
    return md[start:end if end != -1 else len(md)]


# ------------------------------------------------------------------- queries: 270ff1c4, 899bdd0b

def test_270ff1c4_result_item_named_image_is_not_the_image_section():
    """A first item named 'Image' closed the block as if it were the Image section: 0 of 5 read."""
    r, md = _run_queries({"QRY_Album_Pictures": [
        "Image", "Picture.Image ", "Binary Memo",
        "AlbumID", "Picture.AlbumID ", "8-byte integer",
        "Cover", "Picture.Cover ", "Boolean", "1",
        "ID", "Picture.ID ", "Automatic identifier (8 bytes)",
        "OwnerID", "Album.OwnerID ", "8-byte integer"]})
    sec = _section(md, "QRY_Album_Pictures")
    for alias, origin in (("Image", "Picture.Image"), ("AlbumID", "Picture.AlbumID"),
                          ("Cover", "Picture.Cover"), ("ID", "Picture.ID"),
                          ("OwnerID", "Album.OwnerID")):
        assert "- `%s` \u2190 `%s`" % (alias, origin) in sec, (alias, sec)
    assert "ZERO result columns" not in r.stderr, r.stderr


def test_270ff1c4_item_named_image_mid_table_keeps_the_items_after_it():
    """The same collision mid-table lost every later item with NO warning (2 of 4 read)."""
    r, md = _run_queries({"QRY_Album_Cover": [
        "ID", "Picture.ID ", "Automatic identifier (8 bytes)",
        "Cover", "Picture.Cover ", "Boolean",
        "Image", "Picture.Image ", "Binary Memo",
        "AlbumID", "Picture.AlbumID ", "8-byte integer"]})
    sec = _section(md, "QRY_Album_Cover")
    assert "- `Image` \u2190 `Picture.Image`" in sec, sec
    assert "- `AlbumID` \u2190 `Picture.AlbumID`" in sec, sec


def test_899bdd0b_aggregate_items_are_result_columns():
    """'number of T.C' / 'sum of T.C' items were dropped; a count-only query read as empty."""
    r, md = _run_queries({
        "QRY_CountThings": ["NbThings", "number of Thing.ThingID not 'Null' ",
                            "Unsigned 8-byte integer"],
        "QRY_Totals": ["OrderID", "OrderLine.OrderID ", "8-byte integer",
                       "TotalQty", "sum of OrderLine.Quantity ", "8-byte real"]})
    count = _section(md, "QRY_CountThings")
    assert "`NbThings` \u2190 aggregate: `number of Thing.ThingID not 'Null'`" in count, count
    assert "COUNT(Thing.ThingID) AS NbThings" in count, count
    assert "**Tables:** Thing" in count, count
    totals = _section(md, "QRY_Totals")
    assert "SUM(OrderLine.Quantity) AS TotalQty" in totals, totals
    assert "GROUP BY OrderLine.OrderID" in totals, totals
    assert "ZERO result columns" not in r.stderr, r.stderr


def test_899bdd0b_calculated_item_without_expression_is_marked_not_dropped():
    """An export prints a calculated item's name and type only; the column vanished silently."""
    r, md = _run_queries({"QRY_WorkLog": [
        "LogID", "WorkLog.LogID ", "Automatic identifier (8 bytes)",
        "Expr1", "String",
        "SiteName", "Site.SiteName ", "String"]})
    sec = _section(md, "QRY_WorkLog")
    assert "`Expr1` \u2190 calculated \u2014 **expression NOT in the export**" in sec, sec
    assert "- `SiteName` \u2190 `Site.SiteName`" in sec, sec
    assert "**Tables:** WorkLog, Site" in sec, sec
    assert "QRY_WorkLog.Expr1" in r.stderr, r.stderr


def test_899bdd0b_printed_expression_lines_are_not_result_columns():
    """A CASE expression's 'Table.Col' line became a column named after the WHEN clause above it."""
    r, md = _run_queries({"QRY_Prices": [
        "Price", "Item.Price ", "Currency",
        "BestPrice", "CASE", "WHEN Promo.Price is Null THEN ", "Item.Price",
        "ELSE ", "LEAST(Item.Price,Promo.Price)", "END", "Currency"]})
    sec = _section(md, "QRY_Prices")
    assert "WHEN Promo.Price is Null THEN` \u2190" not in sec, sec
    assert ("`BestPrice` \u2190 calculated: `CASE WHEN Promo.Price is Null THEN Item.Price ELSE "
            "LEAST(Item.Price,Promo.Price) END`") in sec, sec


def test_899bdd0b_wrapped_aggregate_is_not_named_after_its_function():
    """'number of' wraps onto its own line; it was paired with the reference as a column."""
    r, md = _run_queries({"QRY_Lines": [
        "HeaderID", "Line.HeaderID ", "8-byte integer",
        "TotalLines", "number of ", "Line.LineID ", "not 'Null' ", "Unsigned 8-byte integer",
        "Count_1", "number of ", "Line.VeryLongLineIdentifierNa", "me not 'Null' ",
        "Unsigned 8-byte integer"]})
    sec = _section(md, "QRY_Lines")
    assert "`number of` \u2190" not in sec, sec
    assert "`TotalLines` \u2190 aggregate: `number of Line.LineID not 'Null'`" in sec, sec
    assert "COUNT(Line.VeryLongLineIdentifierName) AS Count_1" in sec, sec


def test_899bdd0b_wrapped_name_and_origin_are_rejoined():
    """A long name wraps in both columns; the column was named after its last fragment ('nID')."""
    r, md = _run_queries({"QRY_Allocations": [
        "ShipmentRequestAllocatio", "nID", "ShipmentRequestAllocation.ShipmentRequestAllo",
        "cationID ", "Automatic identifier (8 bytes)",
        "Status", "ShipmentRequestAllocation.Status ", "String"]})
    sec = _section(md, "QRY_Allocations")
    assert ("- `ShipmentRequestAllocationID` \u2190 "
            "`ShipmentRequestAllocation.ShipmentRequestAllocationID`") in sec, sec
    assert "`nID`" not in sec, sec


# --------------------------------------------------------------------- procedures: 11207b9f, b9942029

def _procs(text):
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "SET_Tools.proc.md")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(text)
        return dict(PROCS.parse(p)["procs"])


def test_11207b9f_documentation_heading_does_not_replace_the_signature():
    """'Global procedure X (server)' precedes the declaration; X was documented as X(server)."""
    procs = _procs("Global procedure ReadSetting (server)\n// Summary: reads a parameter\n"
                   "PROCEDURE ReadSetting( LOCAL sName is string, LOCAL bSub is boolean = True)\n"
                   "RESULT sName\n")
    assert procs == {"ReadSetting": "LOCAL sName is string, LOCAL bSub is boolean = True"}, procs


def test_b9942029_declaration_modifiers_do_not_hide_the_procedure():
    """PRIVATE / RESTRICTED / RESTREINT / PUBLIC / VIRTUAL after the keyword hid the declaration."""
    procs = _procs("PROCEDURE PRIVATE _InitCache()\n"
                   "procedure restricted MakeId(nUserID is 8-byte int)\n"
                   "PROCEDURE RESTREINT _Hash( LOCAL s is string ) : string\n"
                   "PROCEDURE PUBLIC pTotal()\n"
                   "PROCEDURE VIRTUAL Refresh(argCode)\n"
                   "PROCEDURE Public()\n")
    assert procs == {"_InitCache": "", "MakeId": "nUserID is 8-byte int",
                     "_Hash": "LOCAL s is string", "pTotal": "", "Refresh": "argCode",
                     "Public": ""}, procs


def test_11207b9f_heading_only_procedure_is_not_given_a_fake_signature():
    """With no declaration in the export, '(server)' is where it runs, not what it takes."""
    procs = _procs("Global procedure Orphan (server)\n// no code exported\n")
    assert list(procs) == ["Orphan"] and procs["Orphan"] != "server", procs
    assert procs["Orphan"] == PROCS.UNKNOWN_SIG, procs


# ------------------------------------------------------------------------- redaction: c0d7cfa6

P1, P2, P3 = "PLACEHOLDER-VALUE-ONE", "PLACEHOLDER-VALUE-TWO", "PLACEHOLDER-VALUE-THREE"


def _red(text):
    state = rd.RedactionState()
    out, found = rd.redact(text, state)
    return out, found


def test_c0d7cfa6_wlanguage_declaration_with_an_initial_value():
    for text in ('sPassword is string = "%s"' % P1,
                 'sPassword is a string = "%s"' % P1,
                 'sMotDePasse est une cha\u00eene = "%s"' % P1,
                 'sToken is ANSI string = "%s"' % P1):
        out, found = _red(text)
        assert P1 not in out and len(found) == 1, text


def test_c0d7cfa6_spanish_and_french_keywords():
    for text in ('sClave is string = "%s"' % P1, 'sClave = "%s"' % P1, '//sClave = "%s"' % P1,
                 'sContrase\u00f1a = "%s"' % P1, 'sMotDePasse = "%s"' % P1):
        out, _ = _red(text)
        assert P1 not in out, text
    # Spanish code names a record's lookup key "Clave..."; only a name ENDING in the key matches.
    out, found = _red('ClaveCliente = "C001"')
    assert found == [] and out == 'ClaveCliente = "C001"'


def test_c0d7cfa6_hfsql_file_password_passed_as_a_literal():
    out, found = _red('HPass(CUSTOMER, "%s")' % P1)
    assert out == 'HPass(CUSTOMER, "[[CRED-01]]")', out
    out, found = _red('HDeclareExternal("C:\\data\\cust.fic", "CUST2", "%s")' % P1)
    assert P1 not in out and '"C:\\data\\cust.fic"' in out and '"CUST2"' in out, out


def test_c0d7cfa6_acronym_prefixed_credential_names():
    for text in ('SMTPPassword = "%s"' % P1, 'DBPassword is string = "%s"' % P1,
                 'APIToken = "%s"' % P1, 'cfg.FTPUserID= "%s"' % P1):
        out, _ = _red(text)
        assert P1 not in out, text
    for text in ('sGUID = "abc"', 'UUID = "abc"', 'PUID = "abc"'):
        out, found = _red(text)
        assert found == [], text


def test_c0d7cfa6_commented_out_values_are_redacted():
    out, found = _red('ApiToken is string   //= "%s"' % P1)
    assert P1 not in out and len(found) == 1, out
    out, found = _red('XYPassword is string = "%s" //= "%s"' % (P2, P3))
    assert P2 not in out and P3 not in out and len(found) == 2, out


def test_c0d7cfa6_query_text_with_run_time_placeholders_is_left_intact():
    """A filter comparing against '[%sPwd%]' was redacted whole as a 'connection string'."""
    text = 'sFilter is string = "Login = \'[%sLogin%]\' AND PassWord = \'[%sPwd%]\'"'
    out, found = _red(text)
    assert out == text and found == [], (out, found)
    out, found = _red('sMsg = StringBuild("user = %1", sName)')
    assert found == [], found
    # A real connection string is still redacted whole.
    out, found = _red('cnx = "Server=db;UID=%s;PWD=%s;"' % (P1, P2))
    assert P1 not in out and P2 not in out and found[0].key == "connection string", out


def test_c0d7cfa6_ledger_counts_findings_per_key():
    state = rd.RedactionState()
    rd.redact('password = "%s"\nuser = "%s"\npwd = "%s"' % (P1, P2, P3), state, source="a.md")
    out = rd.render_sidecar(state)
    assert "| Key | Found |" in out, out
    assert "| password | 1 |" in out and "| user | 1 |" in out and "| pwd | 1 |" in out, out
    assert P1 not in out and P2 not in out and P3 not in out


# ------------------------------------------------------------------------- redaction: 0a922271

def test_0a922271_mermaid_relationship_label_is_not_a_credential():
    """`tUserRole ||--o{ tUser : "RoleCode"` read as the key 'user' and lost its FK label."""
    text = 'erDiagram\n    tUserRole ||--o{ tUser : "RoleCode"\n    tUser }o..|| tPass : "PassID"\n'
    out, found = _red(text)
    assert out == text and found == [], (out, found)
    out, found = _red('password = "%s"' % P1)
    assert P1 not in out


# ------------------------------------------------------------------------- redaction: f6df3914

def _page_run(out_dir, upstream, page, text):
    """One Stage-2 run, as pcsoft-page-to-react.py main() makes it: resume, write, write ledger."""
    ledger = os.path.join(out_dir, rd.SIDECAR_NAME)
    state = rd.RedactionState.resume(ledger, upstream)
    rd.write_text(os.path.join(out_dir, page + ".tsx"), text, state)
    if rd.ledger_changed(state):
        rd.write_text(ledger, rd.render_sidecar(state), state)
    return state


def test_f6df3914_per_page_runs_accumulate_one_ledger():
    """Three pages redacted 1, 3 and 1 literals; the ledger listed only the last page's one."""
    with tempfile.TemporaryDirectory() as tmp:
        up = os.path.join(tmp, "pre-convert", rd.SIDECAR_NAME)
        _page_run(tmp, up, "PAGE_Home", 'pwd = "%s"\n' % P1)
        _page_run(tmp, up, "PAGE_SignIn", 'user = "a1"\npassword = "a2"\ntoken = "a3"\n')
        _page_run(tmp, up, "PAGE_Help", 'secret = "%s"\n' % P2)
        ledger = open(os.path.join(tmp, rd.SIDECAR_NAME), encoding="utf-8").read()
        rows = rd._read_ledger_rows(os.path.join(tmp, rd.SIDECAR_NAME))
        assert [r[2] for r in rows] == ["PAGE_Home.tsx"] + ["PAGE_SignIn.tsx"] * 3 \
            + ["PAGE_Help.tsx"], rows
        assert "**5 credential literal(s) across 3 file(s)" in ledger, ledger
        tokens = [r[0] for r in rows]
        assert len(set(tokens)) == 5, tokens
        assert P1 not in ledger and P2 not in ledger


def test_f6df3914_rerunning_a_page_replaces_its_rows():
    with tempfile.TemporaryDirectory() as tmp:
        up = os.path.join(tmp, "none", rd.SIDECAR_NAME)
        _page_run(tmp, up, "PAGE_Home", 'pwd = "%s"\n' % P1)
        _page_run(tmp, up, "PAGE_SignIn", 'pwd = "%s"\n' % P2)
        _page_run(tmp, up, "PAGE_Home", 'x = 1\npwd = "%s"\n' % P1)
        rows = rd._read_ledger_rows(os.path.join(tmp, rd.SIDECAR_NAME))
        assert sorted((r[2], r[3]) for r in rows) == [("PAGE_Home.tsx", 2), ("PAGE_SignIn.tsx", 1)], rows
        # Nothing found on a re-run still clears that page's stale rows.
        _page_run(tmp, up, "PAGE_Home", "x = 1\n")
        rows = rd._read_ledger_rows(os.path.join(tmp, rd.SIDECAR_NAME))
        assert [r[2] for r in rows] == ["PAGE_SignIn.tsx"], rows


def test_f6df3914_a_new_value_never_reuses_an_upstream_token_number():
    """Each run restarted at CRED-01, so one file could hold two different [[CRED-01]]s."""
    with tempfile.TemporaryDirectory() as tmp:
        up_dir = os.path.join(tmp, "pre-convert")
        os.makedirs(up_dir)
        with open(os.path.join(up_dir, rd.SIDECAR_NAME), "w", encoding="utf-8") as fh:
            fh.write("| Token | Key | File | Line |\n|---|---|---|---|\n"
                     "| `[[CRED-05]]` | password | `X.page.md` | 3 |\n")
        state = _page_run(tmp, os.path.join(up_dir, rd.SIDECAR_NAME), "PAGE_A",
                          'a = "[[CRED-02]]"\npwd = "%s"\n' % P1)
        assert [f.token for f in state.findings] == ["[[CRED-06]]"], state.findings
    # Without a ledger, tokens already in the text are still never reused.
    state = rd.RedactionState()
    out, _ = rd.redact('a = "[[CRED-03]]"\npwd = "%s"\n' % P1, state)
    assert '"[[CRED-04]]"' in out, out


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = []
    for t in tests:
        try:
            t()
            print("PASS %s" % t.__name__)
        except AssertionError as err:
            failures.append(t.__name__)
            # ASCII only: the assertion text quotes generated Markdown (arrows, dashes) and the
            # Windows console's cp1252 cannot print it - the report must not crash the harness.
            print(("FAIL %s: %s" % (t.__name__, err)).encode("ascii", "backslashreplace").decode())
        except Exception as err:  # noqa: BLE001 - a crash is a failure, reported the same way
            failures.append(t.__name__)
            print(("ERROR %s: %s: %s" % (t.__name__, type(err).__name__, err))
                  .encode("ascii", "backslashreplace").decode())
    print("\n%d/%d passed" % (len(tests) - len(failures), len(tests)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
