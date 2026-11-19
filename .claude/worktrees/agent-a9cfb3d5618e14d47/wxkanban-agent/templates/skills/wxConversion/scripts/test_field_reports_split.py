"""
Field-reported pcsoft-doc-split.py (Stage 1) defects, one test per defect, named by its wxKanban
feedback reference - the splitter half of the 2026-10 feedback sweep.

The end-to-end tests run the real main() over a fake PDF (a list of page texts), because every one
of these defects is a page the run silently dropped while still exiting 0 - and a unit test of one
helper cannot show that the page now reaches a written file.

Run directly: `python test_field_reports_split.py` (exit 0 = pass), or under pytest.
"""

import contextlib
import importlib.util
import io
import os
import shutil
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def _load(filename, modname):
    spec = importlib.util.spec_from_file_location(modname, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPLIT = _load("pcsoft-doc-split.py", "split_mod_fr")

SEP = " \u203a "          # the breadcrumb separator the real exports extract as


class _FakePage:
    def __init__(self, text):
        self._text = text

    def get_text(self):
        return self._text


class _FakeDoc:
    def __init__(self, texts):
        self._pages = [_FakePage(t) for t in texts]
        self.page_count = len(texts)

    def __getitem__(self, i):
        return self._pages[i]


def _page(no, crumb, body, title="Demo"):
    """One PDF page as get_text() returns it: breadcrumb, date, page number, title, then body."""
    if crumb is None:                       # a page PCSoft printed with no running header
        return body + "\n"
    return "\n".join([SEP.join(crumb), "25/06/2026", str(no), title, body]) + "\n"


def _split(bodies, *extra):
    """Run the real main() over fake pages. Returns (exit code, {file: text}, stdout, stderr)."""
    texts = ["Demo\nTechnical documentation\n"] + [
        _page(i + 2, crumb, body) for i, (crumb, body) in enumerate(bodies)]
    out = tempfile.mkdtemp()
    real_fitz, real_argv = SPLIT.fitz, sys.argv
    SPLIT.fitz = types.SimpleNamespace(open=lambda path: _FakeDoc(texts))
    sys.argv = ["pcsoft-doc-split.py", "--pdf", "fake.pdf", "--out", out] + list(extra)
    so, se = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(so), contextlib.redirect_stderr(se):
            rc = SPLIT.main()
        files = {f: open(os.path.join(out, f), encoding="utf-8").read() for f in os.listdir(out)}
    finally:
        SPLIT.fitz, sys.argv = real_fitz, real_argv
        shutil.rmtree(out, ignore_errors=True)
    return rc, files, so.getvalue(), se.getvalue()


_PROJECT = (["Part 1", "Project", "General information"], "Demo\nGeneral information\n")


# --------------------------------------------------------------- c4873073 / 0b67737e: no Type

def test_c4873073_typeless_breadcrumb_kind_comes_from_the_physical_file():
    """'Part 8 > RPT_connote > Code' names the element where the Type belongs."""
    assert SPLIT.typeless_name(["Part 8", "RPT_connote", "Code"]) == "RPT_connote"
    assert SPLIT.typeless_name(["Parte 8", "QRY_GPU_ElementStatus", "Codigo"]) == \
        "QRY_GPU_ElementStatus"
    # a real Type, a Type with spaces, and a divider are not element names
    assert SPLIT.typeless_name(["Part 5", "Report", "RPT_x", "Code"]) is None
    assert SPLIT.typeless_name(["Part 8", "REST web service", "General information"]) is None
    assert SPLIT.typeless_name(["Part 9", "Internal component WDFAA"]) is None
    # the export's own statement of what the element is, in any language
    for path, kind in (("E:\\app\\RPT_connote.wde", "report"), ("E:\\app\\RPT_connote.wdw", "page"),
                       ("E:\\app\\RPT_connote.wdr", "qry"), ("E:\\app\\RPT_connote.wwh", "page")):
        assert SPLIT.kind_from_physical_file("RPT_connote", ["x\n" + path + "\n"])[0] == kind, path
    # the NAME PREFIX is not evidence, and neither is another element's file
    assert SPLIT.kind_from_physical_file("RPT_connote", ["RPT_connote\nCode\nPROCEDURE P()\n"]) \
        is None
    assert SPLIT.kind_from_physical_file("RPT_connote", ["E:\\app\\RPT_other.wde\n"]) is None


def test_c4873073_component_report_is_written_and_the_unprovable_one_is_reported():
    rc, files, out, err = _split([
        _PROJECT,
        (["Part 8", "Internal component COMP"], "Part 8\nInternal component COMP"),
        (["Part 8", "RPT_connote", "General information"],
         "RPT_connote\nGeneral information\nRPT_connote\nPhysical report name\n"
         "E:\\app\\COMP\\RPT_connote.wde\nType\nFree"),
        (["Part 8", "RPT_connote", "Information on controls"], "Type\nX\nItem\n:arrLines.amount"),
        (["Part 8", "RPT_connote", "Code"],
         "PROCEDURE PrintConnote()\nHReadSeekFirst(Consignment, ConsignmentID, nID)"),
        (["Part 8", "SET_ConnoteHelpers", "Code"], "PROCEDURE Helper()\nRESULT 1"),
    ])
    assert rc == 0, err
    assert "RPT_connote.report.md" in files, sorted(files)
    rpt = files["RPT_connote.report.md"]
    assert "HReadSeekFirst(Consignment" in rpt and "RPT_connote.wde" in rpt, rpt
    assert "Internal component COMP" in rpt, "the provenance line names the component"
    assert ":arrLines.amount" in files["RPT_connote.controls.md"]
    # no physical file -> not guessed from the SET_ prefix, but named loudly
    assert "SET_ConnoteHelpers.proc.md" not in files, sorted(files)
    disc = files["_discarded.md"]
    assert "breadcrumb carries no Type" in disc and "| SET_ConnoteHelpers | 1 |" in disc, disc
    assert "SET_ConnoteHelpers" in err, err


def test_c4873073_lead_page_with_only_the_part_crumb_is_taken_in():
    """BlueCube p35158 / PPE p12845: the page printing the physical file carries only 'Part N'."""
    rc, files, out, err = _split([
        _PROJECT,
        (["Part 9", "Internal component WDFAA"], "Part 9\nInternal \ncomponent"),
        (["Part 9"], "IW_View\nImage\nIW_View\nGeneral information\nIW_View\nPhysical file\n"
                     "E:\\app\\WDFAA\\IW_View.wdw\nWindow type\nFree window"),
        (["Part 9", "IW_View", "General information"], "Opacity\n100"),
        (["Part 9", "IW_View", "Information on controls"], "Window : IW_View\nInternal Window"),
    ])
    assert rc == 0, err
    page = files["IW_View.page.md"]
    assert "Free window" in page and "Opacity" in page, page
    assert "Part 9\nIW_View" not in page, "the bare crumb line is not kept as content"
    assert "Window : IW_View" in files["IW_View.controls.md"]
    assert "_discarded.md" not in files or "IW_View" not in files["_discarded.md"]


# ------------------------------------------------------------------- 0b67737e: Spanish export

def test_0b67737e_spanish_breadcrumbs_classify():
    """'Parte 3 > Ventana WINDEV > WIN_x > Información sobre los controles' and its siblings."""
    cases = [
        (["Parte 3", "Ventana WINDEV", "WIN_Socios", "Información sobre los controles"],
         (3, "page", "WIN_Socios")),
        (["Parte 3", "Modelo ventana WINDEV", "TPL_Base", "Código"], (3, "page", "TPL_Base")),
        (["Parte 4", "Consulta", "QRY_Socios", "Información general"], (4, "qry", "QRY_Socios")),
        (["Parte 6", "Reporte", "RPT_Recibo", "Código"], (6, "report", "RPT_Recibo")),
        (["Parte 6", "Informe", "RPT_Recibo", "Código"], (6, "report", "RPT_Recibo")),
        (["Parte 5", "Conjunto de procedimientos", "COL_Global", "Código"],
         (5, "proc", "COL_Global")),
        (["Parte 7", "Clase", "cSocio", "Código"], (7, "proc", "cSocio")),
        (["Parte 1", "Proyecto", "Información general"], (1, "project", None)),
        (["Parte 2", "Análisis", "S:\\app\\ASEMUR.wda", "Archivos de datos y campos", "Ahorros",
          "Archivos de datos y campos"], (2, "table", "Ahorros")),
        # accents stripped, as the report quoted them
        (["Parte 2", "Analisis", "S:\\app\\ASEMUR.wda", "Archivos de datos y campos", "Ahorros",
          "Archivos de datos y campos"], (2, "table", "Ahorros")),
    ]
    for segs, want in cases:
        assert SPLIT.classify(segs)[:3] == want, (segs, SPLIT.classify(segs))
    assert SPLIT.canonical_sub("Información sobre los controles") == SPLIT.CONTROLS_SUB
    assert SPLIT.canonical_sub("Codigo de los controles") == "Control code"
    # the misnamed-page shape must not name a table after the localized Type
    assert SPLIT.name_from_breadcrumb(
        ["Parte 2", "Análisis", "S:\\app\\ASEMUR.wda", "Archivos de datos y campos", "Análisis"]) \
        is None
    # English is unchanged
    assert SPLIT.classify(["Part 3", "WINDEV window", "WIN_x", "Code"])[:3] == (3, "page", "WIN_x")


def test_0b67737e_spanish_export_end_to_end():
    """1148 of 1148 pages were discarded and not one element written."""
    rc, files, out, err = _split([
        (["Parte 1", "Proyecto", "Información general"], "Demo\nInformación general"),
        (["Parte 2", "Análisis", "S:\\app\\ASEMUR.wda", "Información general"],
         "Información general\nASEMUR"),
        (["Parte 2", "Análisis", "S:\\app\\ASEMUR.wda", "Archivos de datos y campos", "Ahorros",
          "Archivos de datos y campos"],
         "Ahorros\nArchivos de datos y campos\nAhorros campos del fichero\nIDAhorro\nImporte"),
        # the second defect in the same report: an elided Type on a table page
        (["Parte 2", "...", "S:\\app\\ASEMUR.wda", "Archivos de datos y campos", "Cuentas",
          "Archivos de datos y campos"], "Cuentas\nIDCuenta\nSaldo"),
        (["Parte 3", "Ventana WINDEV", "WIN_Socios", "Información general"],
         "WIN_Socios\nInformación general\nWIN_Socios"),
        (["Parte 3", "Ventana WINDEV", "WIN_Socios", "Información sobre los controles"],
         "Ventana : WIN_Socios\nBTN_Guardar"),
        (["Parte 3", "Ventana WINDEV", "WIN_Socios", "Código de los controles"],
         "Clic en BTN_Guardar\nHAdd(Socios)"),
        (["Parte 4", "Consulta", "QRY_Socios", "Información general"], "QRY_Socios\nSELECT"),
        (["Parte 5", "Conjunto de procedimientos", "COL_Global", "Código"],
         "PROCEDURE Hola()\nRESULT 1"),
    ])
    assert rc == 0, err
    for f in ("Ahorros.table.md", "Cuentas.table.md", "WIN_Socios.page.md",
              "WIN_Socios.controls.md", "QRY_Socios.qry.md", "COL_Global.proc.md",
              "_project.md", "_schema.md"):
        assert f in files, (f, sorted(files))
    # the controls dump goes to the sidecar Stage 2 reads; the control CODE stays in the page
    assert "BTN_Guardar" in files["WIN_Socios.controls.md"]
    assert "HAdd(Socios)" in files["WIN_Socios.page.md"]
    assert "HAdd(Socios)" not in files["WIN_Socios.controls.md"]


def test_0b67737e_partner_table_is_not_taken_for_the_part_segment():
    """The Part test was a 'Part' prefix, which also threw away a table named Partner."""
    segs = ["Part 2", "...", "Data files and items", "Partner", "Data files and items"]
    assert SPLIT.name_from_breadcrumb(segs) == "Partner"
    # a continuation page of that table, whose body has no header, stays with the table
    assert SPLIT.place_elided_page("...", segs[-1], segs, "PartnerID\nName\n") == \
        ("table", "Partner", "Data files and items")


def test_0b67737e_zero_elements_is_a_hard_stop():
    """A run that writes nothing exited 0 unless the export also had a recognisable Analysis."""
    rc, files, out, err = _split([
        (["Partie 1", "Projet", "Informations générales"], "Demo"),
        (["Partie 3", "Fenêtre WINDEV", "FEN_Accueil", "Code"], "Clic sur BTN_OK\nFerme()"),
        (["Partie 3", "Fenêtre WINDEV", "FEN_Accueil", "Code"], "Ferme()"),
    ])
    assert rc == 3, (rc, out, err)
    assert "ZERO elements" in err and "Fenêtre WINDEV" in err, err


# ------------------------------------------------------------- 56ad9fdb / a075d21f: straddle

_MISNAMED = ["Part 2", "Analysis", "C:\\app\\C4L.wda", "Data files and items", "Analysis"]


def _overview(rows):
    lines = ["Abbreviation", "Automatic ID", "Generation #", "Type"]
    for i in range(rows):
        lines += ["DataFile%d" % i, "3", "HFSQL"]
    return "\n".join(lines)


def test_56ad9fdb_name_on_disk_on_two_lines_is_read():
    """Every real export prints 'Name on disk' and '<name>.FIC' on separate lines."""
    body = ("Gallery\nData files and items\nGeneral information\nGallery\nName on disk\n"
            "Gallery.FIC\nGallery list of columns\nID\n")      # an items wording the regex lacks
    assert SPLIT.place_misnamed_table_page("schema", _MISNAMED, body) == "Gallery"
    assert SPLIT.name_on_disk("Name on disk Gallery.FIC") == "Gallery"
    # the analysis's own file is never a data file's name
    assert SPLIT.place_misnamed_table_page("schema", _MISNAMED, "Name on disk\nC4L.wda\n") is None


def test_a075d21f_first_table_far_down_a_shared_page_keeps_its_opening_items():
    """
    p133 carried the data-file overview and, below it, only the first four items of Area - its
    primary key among them. The header sat past line 40, the only lines that were searched.
    """
    head = _overview(20)                                  # 64 lines of overview tail
    tail = ("Area\nData files and items\nGeneral information\nArea\nName on disk\nArea.FIC\n"
            "Area data file items\nCaption\nType\nusGUIDAreaID\nusGUIDAreaZonesID\n"
            "MainAreaCode\nSubAreaCode")
    body = head + "\n" + tail
    assert len(head.split("\n")) > 40
    assert SPLIT.place_misnamed_table_page("schema", _MISNAMED, body) == "Area"
    schema_part, table_part = SPLIT.split_at_table_start(body, "Area")
    assert "usGUIDAreaID" in table_part and "usGUIDAreaID" not in schema_part
    assert schema_part.startswith("Abbreviation") and "DataFile19" in schema_part
    # an overview page with no table on it still stays in the schema, however long
    assert SPLIT.place_misnamed_table_page("schema", _MISNAMED, _overview(30)) is None


def test_a075d21f_shared_page_end_to_end():
    rc, files, out, err = _split([
        _PROJECT,
        (_MISNAMED, _overview(20) + "\nArea\nData files and items\nGeneral information\nArea\n"
                    "Name on disk\nArea.FIC\nArea data file items\nusGUIDAreaID\nMainAreaCode"),
        (["Part 2", "Analysis", "C:\\app\\C4L.wda", "Data files and items", "Area",
          "Data files and items"], "SubAreaCode\nCaption"),
    ])
    assert rc == 0, err
    area = files["Area.table.md"]
    assert "usGUIDAreaID" in area and "SubAreaCode" in area, area
    assert "DataFile19" in files["_schema.md"] and "usGUIDAreaID" not in files["_schema.md"]


# ------------------------------------------------------------- f0df8d41: headerless pages

def test_f0df8d41_page_with_no_running_header_stays_with_its_element():
    """
    29 pages across five real exports carry no breadcrumb at all - a class's PROCEDURE, a window's
    control code - and were listed as '(no breadcrumb / cover)', which the file calls safe to
    ignore.
    """
    rc, files, out, err = _split([
        _PROJECT,
        (["Part 3", "WINDEV window", "WIN_A", "Control code"], "Click on BTN_Save\nHAdd(Client)"),
        (None, "Initialization of EDT_Name\nEDT_Name = gsName"),            # sandwich
        (["Part 3", "WINDEV window", "WIN_A", "Control code"], "Click on BTN_Close\nClose()"),
        (["Part 3", "WINDEV window", "WIN_B", "Information on controls"],
         "Window : WIN_B\nBTN_Back\nWIN_B\nControl code\nClick on BTN_Back"),
        (None, "Close()\nInitialization of STC_Title\nSTC_Title = sTitle"),  # tail of WIN_B
        (["Part 3", "WINDEV window", "WIN_C", "Image"], "WIN_C\nImage"),
        (None, ""),                                                           # blank: dropped
    ])
    assert rc == 0, err
    assert "EDT_Name = gsName" in files["WIN_A.page.md"], files["WIN_A.page.md"]
    # the tail continues the subsection its predecessor OPENED, not the one its header named
    assert "STC_Title = sTitle" in files["WIN_B.page.md"], files["WIN_B.page.md"]
    assert "STC_Title = sTitle" not in files["WIN_B.controls.md"]
    assert "NO HEADER" in out and "p4, 7" in out, out
    disc = files["_discarded.md"]
    assert "| (no breadcrumb / cover) | 2 | 1, 9 |" in disc, disc


def test_f0df8d41_headerless_page_that_opens_the_next_element_goes_to_it():
    rc, files, out, err = _split([
        _PROJECT,
        (["Part 3", "WINDEV window", "WIN_A", "Code"], "Close()"),
        (None, "WIN_B\nImage\nWIN_B\nGeneral information\nWindow type"),
        (["Part 3", "WINDEV window", "WIN_B", "General information"], "Opacity\n100"),
    ])
    assert rc == 0, err
    assert "Window type" in files["WIN_B.page.md"] and "Window type" not in files["WIN_A.page.md"]


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
