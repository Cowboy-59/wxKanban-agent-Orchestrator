"""
Stage 2 (pcsoft-page-to-react.py) field-reported defects, one test per defect, named by the
wxKanban feedback reference.

The shapes come from the reports and from the real corpora on this machine; each fixture is the
smallest dump that reproduces the shape. Run directly: `python test_field_reports_page.py`
(exit 0 = pass), or under pytest.
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


REACT = _load("pcsoft-page-to-react.py", "react_page_mod")


def _write(d, name, text):
    path = os.path.join(d, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def _handlers(page_md, controls_md="", page="WIN_Test", known=(), project=None):
    """parse_handlers over a .controls.md + .page.md pair; returns {seg: [(event, code)]}."""
    with tempfile.TemporaryDirectory() as d:
        cm = _write(d, page + ".controls.md", controls_md)
        pm = _write(d, page + ".page.md", page_md)
        if project:
            _write(d, "_project.md", "# %s - Project overview\n" % project)
        REACT.parse_handlers(cm, pm, known=set(known), page=page)
    return {seg: [(ev, [l.strip() for l in code]) for ev, code in hs]
            for seg, hs in REACT.HANDLERS.items()}


def _controls(text, page="WIN_Test", page_md=None):
    with tempfile.TemporaryDirectory() as d:
        cm = _write(d, page + ".controls.md", text)
        if page_md is not None:
            _write(d, page + ".page.md", page_md)
        REACT.UNKNOWN_TYPES.clear()
        return REACT.parse_controls(cm)


def _run_stage2(files, page="WIN_Test"):
    """Run the script itself on a fixture; returns (stdout, rebuild dir contents)."""
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "pre-convert")
        os.makedirs(src)
        for name, text in files.items():
            _write(src, name, text)
        out = os.path.join(d, "rebuild")
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
        r = subprocess.run([sys.executable, os.path.join(HERE, "pcsoft-page-to-react.py"),
                            "--page", os.path.join(src, page + ".controls.md"),
                            "--out", os.path.join(out, "pages"),
                            "--preview-out", os.path.join(d, "prev"),
                            "--gaps-out", os.path.join(out, "COMPONENT-GAPS.md")],
                           capture_output=True, text=True, encoding="utf-8", env=env)
        produced = {}
        for root, _, names in os.walk(out):
            for n in names:
                produced[n] = open(os.path.join(root, n), encoding="utf-8").read()
        return r.stdout + r.stderr, produced


# ----------------------------------------------------------------- event-handler headers

def test_10b1b9ce_parenless_initialization_headers_are_read():
    """414 of 422 "Initialization of X" headers had no "(", so the required "(" read none."""
    hs = _handlers("## Control code\n\n"
                   "Initialization of EDT_Date\nEDT_Date = Today()\n"
                   "End of initialization of TABLE_conslist\nTableDisplay(TABLE_conslist)\n"
                   "Exit a row of TABLE_conslist\nnRow = 0\n")
    assert hs.get("EDT_Date") == [("Initialization of", ["EDT_Date = Today()"])], hs
    assert [ev for ev, _ in hs.get("TABLE_conslist", [])] == \
        ["End of initialization of", "Exit a row of"], hs


def test_10b1b9ce_a_column_event_is_read_through_its_owner():
    """"Click on title of Column1 ( TableImport )": Column1 has no prefix; the owner is real."""
    hs = _handlers("## Control code\n\n"
                   "Click on title of Column1 ( TableImport )\nTableSort(TableImport)\n"
                   "Enter Column15 ( TableImport )\nx = 1\n", known={"TableImport"})
    assert hs.get("Column1") == [("Click on title of", ["TableSort(TableImport)"])], hs
    assert hs.get("Column15") == [("Enter", ["x = 1"])], hs


def test_8707df30_bare_click_header_is_read():
    """Every header on all 11 pages was "Click BTN_Agregar": no connector, no parentheses."""
    hs = _handlers("## Control code\n\nClick BTN_Agregar\nAddRow()\nClick BTN_OK\nSave()\n")
    assert hs.get("BTN_Agregar") == [("Click", ["AddRow()"])], hs
    assert hs.get("BTN_OK") == [("Click", ["Save()"])], hs


def test_8707df30_a_handler_runs_on_across_a_page_break():
    """The block ended at every repeated "## Control code" heading - one per PDF page."""
    hs = _handlers("## Control code\n\nClick BTN_OK ( WIN_Test )\nIF Check() THEN\nHAdd(Invoice)\n\n\n"
                   "## Control code\n\nFacturacion\nWIN_Test\nControl code\n"
                   "ELSE\nHTransactionCancel()\nEND\nWHEN EXCEPTION IN\nError()\n",
                   project="Facturacion")
    code = hs["BTN_OK"][0][1]
    assert code == ["IF Check() THEN", "HAdd(Invoice)", "ELSE", "HTransactionCancel()", "END",
                    "WHEN EXCEPTION IN", "Error()"], code


def test_625350e0_windev_desktop_header_dialect():
    """The WinDev desktop forms the report lists, which the WebDev-only regexes all missed."""
    hs = _handlers("## Control code\n\n"
                   "Global declarations of WIN_Test\nPROCEDURE MyWindow()\n"
                   "Click BtnLogon\nLogon()\n"
                   "Whenever modifying edtUserID\nCheckUser()\n"
                   "Select a menu in popAppointments.optNewAppt\nNewAppt()\n"
                   "Request for refreshing the display of TABLE_Rows\nRefresh()\n"
                   "Display a row in TABLE_Rows\nShowRow()\n", page="WIN_Test")
    assert hs.get("WIN_Test") == [("Global declarations of", ["PROCEDURE MyWindow()"])], hs
    assert hs.get("BtnLogon") == [("Click", ["Logon()"])], hs
    assert hs.get("edtUserID") == [("Whenever modifying", ["CheckUser()"])], hs
    assert hs.get("optNewAppt") == [("Select a menu in", ["NewAppt()"])], hs
    assert [ev for ev, _ in hs.get("TABLE_Rows", [])] == \
        ["Request for refreshing the display of", "Display a row in"], hs


def test_625350e0_property_rows_are_not_read_as_headers():
    """A menu caption "Exit Queue" in the controls dump; "Close GRN" is not the window's Close."""
    hs = _handlers("## Control code\n\nClick BTN_A\nClose GRN\nIF HFound(Order) THEN\n",
                   controls_md="Option caption\nExit Queue\nHalo Width\n0\n",
                   known={"Queue", "Width", "GRN", "BTN_A"})
    assert sorted(hs) == ["BTN_A"], hs
    assert hs["BTN_A"][0][1] == ["Close GRN", "IF HFound(Order) THEN"], hs


def test_625350e0_local_procedure_ends_the_handler_above_it():
    """Unrecognised, a "Local procedure" ran on into the previous event's body."""
    hs = _handlers("## Control code\n\nClick BTN_Save ( WIN_Test )\nSaveIt()\n"
                   "Local procedure SaveIt\nPROCEDURE SaveIt()\nHAdd(Order)\n")
    assert hs["BTN_Save"][0][1] == ["SaveIt()"], hs
    assert [(src, [l.strip() for l in code]) for src, code in REACT.PROCEDURES] == \
        [("Local procedure SaveIt", ["PROCEDURE SaveIt()", "HAdd(Order)"])], REACT.PROCEDURES


def test_6611ee99_watermark_footer_is_not_ported_as_wlanguage():
    """The last handler on every page swallowed the watermark footer this tool appends."""
    hs = _handlers("## Control code\n\nClick BTN_SaveAddress ( WIN_Test )\nHModify(Address)\n\n---\n\n"
                   "<!-- wxkanban:watermark -->\n*Converted with wxKanban — www.wxperts.com*\n")
    assert hs["BTN_SaveAddress"][0][1] == ["HModify(Address)"], hs


def test_4cbff833_code_above_its_header_is_put_back_under_it():
    """
    The splitter wrote "Control code" before "Code", though the PDF prints Code first: the tail of
    a handler started on the last Code page sat ABOVE its header, attributed to nothing.
    """
    hs = _handlers("## Control code\n\nGR..Color = DefaultColor\nChangeSourceWindow(IW_A)\n"
                   "Click IMG_Next\nNext()\n\n\n"
                   "## Code\n\nWIN_Test\nCode\nGlobal declarations of WIN_Test\ngnPlane is int\n"
                   "WIN_Test\nControl code\nClick IMG_X ( WIN_Test )\nIF gnPlane = 1 THEN\n",
                   page="WIN_Test")
    assert hs["IMG_X"][0][1] == ["IF gnPlane = 1 THEN", "GR..Color = DefaultColor",
                                 "ChangeSourceWindow(IW_A)"], hs
    assert hs["IMG_Next"][0][1] == ["Next()"], hs
    assert hs["WIN_Test"][0][1] == ["gnPlane is int"], hs


def test_f0df8d41_zero_handler_yield_is_reported_loudly():
    """Code present, no header recognised: the run used to print a healthy summary."""
    out, _ = _run_stage2({
        "WIN_Test.controls.md": "Button : BTN_Go\nCaption\nGB:\nGo\n",
        "WIN_Test.page.md": "## Control code\n\nWhen the moon is full BTN_Go\nGo()\nStop()\n",
    })
    assert "NOT ONE event header" in out, out
    assert "event handlers: 0 read" in out, out


# ----------------------------------------------------------------- control parsing

def test_f0df8d41_webdev_control_followed_by_a_label_is_kept():
    """Every WebDev block opens "<path>" / "Note"; the rule against that dropped the control."""
    roots, nodes = _controls("ZONE_Center\nNote\nGB\nHeight\n200\n"
                             "ZONE_Center.CELL_ActionBar.BTN_Apply\nNote\nGB\n"
                             "X position\n180\nY position\n150\n")
    assert "ZONE_Center.CELL_ActionBar.BTN_Apply" in nodes, sorted(nodes)
    assert nodes["ZONE_Center.CELL_ActionBar.BTN_Apply"]["x"] == 180


def test_4cbff833_property_sublabels_are_not_control_types():
    """"Invalid input: Text", "Left button: Width", "HH:MM" were listed as control TYPES."""
    roots, nodes = _controls("Button : BTN_Go\nCaption\nGB:\nGo\nInvalid input: Text\n"
                             "Left button: Width\nInput mask\nHH:MM\n")
    assert not REACT.UNKNOWN_TYPES, REACT.UNKNOWN_TYPES
    assert sorted(nodes) == ["BTN_Go"], sorted(nodes)


def test_4cbff833_reported_windev_types_are_mapped():
    """The 16 types a 640-window conversion reported unrecognised, plus Sidebar."""
    types = ["Caption", "Internal Window", "Supercontrol", "Option caption", "Pivot Table",
             "Chart", "Spreadsheet", "Separator", "Map", "Bar code", "Image Editor",
             "PDF Reader", "HTML Display", "Calendar", "TreeView", "ListView", "Sidebar"]
    text = "".join("%s : CTL_%d\n" % (t, i) for i, t in enumerate(types))
    roots, nodes = _controls(text)
    assert not REACT.UNKNOWN_TYPES, REACT.UNKNOWN_TYPES
    assert nodes["CTL_0"]["kind"] == "static", nodes["CTL_0"]
    assert nodes["CTL_1"]["kind"] == "internalwindow", nodes["CTL_1"]


def test_b91866bf_progress_bar_is_rendered_not_dropped():
    """Recognised as kind "progress" since the fix - and then rendered as nothing at all."""
    out, produced = _run_stage2({
        "WIN_Test.controls.md": "Progress Bar : PROGBAR_Barra\nCaption\nGB:\nLoading\n",
        "WIN_Test.page.md": "## General information\n\nNothing\n",
    })
    tsx = produced.get("WIN_Test.tsx", "")
    assert "<Progress value={0}" in tsx, out + tsx
    assert 'import { Progress } from "@/components/ui/progress";' in tsx, tsx


def test_6611ee99_unmapped_declared_type_is_kept_visible():
    """An unknown type was counted "not dropped" - and build_vnode returned nothing for it."""
    roots, nodes = _controls("Hologram : HOLO_Logo\nCaption\nGB:\nLogo\n")
    REACT.LIFTED.clear()
    v = REACT.build_vnode(nodes["HOLO_Logo"])
    assert v is not None and "HOLO_Logo" in v.text and "Hologram" in v.text, v and v.text


def test_6611ee99_sidebar_is_a_placeholder_and_its_panes_survive():
    roots, nodes = _controls("Sidebar : SDB_Menu\n"
                             "Button : SDB_Menu.BTN_Home\nCaption\nGB:\nHome\n")
    REACT.LIFTED.clear()
    v = REACT.build_vnode(nodes["SDB_Menu"])
    jsx = REACT.to_jsx(v)
    assert "SDB_Menu" in jsx and "shadcn Sidebar" in jsx, jsx
    assert "Home" in jsx, jsx


def test_6611ee99_component_gaps_file_is_written():
    """Every placeholder says "see rebuild/COMPONENT-GAPS.md"; nothing ever wrote it."""
    out, produced = _run_stage2({
        "WIN_Test.controls.md": "Sidebar : SDB_Menu\nButton : BTN_Go\nCaption\nGB:\nGo\n",
        "WIN_Test.page.md": "## Control code\n\nClick BTN_Go\nGo()\n",
    })
    gaps = produced.get("COMPONENT-GAPS.md", "")
    assert "WIN_Test — component gaps" in gaps and "SDB_Menu" in gaps, out + gaps


def test_6611ee99_a_label_reads_before_the_field_it_labels():
    """A caption sits a few pixels lower than its field, so a plain Y sort put it after."""
    roots, nodes = _controls("STC_Name\nCaption\nName:\nX position\n10\nY position\n52\n"
                             "EDT_Name\nCaption\nGB\nX position\n120\nY position\n50\n")
    assert [r["seg"] for r in roots] == ["STC_Name", "EDT_Name"], [r["seg"] for r in roots]


GEOMETRY_DUMP = (
    "Edit control\nX position\nY position\nWidth\nHeight\nPlane\nVisible\nInitial state\n"
    "EDT_AdditionalRefere\n74\n485\n479\n39\n3\nEnable\nText\n"
    "EDT_AdditionalRefere\n74\n530\n479\n39\n3\nEnable\nText\n"
    "EDT_Total\n74\n80\n210\n39\n1,2\nRead-o\nNumeri\n"
    "Button\nX position\nY position\nWidth\nHeight\nPlane\nVisible\nInitial state\n"
    "BTN_Save\n507\n11\n120\n30\n1,2,3\nEnabled\nNormal\n"
    "Button : BTN_Save\nCaption\nGB:\nSave\n"
    "Edit control : EDT_AdditionalReference1\nCaption\nGB:\nRef 1\n"
    "Edit control : EDT_AdditionalReference2\nCaption\nGB:\nRef 2\n"
    "Edit control : EDT_Total\nCaption\nGB:\nTotal\n"
)


def test_997eedde_geometry_tables_position_the_controls():
    """WinDev desktop prints X/Y only in the column tables; every page came out unpositioned."""
    roots, nodes = _controls(GEOMETRY_DUMP)
    assert (nodes["BTN_Save"]["x"], nodes["BTN_Save"]["y"]) == (507, 11), nodes["BTN_Save"]
    assert nodes["EDT_Total"]["y"] == 80 and nodes["EDT_Total"]["plane"] == "1,2"
    assert [r["seg"] for r in roots] == ["BTN_Save", "EDT_Total", "EDT_AdditionalReference1",
                                         "EDT_AdditionalReference2"], [r["seg"] for r in roots]


def test_997eedde_a_cut_name_is_joined_by_order_and_never_becomes_a_control():
    """"EDT_AdditionalRefere" x2 is the two EDT_AdditionalReference* controls, in name order."""
    roots, nodes = _controls(GEOMETRY_DUMP)
    assert nodes["EDT_AdditionalReference1"]["y"] == 485
    assert nodes["EDT_AdditionalReference2"]["y"] == 530
    assert nodes["EDT_AdditionalReference2"]["plane"] == "3"
    assert "EDT_AdditionalRefere" not in nodes, sorted(nodes)


def test_997eedde_table_values_are_not_controls():
    """"Normal", "Enabled", "Text" were each rendered as a control of the table's type."""
    roots, nodes = _controls(GEOMETRY_DUMP)
    assert sorted(nodes) == ["BTN_Save", "EDT_AdditionalReference1", "EDT_AdditionalReference2",
                             "EDT_Total"], sorted(nodes)


def test_997eedde_an_ambiguous_cut_name_is_reported_not_guessed():
    dump = GEOMETRY_DUMP.replace("Edit control : EDT_AdditionalReference2\nCaption\nGB:\nRef 2\n",
                                 "")
    roots, nodes = _controls(dump)
    assert nodes["EDT_AdditionalReference1"]["y"] is None, nodes["EDT_AdditionalReference1"]
    assert REACT.GEOMETRY_UNMATCHED.count("EDT_AdditionalRefere") == 2, REACT.GEOMETRY_UNMATCHED


def test_997eedde_geometry_table_in_the_page_file_is_read():
    """The window's first table starts on its last "General information" page: .page.md."""
    roots, nodes = _controls("Edit control : EDT_Total\nCaption\nGB:\nTotal\n",
                             page_md="## General information\n\nWindow statistics\n"
                                     "Edit control\nX position\nY position\nWidth\nHeight\n"
                                     "Plane\nEDT_Total\n74\n80\n210\n39\n1\n")
    assert (nodes["EDT_Total"]["x"], nodes["EDT_Total"]["y"]) == (74, 80), nodes["EDT_Total"]


def test_997eedde_a_declaration_with_no_name_is_reported_and_lends_nothing():
    """"Check Box : " lost its name; its block ran on into the previous control's."""
    roots, nodes = _controls("Button : BTN_Go\nX position\n5\nCheck Box :\nCaption\nGB:\n"
                             "Remember me\n")
    assert REACT.UNNAMED_DECLS == ["Check Box"], REACT.UNNAMED_DECLS
    assert nodes["BTN_Go"]["caption"] == "", nodes["BTN_Go"]


def test_6611ee99_planes_are_listed_for_the_rebuild():
    roots, nodes = _controls(GEOMETRY_DUMP)
    note = "\n".join(REACT.plane_note(nodes))
    assert "planes 1, 2, 3" in note, note
    assert "plane 3: EDT_AdditionalReference1, EDT_AdditionalReference2" in note, note


def test_4d285663_multilingual_caption_reads_the_english_text():
    """"ES: Cerrar GB: Close" and "ES,GB: Sec" went into the JSX verbatim."""
    assert REACT.read_value(["Caption", "ES:", "Cerrar", "GB:", "Close"], "Caption") == "Close"
    assert REACT.read_value(["Caption", "ES,GB: Sec"], "Caption") == "Sec"
    assert REACT.read_value(["Caption", "Fermer", "GB: Close", "ES: Cerrar"], "Caption") == "Close"
    # single-language values read as before
    assert REACT.read_value(["Caption", "GB:", "BACK"], "Caption") == "BACK"
    assert REACT.read_value(["Caption", "Save order"], "Caption") == "Save order"


def test_4d285663_declared_column_keeps_its_own_path():
    """"Table column : TABLE_A.COL_SEC (1)" became "TABLE_A.TABLE_A.COL_SEC (1)"."""
    roots, nodes = _controls("Table : TABLE_A\nCaption\nGB:\nMembers\n"
                             "Table column : TABLE_A.COL_SEC (1)\nTitle\nGB:\nSec\n")
    assert "TABLE_A.COL_SEC" in nodes, sorted(nodes)
    assert nodes["TABLE_A.COL_SEC"]["title"] == "Sec"
    assert nodes["TABLE_A"]["caption"] == "Members", nodes["TABLE_A"]


def test_4cbff833_window_code_is_not_parsed_as_controls():
    """The window's code starts at the foot of the last controls page: "gsType" was a control."""
    roots, nodes = _controls("Button : BTN_Go\nCaption\nGB:\nGo\n"
                             "WIN_Test\nCode\nGlobal declarations of WIN_Test\ngsType\nis string\n")
    assert sorted(nodes) == ["BTN_Go"], sorted(nodes)


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
