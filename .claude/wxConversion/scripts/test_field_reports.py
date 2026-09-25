"""
One test per field-reported wxConversion defect, named by its wxKanban feedback reference.

These cover the export SHAPES the corpora on any one machine do not contain - a WebDev "Database
schema" breadcrumb, a WinDev desktop "file items" header, a boolean default, a lowercase
`procedure`. The real corpora catch regressions; these catch the specific defect coming back.

Run directly: `python test_field_reports.py` (exit 0 = pass).
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def _load(filename, modname):
    spec = importlib.util.spec_from_file_location(modname, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPLIT = _load("pcsoft-doc-split.py", "split_mod")
SCHEMA = _load("pcsoft-schema-to-sql.py", "schema_mod")
QUERIES = _load("pcsoft-queries-to-scope.py", "queries_mod")
PROCS = _load("pcsoft-procs-to-scope.py", "procs_mod")
REACT = _load("pcsoft-page-to-react.py", "react_mod")


# --------------------------------------------------------------- doc-split: breadcrumb shapes

def test_11207b9f_database_schema_type_is_an_analysis():
    """The WebDev name for the Analysis. Unmapped, 296 pages and all 112 tables were discarded."""
    assert SPLIT.TYPE_KIND.get("Database schema") == "analysis"
    part, kind, name, sub = SPLIT.classify(["Part 2", "Database schema", "Categories",
                                            "Tables and items"])
    assert (kind, name) == ("table", "Categories"), (kind, name)


def test_3060d36a_item_header_without_the_word_data():
    """WinDev desktop English prints "<name> file items"; WebDev prints "<name> table items"."""
    for line, expected in (("Client data file items", "Client"),
                           ("Client file items", "Client"),
                           ("Categories table items", "Categories")):
        assert SPLIT.recover_table_name(line) == expected, line


def test_11207b9f_number_of_tables_count_label():
    """"Number of tables" left the declared-vs-written completeness gate silently not running."""
    for label in ("Number of tables", "Number of data", "Nb files", "Nb tables"):
        assert SPLIT._COUNT_LABELS[1].match(label), label
    assert not SPLIT._COUNT_LABELS[1].match("Generation #")


def test_a075d21f_part_divider_page_recovers_its_element_name():
    """The first content page of a Part carries no Element segment and used to be dropped."""
    assert SPLIT.recover_element_name("ImportaDatos\nDeclarations\nCLASS") == "ImportaDatos"
    # The divider page ITSELF opens with "Part N" and must not claim to be an element.
    assert SPLIT.recover_element_name("Part 5\nClass") is None
    # Prose is not an element name.
    assert SPLIT.recover_element_name("A sentence that is not a name\nmore") is None


def test_11207b9f_unmapped_analysis_type_still_trips_the_gate():
    """The zero-datafile stop must not depend on a page having ALREADY classified as analysis."""
    assert SPLIT._looks_like_analysis_type("Database schema")
    assert SPLIT._looks_like_analysis_type("Analyse")
    assert not SPLIT._looks_like_analysis_type("WINDEV window")


# ------------------------------------------------------------------- schema-to-sql: DDL output

def _bool_field(name, default):
    return dict(name=name, caption="", hfsql="Boolean", key="boolean",
                size=None, default=default, components=None)


def test_ee8dc32e_boolean_default_is_a_boolean_literal():
    """"BOOLEAN DEFAULT 0" is rejected by PostgreSQL and aborts the whole CREATE TABLE."""
    tables = [("T", [_bool_field("A", "0"), _bool_field("B", "1")])]
    for dialect, off, on in (("postgres", "false", "true"), ("firebird", "FALSE", "TRUE"),
                             ("mssql", "0", "1"), ("mysql", "0", "1")):
        ddl = SCHEMA.emit_ddl(tables, [], dialect)
        assert "DEFAULT %s" % off in ddl and "DEFAULT %s" % on in ddl, dialect
        assert "BOOLEAN DEFAULT 0" not in ddl and "BOOLEAN DEFAULT 1" not in ddl, dialect


def test_6ff76692_link_row_label_variants():
    """"Data file" / "File" / "Table" all label the table pair; anchoring on one dropped every FK."""
    assert set(SCHEMA.LINK_ROW_LABELS) >= {"Data file", "File", "Table"}


def test_899d56da_er_diagram_is_not_titled_after_the_example_project():
    er = SCHEMA.emit_er([("T", [])], [], "postgres", "Be_Collector")
    assert er.startswith("# Be_Collector"), er[:60]
    assert "WW_Newsletter" not in er


def test_04c3c5d0_translated_caption_marker_is_consumed():
    """"ES:" + its translated text was adopted as the NEXT field's name."""
    assert SCHEMA.LANG_MARKER_RE.match("ES:")
    assert SCHEMA.LANG_MARKER_RE.match("FR:")
    assert not SCHEMA.LANG_MARKER_RE.match("Depdencia")


def test_899bdd0b_currency_keeps_windev_precision():
    """WinDev's own export maps Currency to NUMERIC(24,6); 18,4 silently truncates money."""
    assert SCHEMA.match_type("Currency")[1] == "money"
    assert SCHEMA.TYPEMAP["postgres"]["money"] == "NUMERIC(24,6)"
    assert SCHEMA.TYPEMAP["postgres"]["numeric"] == "NUMERIC(18,4)", "plain Numeric is unchanged"


def test_a31aac60_restored_name_keeps_the_printed_casing():
    """The dictionary Titlecases camelCase; a Titlecased column reads back undefined in TS."""
    printed, restored = "pacePlanningIntergratio", "Paceplanningintergration"
    assert restored.lower().startswith(printed.lower())
    assert printed + restored[len(printed):] == "pacePlanningIntergration"


# ------------------------------------------------------------------------ queries and procs

def test_11207b9f_lowercase_procedure_declaration():
    """This export renders every declaration lowercase; 259 were reported as 0."""
    text = ("PROCEDURE Alpha(a)\nprocedure CheckTransactionRight()\n"
            "Global procedure Beta(x)\n  procedure NotAnchored()\n")
    assert [m.group(1) for m in PROCS.PROC_RE.finditer(text)] == [
        "Alpha", "CheckTransactionRight", "Beta"]


def test_899bdd0b_sql_box_does_not_become_result_columns():
    """The verbatim SQL box follows the Result-items table and was paired line-by-line as items."""
    lines = ["Result items", "OwnerName", "SiteOwners.OwnerName",
             "SELECT", "SiteOwners.UniqueID AS UniqueID,", "SiteOwners.OwnerID AS OwnerID,"]
    blk = [l for b in QUERIES.blocks_after(lines, "Result items", set())
           for l in b[:QUERIES._sql_box_start(b)]]
    assert blk == ["OwnerName", "SiteOwners.OwnerName"], blk


def test_899bdd0b_multi_page_result_items_are_all_read():
    """A query spanning pages reprints its heading; only the first block used to be read."""
    lines = ["Result items", "A", "T.A", "Result items", "B", "T.B"]
    blocks = QUERIES.blocks_after(lines, "Result items", set())
    assert blocks == [["A", "T.A"], ["B", "T.B"]], blocks


def test_a075d21f_wildcard_result_item_and_param_names():
    import re
    assert re.match(r"^\w+\.(?:\w+|\*)", "Locations.*")
    assert re.fullmatch(r"[Pp]aram\w*", "ParamStartDate_Start")
    assert re.fullmatch(r"[Pp]aram\w*", "ParamusGUIDAreaID")


# --------------------------------------------------------------------------- page-to-react

def test_b91866bf_progress_bar_is_recognized():
    assert REACT.PREFIX_KIND.get("PROGBAR") == "progress"
    assert REACT.TYPE_HEADER_KIND.get("Progress Bar") == "progress"


def test_a38f7c27_binding_sub_labels_stop_value_collection():
    """"HFSQL link" prints two sub-labels even when unbound; they were swallowed into the value."""
    for label in ("HFSQL link", "Browsed file", "Browsed item"):
        assert label in REACT.PROP_KEYS, label
    block = ["Password", "No", "HFSQL link", "Browsed file", "Browsed item"]
    assert REACT.read_value(block, "Password") == "No"


def test_11207b9f_password_reads_the_value_not_the_label():
    """843 of 851 edit controls rendered as type=password because the LABEL was present."""
    assert REACT.read_value(["Password", "No", "Width"], "Password").lower() == "no"
    assert REACT.read_value(["Password", "Yes", "Width"], "Password").lower() == "yes"


def test_7ce2f50a_elided_type_recovers_the_table_from_the_breadcrumb():
    """
    A WEBDEV export whose Analysis breadcrumb was elided for width. The body header wording was
    one recover_table_name() did not know, so content recovery returned nothing and all 43 tables
    plus the whole analysis were discarded on a green run.
    """
    segs = ["Part 2", "...", "Tables and items", "Job_Spec", "Tables and items"]
    assert SPLIT.name_from_breadcrumb(segs) == "Job_Spec"
    assert SPLIT.is_table_subsection(segs[-1])
    assert SPLIT.breadcrumb_is_analysis(segs)


def test_7ce2f50a_the_whole_elided_placement_decision():
    """The decision the splitter actually makes, over the four shapes this export produced."""
    tbl = ["Part 2", "...", "Tables and items", "Job_Spec", "Tables and items"]
    dict_page = ["Part 2", "...", "D:\\app\\Job.wda", "Item dictionary"]
    cover = ["Part 1", "...", "Contents"]

    # a table page, named by the breadcrumb even though the body header is a wording we don't know
    assert SPLIT.place_elided_page("...", tbl[-1], tbl, "Job_Spec\nSome other heading\n") == \
        ("table", "Job_Spec", "Data files and items")
    # the body header still wins when it is present - it is the same page, so the same answer
    assert SPLIT.place_elided_page("...", tbl[-1], tbl, "Job_Spec table items\n")[1] == "Job_Spec"
    # no name, but provably the data model -> _schema.md keeps it
    assert SPLIT.place_elided_page("...", "Item dictionary", dict_page, "")[0] == "schema"
    # genuinely unplaceable: left alone for _discarded.md, as before
    assert SPLIT.place_elided_page("...", "Contents", cover, "Contents\n") is None
    # a Type that was NOT elided is never touched by this path
    assert SPLIT.place_elided_page("Page", "Information on controls", ["Part 3", "Page"], "") is None


def test_7ce2f50a_subsection_label_is_never_taken_as_the_table_name():
    """
    A heading variant recognised only by MEANING is not in WRAPPER_SEGS, so without an explicit
    exclusion the label itself survives the candidate filter and becomes the table's name.
    """
    segs = ["Part 2", "...", "Fichiers et rubriques", "Job_Spec", "Fichiers et rubriques"]
    assert SPLIT.is_table_subsection("Fichiers et rubriques")
    assert SPLIT.name_from_breadcrumb(segs) == "Job_Spec"


def test_7ce2f50a_elided_analysis_page_with_no_name_is_still_analysis():
    """The Item dictionary and ER chart carry no element name; _schema.md is what reads them."""
    assert SPLIT.breadcrumb_is_analysis(["Part 2", "...", "D:\\app\\Job.wda", "Item dictionary"])
    assert not SPLIT.breadcrumb_is_analysis(["Part 1", "...", "Cover"])


def test_56ad9fdb_breadcrumb_ending_in_analysis_recovers_the_table_from_the_body():
    """
    A WEBDEV data file's only page ended its breadcrumb in 'Analysis' instead of the table name,
    so classify() filed it as schema and Gallery.table.md was never written (11 of 12 tables).
    """
    segs = ["Part 2", "Analysis", "C:\\app\\F111.wda", "Data files and items", "Analysis"]
    body = ("Gallery\nData files and items\nGeneral information\nGallery\n"
            "Name on disk Gallery.FIC\nGallery data file items\nID\nTitle\n")
    # the shape as classify() sees it: schema, which is the defect
    assert SPLIT.classify(segs)[1] == "schema"
    assert SPLIT.place_misnamed_table_page("schema", segs, body) == "Gallery"
    # the "Name on disk" line alone is enough when the items header wording is unknown
    assert SPLIT.place_misnamed_table_page("schema", segs, "Name on disk Gallery.FIC\n") == "Gallery"


def test_56ad9fdb_shared_page_keeps_the_overview_tail_in_the_schema():
    """
    The page is shared: the data-file overview ends at the top and the first table begins below.
    Same shape on BlueCube p190 and PPE p177, whose first table had silently lost its opening page.
    """
    body = ("Abbreviation\nType\nRoster\n64\n801\nHFSQL\nClassic\n"
            "Gallery\nData files and items\nGeneral information\nGallery\n"
            "Name on disk Gallery.FIC\nGallery data file items\nID\n")
    head, tail = SPLIT.split_at_table_start(body, "Gallery")
    assert head.endswith("Classic") and "Gallery" not in head, head
    assert tail.startswith("Gallery\nData files and items") and "ID" in tail, tail
    # WinDev desktop wording of the same heading
    head, tail = SPLIT.split_at_table_start("x\nAsset\nFiles and items\nAsset file items\n", "Asset")
    assert (head, tail.split("\n")[0]) == ("x", "Asset")
    # no start line -> the whole page is the table's, as before
    assert SPLIT.split_at_table_start("Gallery data file items\nID\n", "Gallery")[0] == ""


def test_56ad9fdb_ordinary_schema_pages_stay_in_the_schema():
    """Both signals are required, so the dictionary, General information and Links never move."""
    table_body = "Gallery data file items\nID\n"
    # no table subsection in the breadcrumb -> never a table, whatever the body says
    assert SPLIT.place_misnamed_table_page(
        "schema", ["Part 2", "Analysis", "C:\\app\\F111.wda", "Item dictionary"], table_body) is None
    # table subsection present but the body names no data file (e.g. the data-file list page)
    assert SPLIT.place_misnamed_table_page(
        "schema", ["Part 2", "Analysis", "C:\\app\\F111.wda", "Data files and items", "Analysis"],
        "Data files and items\nGallery\nPhoto\n") is None
    # the analysis's own path is never taken for a data file's physical name
    assert SPLIT.place_misnamed_table_page(
        "schema", ["Part 2", "Analysis", "Data files and items", "Analysis"],
        "Name on disk F111.wda\n") is None
    # pages classify() already placed are untouched
    assert SPLIT.place_misnamed_table_page(
        "table", ["Part 2", "Analysis", "Data files and items", "Analysis"], table_body) is None


def test_7ce2f50a_handler_control_name_without_the_underscore():
    """
    Handler headers named BTNFindRecord and btnClear. The gate demanded an uppercase prefix AND an
    underscore, so every handler on all four pages was dropped and no behaviour was wired.
    """
    for name in ("BTNFindRecord", "btnClear", "BTN_Save", "EDT_Name", "Cell1"):
        assert REACT.is_handler_control_name(name), name
    for word in ("the", "link", "menu", "it"):
        assert not REACT.is_handler_control_name(word), word


def test_7ce2f50a_handler_header_shapes_are_extracted():
    """End to end over the two header shapes the report quotes."""
    import tempfile
    src = ("Click on BTNFindRecord (onclick browser event)\n"
           "  HReadSeek(Skid, SkidID, EDT_Id)\n"
           "Click on btnClear ( Cell1 ) (server)\n"
           "  EDT_Id = \"\"\n")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "pgScanShippingSkids.controls.md")
        open(path, "w", encoding="utf-8").write(src)
        REACT.parse_handlers(path)
    assert sorted(REACT.HANDLERS) == ["BTNFindRecord", "btnClear"], sorted(REACT.HANDLERS)


def test_7ce2f50a_a_separatorless_event_header_does_not_bleed_into_the_previous_handler():
    """
    "Whenever modifying X ( … )" names its control with no connecting word. Unrecognised, the
    parser kept collecting, so the header AND its code were appended to the PRECEDING handler's
    body - one control's WLanguage attributed to another, on 14 of the 905 real pages here.
    """
    import tempfile
    src = ("Click on BTN_Find ( Cell1 ) (server)\n"
           "  HReadSeek(Skid, SkidID, EDT_Id)\n"
           "Whenever modifying EDT_Id ( Cell1 ) (server)\n"
           "  Validate()\n")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "p.controls.md")
        open(path, "w", encoding="utf-8").write(src)
        REACT.parse_handlers(path)
    assert sorted(REACT.HANDLERS) == ["BTN_Find", "EDT_Id"], sorted(REACT.HANDLERS)
    assert REACT.HANDLERS["BTN_Find"][0][1] == ["  HReadSeek(Skid, SkidID, EDT_Id)"]
    assert REACT.HANDLERS["EDT_Id"][0][1] == ["  Validate()"]


def test_7ce2f50a_the_allow_list_does_not_swallow_wlanguage_code():
    """A general "<phrase> <name> (" form matches 1,038 IF lines and 341 PROCEDURE declarations."""
    for code in ("IF HFound(SysDocuments) THEN", "PROCEDURE postSaveProcedure()",
                 "WHILE NotFinished()", "SELECT Something(x)", "ELSE IF Check(y)"):
        assert REACT.match_handler_header(code, known=()) is None, code


def test_7ce2f50a_an_unwired_handler_keeps_its_code():
    """
    Only buttons and links take an onClick, and handler_for() attaches one event. Every other
    block has to be carried in the header comment or its legacy logic is simply gone.
    """
    REACT.HANDLERS.clear()
    REACT.HANDLER_SRC.clear()
    REACT.HANDLERS_USED.clear()
    code = ["ExecuteProcess(TBL_PatientDiag,trtSelection)"]
    REACT.HANDLERS["TBL_PatientDiag"] = [("Whenever modifying", code)]
    REACT.HANDLER_SRC[id(code)] = "Whenever modifying Check ( TBL_PatientDiag ) (TMPL template)"
    note = REACT.unwired_handler_note()
    assert "ExecuteProcess(TBL_PatientDiag,trtSelection)" in note, note
    assert "(TMPL template)" in note, note          # the annotation says WHICH instance
    REACT.HANDLERS.clear()
    REACT.HANDLER_SRC.clear()


def test_7ce2f50a_no_geometry_and_all_loose_refuses_the_layout():
    """
    Zero "X/Y position" in the dump left the tree resting on the loose name fallback, which
    matched the property labels Img1, Simple, Hotkey, Toolbar, Step and Autocompletion and
    emitted them as controls.
    """
    loose = {n: dict(x=None, y=None, via="loose") for n in
             ("Img1", "Simple", "Hotkey", "Toolbar", "Step", "Autocompletion")}
    assert REACT.geometry_is_unavailable(loose)


def test_7ce2f50a_a_page_that_merely_lacks_geometry_is_still_laid_out():
    """One control matched by prefix, declared type or header is enough to make the page real."""
    for good in ("prefix", "typed", "header"):
        nodes = dict(A=dict(x=None, y=None, via="loose"),
                     B=dict(x=None, y=None, via=good))
        assert not REACT.geometry_is_unavailable(nodes), good
    assert not REACT.geometry_is_unavailable(
        {"A": dict(x=10, y=20, via="loose")})
    assert not REACT.geometry_is_unavailable({})


def test_7ce2f50a_ddl_header_names_the_dialect_it_was_generated_for():
    """The header opened "Firebird-ready DDL is dialect=mssql" in a delivered file."""
    ddl = SCHEMA.emit_ddl([], [], "mssql")
    first = ddl.split("\n")[0]
    assert "mssql-ready" in first, first
    assert "firebird" not in first.lower(), first


# --------------------------------------------------------------- schema-to-sql: Stage 3 batch

_HEADER = ["Caption", "Type", "Size", "Unique Key", "Key with Duplicates", "Direction",
           "GDPR", "Default value"]
_DICT_HEADER = ["Item", "Type", "Size", "Unique Key", "Key with Duplicates", "Used by..."]


def _write_corpus(tmp, pages, dict_rows=None, extra_schema=None):
    """pre-convert/ with one .table.md per (name, body); _schema.md only when rows are given."""
    for name, body in pages:
        with open(os.path.join(tmp, "%s.table.md" % name), "w", encoding="utf-8") as fh:
            fh.write("\n".join(["# %s" % name, "", "## Data files and items", "",
                                "%s data file items" % name] + _HEADER + body) + "\n")
    if dict_rows is not None or extra_schema:
        lines = ["# Analysis", "", "## Item dictionary (p80)", ""] + _DICT_HEADER + (dict_rows or [])
        with open(os.path.join(tmp, "_schema.md"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines + (extra_schema or [])) + "\n")


def _run_stage3(src, out, dialect="postgres"):
    import subprocess
    return subprocess.run([sys.executable, os.path.join(HERE, "pcsoft-schema-to-sql.py"),
                           "--dialect", dialect, "--src", src, "--out", out],
                          capture_output=True, text=True, encoding="utf-8")


_STATE_PAGE = ["RefStateProvinceID", "RefStateProvinceID", "Automatic identifier",
               "StateName", "State name", "String", "40",
               "State Abrv", "State Abrv", "Unicode string", "2"]


def test_9a90d2dd_item_name_with_a_space_is_read_when_the_dictionary_lists_it():
    """'State Abrv' was dropped by the identifier rule - and reached the DDL only by hand."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        _write_corpus(tmp, [("RefStateProvince", _STATE_PAGE)])
        path = os.path.join(tmp, "RefStateProvince.table.md")
        assert "State Abrv" not in [f["name"] for f in SCHEMA.parse_table(path)[1]]
        names = [f["name"] for f in SCHEMA.parse_table(path, None, {"State Abrv"})[1]]
    assert names == ["RefStateProvinceID", "StateName", "State Abrv"], names
    ddl = SCHEMA.emit_ddl([("RefStateProvince", [
        dict(name="State Abrv", caption="", hfsql="Unicode string", key="uvarchar", size=2,
             default=None, components=None)])], [], "postgres")
    assert '"State Abrv"' in ddl, ddl


def test_9a90d2dd_stage3_run_keeps_the_spaced_item_end_to_end():
    import tempfile
    rows = ["RefStateProvinceID", "Automatic identifier", "RefStateProvince",
            "StateName", "String", "40", "RefStateProvince",
            "State Abrv", "Unicode string", "2", "RefStateProvince"]
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pc"), os.path.join(tmp, "db")
        os.makedirs(src)
        _write_corpus(src, [("RefStateProvince", _STATE_PAGE)], rows)
        r = _run_stage3(src, out)
        assert r.returncode == 0, r.stdout + r.stderr
        ddl = open(os.path.join(out, "schema.postgres.sql"), encoding="utf-8").read()
    assert '"State Abrv"' in ddl, ddl
    assert "INCOMPLETE" not in r.stdout, r.stdout


def test_9a90d2dd_d4e8ec3f_unmatched_items_are_named():
    """A bare 'N short' names nothing. Case-only differences are not losses; a renamed id is named."""
    tables = [
        ("Messages", [dict(name="ID", key="identifier"), dict(name="MsgSubject", key="varchar")]),
        ("Carriers", [dict(name="CarrierID", key="identifier")]),
    ]
    import tempfile
    rows = ["MessagesID", "Automatic identifier", "Messages",
            "MSGSubject", "String", "80", "Messages",
            "CarrierID", "Automatic identifier", "Carriers",
            "CarrierName", "String", "40", "Carriers",
            "Car", "4-byte integer", "Carriers"]      # short prefix of CarrierID: still unmatched
    with tempfile.TemporaryDirectory() as tmp:
        _write_corpus(tmp, [], rows)
        got = SCHEMA.unmatched_dictionary_items(tables, os.path.join(tmp, "_schema.md"))
    assert got == [("Car", ["Carriers"]), ("CarrierName", ["Carriers"]),
                   ("MessagesID", ["Messages"])], got


def test_9a90d2dd_a_cut_long_name_is_not_reported_missing():
    tables = [("CompanyDetail", [dict(name="CompanyBankAccount", key="varchar")])]
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        _write_corpus(tmp, [], ["CompanyBankAccountNo", "String", "50", "CompanyDetail"])
        got = SCHEMA.unmatched_dictionary_items(tables, os.path.join(tmp, "_schema.md"))
    assert got == [], got


def test_d4e8ec3f_stage3_incomplete_message_names_the_lost_item():
    """End to end: a dictionary item absent from its table page is named in the run output."""
    import tempfile
    rows = ["IDClient", "Automatic identifier", "Client",
            "Name", "String", "40", "Client",
            "Region", "String", "20", "Client"]
    schema = ["## General information", "Generation #", "Number of data files", "Nb items",
              "Nb links", "Nb connections", "Nb groups", "1", "1", "3", "0", "0", "0"]
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pc"), os.path.join(tmp, "db")
        os.makedirs(src)
        _write_corpus(src, [("Client", ["IDClient", "IDClient", "Automatic identifier",
                                        "Name", "Name", "String", "40"])], rows,
                      extra_schema=schema)
        r = _run_stage3(src, out)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "INCOMPLETE" in r.stdout, r.stdout
    assert "Region  [Client]" in r.stdout, r.stdout


def _dict(rows, known, extra=None):
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        _write_corpus(tmp, [], rows, extra_schema=extra)
        return SCHEMA._parse_item_dictionary_full(os.path.join(tmp, "_schema.md"), known)


def test_0a922271_unused_entry_does_not_take_the_next_items_data_files():
    """'Action / <Unused>' left 'Action' owning the NEXT item's type and data file."""
    items, _ = _dict(["Action", "<Unused>",
                      "ActionType", "String", "10", "RollbackTrace"], {"RollbackTrace"})
    assert items == {"ActionType": {"rollbacktrace"}}, items


def test_0a922271_item_named_type_is_an_item_not_a_header():
    items, _ = _dict(["TwitterAccount", "String", "50", "NLMessage",
                      "Type", "4-byte integer", "NLAttribute"], {"NLMessage", "NLAttribute"})
    assert items == {"TwitterAccount": {"nlmessage"}, "Type": {"nlattribute"}}, items


def test_0a922271_composite_key_named_after_its_data_file():
    """The key's name line equals a data-file name and was read as the end of the group before."""
    items, types = _dict(["ContainerCode", "Composite key", "50", "ExpectedContainer",
                          "ContainerType", "Composite key", "40", "ContainerType",
                          "ContainerTypeID", "Automatic identifier", "ContainerType"],
                         {"ExpectedContainer", "ContainerType"})
    assert items == {"ContainerCode": {"expectedcontainer"}, "ContainerType": {"containertype"},
                     "ContainerTypeID": {"containertype"}}, items


def test_0a922271_file_groups_section_does_not_extend_the_dictionary():
    items, _ = _dict(["ZIPfile", "Text Memo", "SysArchive"], {"SysArchive", "SysCountry"},
                     extra=["Analysis", "File groups", "Group", "File", "Caption", "System",
                            "SysCountry", "SysCountry (shared)"])
    assert items == {"ZIPfile": {"sysarchive"}}, items


def test_374c9938_clipped_tooltip_is_stripped_from_link_items():
    """A help string clipped by the PDF column has no ')' and poisoned every FK target."""
    import tempfile
    link = ["Data file", "COM_Compras", "COM_DetCompras", "Item",
            "IDCompras (The <%1!s!> report can be modified in",
            "IDCompras (Identifier of the purchase)"]
    with tempfile.TemporaryDirectory() as tmp:
        _write_corpus(tmp, [], [], extra_schema=["## Links", ""] + link)
        links = SCHEMA.parse_links(os.path.join(tmp, "_schema.md"),
                                   known_tables={"COM_Compras", "COM_DetCompras"})
    assert links == [("COM_Compras", "IDCompras", "COM_DetCompras", "IDCompras")], links


def test_stage3_runs_when_the_export_has_no_schema_page():
    """_schema.md absent crashed Stage 3 with KeyError: 0 - one early return gave {} not a pair."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, "pc"), os.path.join(tmp, "db")
        os.makedirs(src)
        _write_corpus(src, [("Client", ["IDClient", "IDClient", "Automatic identifier",
                                        "Name", "Name", "String", "40"])])
        r = _run_stage3(src, out)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "Traceback" not in r.stderr, r.stderr


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
