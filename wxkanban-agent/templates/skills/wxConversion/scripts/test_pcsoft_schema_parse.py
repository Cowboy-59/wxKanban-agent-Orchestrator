"""Field-parsing regression tests for pcsoft-schema-to-sql.py.

Covers the four field-dictionary parsing defects reported from the field (wxKanban feedback
28986580-6628-401b-b86c-e9885243f338). Every one of them shifted or renamed COLUMNS silently:
the run still exited 0 and still printed a summary, so the damage only showed up when somebody
read the generated DDL against the source analysis.

  1. 'GDPR' missing from HEADER_LABELS      -> header label read as the first field's name
  2. '(yyyymmddhhmmssccc)' left unconsumed  -> annotation read as the next field's name
  3. bare unmapped type ('Duration')        -> absorbed as caption instead of tripping the gate
  4. header block reprinted on page 2       -> 'Default value' captured as a real field's name

Fixtures are synthetic (constraint C-9) and shaped like real splitter output: one line per PDF
text run, '## <subsection>' per source page.

Run directly: `python test_pcsoft_schema_parse.py` (exit 0 = pass).
"""

import importlib.util
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SCRIPT = os.path.join(HERE, "pcsoft-schema-to-sql.py")


def _load():
    spec = importlib.util.spec_from_file_location("pcsoft_schema_to_sql", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _load()

HEADER_BLOCK = [
    "Caption",
    "Type",
    "Size",
    "Unique Key",
    "Key with Duplicates",
    "Direction",
    "GDPR",
    "Default value",
]


def _table_md(name, page_bodies):
    """Assemble a .table.md the way pcsoft-doc-split.py does: one '## ' heading per source page."""
    out = ["# %s" % name, "", "_Type: table  |  Source: PDF pages 10-11_", ""]
    for body in page_bodies:
        out.append("## Data files and items")
        out.append("")
        out.append("%s data file items" % name)
        out.extend(HEADER_BLOCK)
        out.extend(body)
        out.append("")
    return "\n".join(out)


def _parse(name, page_bodies, unmapped=None):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "%s.table.md" % name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(_table_md(name, page_bodies))
        return M.parse_table(path, unmapped)


def _by_name(fields):
    return {f["name"]: f for f in fields}


def test_gdpr_header_is_not_read_as_a_field():
    """Defect 1: the fixed 'GDPR' column header must be stripped with the rest of the block."""
    _, fields = _parse("Branches", [[
        "BranchID", "Branch identifier", "Automatic identifier (8 ", "bytes)",
        "BranchName", "Branch name", "String", "60",
    ]])
    names = [f["name"] for f in fields]
    assert "GDPR" not in names, "GDPR header captured as a field name: %r" % names
    assert names == ["BranchID", "BranchName"], names
    assert fields[0]["key"] == "identifier", fields[0]
    assert fields[1]["key"] == "varchar" and fields[1]["size"] == 60, fields[1]


def test_datetime_format_annotation_is_consumed():
    """Defect 2: '(yyyymmddhhmmssccc)' belongs to the type, not to the next field."""
    _, fields = _parse("Branches", [[
        "CreatedDate", "Created on", "Date and Time", "(yyyymmddhhmmssccc)",
        "IsActive", "Active", "Boolean",
        "DueDate", "Due", "Date", "(yyyymmdd)",
        "BranchName", "Branch name", "String", "60",
    ]])
    names = [f["name"] for f in fields]
    assert names == ["CreatedDate", "IsActive", "DueDate", "BranchName"], names
    got = _by_name(fields)
    assert got["CreatedDate"]["key"] == "datetime", got["CreatedDate"]
    assert got["DueDate"]["key"] == "date", got["DueDate"]
    assert got["BranchName"]["size"] == 60, got["BranchName"]


def test_bare_unmapped_type_is_reported_not_swallowed():
    """Defect 3: a one-word unknown type must trip the unmapped gate, like '<n>-byte <word>' does."""
    unmapped = []
    _, fields = _parse("Tasks", [[
        "TaskID", "Task identifier", "Automatic identifier (8 ", "bytes)",
        "TimeSpendOnTask", "Hours worked", "Duration", "8",
        "TaskName", "Task name", "String", "80",
    ]], unmapped)
    assert unmapped, "bare unmapped type 'Duration' was absorbed silently: %r" % (
        [f["name"] for f in fields],)
    assert any(u["type"] == "Duration" for u in unmapped), unmapped
    assert any(u["table"] == "Tasks" for u in unmapped), unmapped


def test_known_bare_types_do_not_trip_the_gate():
    """The gate must stay quiet for types we DO map — including 'Decimal', reported and now mapped."""
    unmapped = []
    _, fields = _parse("TasksDetail", [[
        "TimeOnTaskDecimal", "Hours worked", "Decimal", "8",
        "TravelDistance", "Distance", "Decimal", "8",
        "Note", "Note", "String", "255",
    ]], unmapped)
    assert unmapped == [], unmapped
    got = _by_name(fields)
    assert set(got) == {"TimeOnTaskDecimal", "TravelDistance", "Note"}, sorted(got)
    assert got["TravelDistance"]["key"] == "numeric", got["TravelDistance"]


def test_reprinted_header_block_does_not_rename_a_field():
    """Defect 4: a field list spanning two PDF pages reprints the header block mid-stream."""
    _, fields = _parse("Tasks", [
        [
            "TaskID", "Task identifier", "Automatic identifier (8 ", "bytes)",
            "TaskName", "Task name", "String", "80",
        ],
        [
            "GUIDBranchesID", "Branch link", "String", "32",
            "IsClosed", "Closed", "Boolean",
        ],
    ])
    names = [f["name"] for f in fields]
    assert "Default value" not in names, "reprinted header captured as a field: %r" % names
    assert names == ["TaskID", "TaskName", "GUIDBranchesID", "IsClosed"], names
    got = _by_name(fields)
    assert got["GUIDBranchesID"]["key"] == "varchar" and got["GUIDBranchesID"]["size"] == 32, \
        got["GUIDBranchesID"]


def test_a_lone_header_word_used_as_a_caption_survives():
    """The mid-stream strip drops RUNS of labels only: a real item may be captioned 'Type'."""
    _, fields = _parse("Settings", [[
        "SettingType", "Type", "String", "20",
        "SettingSize", "Size", "4-byte integer",
    ]])
    got = _by_name(fields)
    assert set(got) == {"SettingType", "SettingSize"}, sorted(got)
    assert got["SettingType"]["caption"] == "Type", got["SettingType"]
    assert got["SettingSize"]["caption"] == "Size", got["SettingSize"]


def _parse_raw(name, lines, unmapped=None):
    """Parse a .table.md whose body is given verbatim, for shapes _table_md cannot express."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "%s.table.md" % name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines))
        return M.parse_table(path, unmapped)


def test_export_without_the_data_file_items_line_still_parses():
    """Some exports print the header block straight under the heading, with no anchor line.

    With that line as the only anchor, every table in such an export parsed to zero columns and
    the run still exited 0. Observed on a real 211-table export: all 211 empty.
    """
    _, fields = _parse_raw("Asset", [
        "# Asset", "", "_Type: table_", "", "## Data files and items", "",
    ] + HEADER_BLOCK + [
        "CreationUser", "CreationUser", "String", "20",
        "AssetCode", "Asset code", "String", "30",
    ])
    assert [f["name"] for f in fields] == ["CreationUser", "AssetCode"], fields


def test_a_caption_that_is_a_type_word_does_not_become_the_type():
    """'Date', 'Time', 'Currency' and 'String' are ordinary captions for the columns they name.

    Matching the caption as the type left the real type line to be read as the next field's name,
    producing items literally called 'Date (yyyymmdd)' and 'Time (hhmm)' in a real export.
    """
    _, fields = _parse_raw("Orders", [
        "Orders data file items",
    ] + HEADER_BLOCK + [
        "OrdersDate", "Date", "Date (yyyymmdd)",
        "OrderTime", "Time", "Time (hhmm)",
        "TotalIOT", "Total IOT", "Currency", "0",
    ])
    names = [f["name"] for f in fields]
    assert names == ["OrdersDate", "OrderTime", "TotalIOT"], names
    got = _by_name(fields)
    assert got["OrdersDate"]["key"] == "date", got["OrdersDate"]
    assert got["OrderTime"]["key"] == "time", got["OrderTime"]
    assert got["TotalIOT"]["default"] == "0", got["TotalIOT"]


def test_an_identifier_beginning_with_a_type_word_is_not_a_type():
    """StringValue / RealValue / DateNewsCreation are item names, not types.

    Treating them as types made the parser reject the PREVIOUS field's default value, which then
    became the next field's name. SITE_CONFIGURATION lost three of six columns to this.
    """
    _, fields = _parse_raw("SITE_CONFIGURATION", [
        "SITE_CONFIGURATION data file items",
    ] + HEADER_BLOCK + [
        "IntegerValue", "Integer value", "4-byte integer", "0",
        "StringValue", "String value", "Text Memo",
        "RealValue", "Real value", "Currency", "0.000000",
    ])
    names = [f["name"] for f in fields]
    assert names == ["IntegerValue", "StringValue", "RealValue"], names
    got = _by_name(fields)
    assert got["IntegerValue"]["default"] == "0", got["IntegerValue"]
    assert got["StringValue"]["key"] == "text", got["StringValue"]
    # a decimal default must be consumed too, or it is read as the next field's name
    assert got["RealValue"]["default"] == "0.000000", got["RealValue"]


def test_an_item_named_after_a_type_does_not_steal_the_previous_default():
    """A real export has an item called DateTime. It cost the field before it its default."""
    _, fields = _parse_raw("NLLog", [
        "NLLog data file items",
    ] + HEADER_BLOCK + [
        "Type", "Type", "4-byte integer", "0",
        "DateTime", "Date time", "Date and Time ", "(yyyymmddhhmmssccc)",
        "Details", "Details", "Unicode Text Memo",
    ])
    names = [f["name"] for f in fields]
    assert names == ["Type", "DateTime", "Details"], names
    got = _by_name(fields)
    assert got["Type"]["default"] == "0", got["Type"]
    assert got["DateTime"]["key"] == "datetime", got["DateTime"]


def test_composite_key_members_are_rejoined_across_wrapped_lines():
    """The member list wraps mid-token at the PDF column width; the size closes the entry."""
    _, fields = _parse_raw("Asset", [
        "Asset data file items",
    ] + HEADER_BLOCK + [
        "BusinessPartnerAssetC", "BusinessPartner + AssetCode",
        "Composite key: ", "BusinessPartner+AssetC", "ode", "40",
        "CreationUser", "CreationUser", "String", "20",
    ])
    got = _by_name(fields)
    assert set(got) == {"BusinessPartnerAssetC", "CreationUser"}, sorted(got)
    ck = got["BusinessPartnerAssetC"]
    assert ck["components"] == "BusinessPartner+AssetCode", ck
    assert ck["size"] == 40, ck


def test_an_unknown_type_in_the_type_position_is_reported_not_dropped():
    """No recognised type in the window means the column is dropped. Say so instead."""
    unmapped = []
    _, fields = _parse_raw("stdallergy", [
        "stdallergy data file items",
    ] + HEADER_BLOCK + [
        "allergy", "allergy", "Unicode string", "40",
        "typecode", "typecode", "Character",
    ], unmapped)
    assert [f["name"] for f in fields] == ["allergy"], fields
    assert any(u["type"] == "Character" for u in unmapped), unmapped


def test_our_own_watermark_trailer_is_not_mistaken_for_a_type():
    """Every generated .table.md ends with the wxKanban watermark. It is not source content."""
    unmapped = []
    _, fields = _parse_raw("Branches", [
        "Branches data file items",
    ] + HEADER_BLOCK + [
        "BranchName", "Branch name", "String", "60",
        "", "---", "", "<!-- wxkanban:watermark -->",
        "*Converted with wxKanban - www.wxperts.com*",
    ], unmapped)
    assert [f["name"] for f in fields] == ["BranchName"], fields
    assert unmapped == [], unmapped


def test_declared_item_count_is_read_from_the_general_information_block():
    """The analysis states its own item count; that is the completeness oracle."""
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "_schema.md")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write("\n".join([
                "## General information", "", "Generation #", "Number of data", "files",
                "Nb items", "Nb links", "Nb connections", "Nb groups",
                "1", "25", "130", "26", "0", "0",
            ]))
        assert M.declared_item_count(p) == 130
    assert M.declared_item_count(os.path.join(tmp, "gone.md")) is None


# ------------------------------------------------- truncated item names (feedback afbf1809)
# The per-table page prints item names into a fixed-width PDF column and CUTS the ones that do not
# fit: "CompanyBankAccountNo" arrives as "CompanyBankAccount". The reporter found the same field cut
# on two different data files at once, and the same class had been reported seven times before.
#
# The field recommendation was to treat the analysis Item dictionary as authoritative. These tests
# pin the reason that is not enough on its own: the dictionary is a PDF column too and cuts its own
# longest entries, and a genuinely short column often prefixes a longer item elsewhere in the app.

# Keeps the dictionary's own cut width well above the names under test, so a candidate is not
# rejected merely for being the longest thing in a small fixture.
_DECOY = ["CompanyRegistrationAuthorityDescription", "String", "200", "CompanyDetail"]

DICT_HEADER = ["Item", "Type", "Size", "Unique Key", "Key with Duplicates", "Used by..."]


def _schema_md(dict_rows, links=None):
    out = ["# Analysis", "", "## Item dictionary (p80)", ""] + DICT_HEADER + dict_rows
    out += links or []
    return "\n".join(out) + "\n"


def _corpus(tmp, pages, dict_rows, ui_pages=None):
    """Write a pre-convert/ directory and return the parsed [(table, fields)] list."""
    tables = []
    for name, body in pages:
        path = os.path.join(tmp, "%s.table.md" % name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(_table_md(name, [body]))
        tables.append(M.parse_table(path))
    with open(os.path.join(tmp, "_schema.md"), "w", encoding="utf-8") as fh:
        fh.write(_schema_md(dict_rows))
    for i, text in enumerate(ui_pages or []):
        with open(os.path.join(tmp, "WIN_Form_%d.controls.md" % i), "w", encoding="utf-8") as fh:
            fh.write(text)
    return tables


def test_the_dictionary_restores_a_name_cut_on_two_data_files_at_once():
    """The reported defect: one item, cut identically on both data files that use it."""
    pages = [
        ("CompanyDetail", ["CompanyBankAccount", "Bank account number", "String", "50"]),
        ("CompanySetup", ["CompanyBankAccount", "Bank account number", "String", "50"]),
    ]
    rows = ["CompanyBankAccountNo", "String", "50", "CompanyDetail",
            "String", "50", "CompanySetup"] + _DECOY
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows)
        applied, unresolved = M.recover_truncated_names(tables, tmp)
    assert sorted(a[0] for a in applied) == ["CompanyDetail", "CompanySetup"], applied
    assert {a[2] for a in applied} == {"CompanyBankAccountNo"}, applied
    assert unresolved == [], unresolved
    for _, fields in tables:
        assert [f["name"] for f in fields] == ["CompanyBankAccountNo"]


def test_the_row_caption_restores_the_name_without_any_cross_reference():
    """The caption sits in a wider column on the SAME row, so it needs no dictionary at all."""
    pages = [("CompanyDetail", ["CompanyBankAccount", "CompanyBankAccountNo", "String", "50"])]
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, _DECOY)
        applied, _ = M.recover_truncated_names(tables, tmp)
    assert [(a[1], a[2], a[3]) for a in applied] == [
        ("CompanyBankAccount", "CompanyBankAccountNo", "row caption")], applied


def test_a_caption_that_merely_describes_the_field_is_not_used_as_a_name():
    """'Bank account number' extends nothing and is not an identifier: it must not become a name."""
    pages = [("CompanyDetail", ["CompanyBankAccountNumber", "Bank account number detail",
                                "String", "50"])]
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, _DECOY)
        applied, _ = M.recover_truncated_names(tables, tmp)
    assert applied == [], applied


def test_a_short_column_that_merely_prefixes_a_longer_item_is_left_alone():
    """The dictionary alone proposes this rename on real exports; it is wrong 254 times over.

    'BusinessPartner' is a real foreign key. It is also a prefix of the optimizer's composite-key
    entry 'BusinessPartnerChargeCode'. Only its LENGTH says it was never cut.
    """
    pages = [("InvoiceCostRate", [
        "BusinessPartner", "Business partner", "String", "30",
        "ExternalServiceDescription", "Service description", "String", "80"])]
    rows = ["BusinessPartnerChargeCode", "String", "30", "InvoiceCostRate"] + _DECOY
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows)
        applied, unresolved = M.recover_truncated_names(tables, tmp)
    assert applied == [], applied
    assert unresolved == [], unresolved
    assert "BusinessPartner" in [f["name"] for _, fl in tables for f in fl]


def test_an_item_used_by_a_different_data_file_does_not_rename_this_one():
    """'Used by...' is what ties a candidate to THIS table rather than to the app in general."""
    pages = [("CompanyDetail", ["CompanyBankAccount", "Bank account", "String", "50"])]
    rows = ["CompanyBankAccountNo", "String", "50", "SomewhereElse"] + _DECOY
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows)
        applied, unresolved = M.recover_truncated_names(tables, tmp)
    assert applied == [], applied


def test_two_candidates_are_reported_rather_than_guessed():
    pages = [("Notes", ["AdvanceBeneficiaryNot", "Advance notice", "String", "50"])]
    rows = ["AdvanceBeneficiaryNoticeChoice", "String", "50", "Notes",
            "AdvanceBeneficiaryNoticeDate", "Date", "8", "Notes"] + _DECOY
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows)
        applied, unresolved = M.recover_truncated_names(tables, tmp)
    assert applied == [], applied
    assert len(unresolved) == 1 and len(unresolved[0][2]) == 2, unresolved
    assert "several dictionary items" in unresolved[0][3], unresolved


def test_a_dictionary_entry_at_its_own_column_width_is_not_written_into_the_ddl():
    """Swapping a cut name for another cut name is not a repair, so this one is reported."""
    pages = [("GRNSummary", ["InboundHeaderReferen", "Inbound reference", "String", "40"])]
    # The only candidate is itself the longest entry in the dictionary -> suspected cut.
    rows = ["InboundHeaderReferenceBusinessPartner", "String", "40", "GRNSummary"]
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows)
        applied, unresolved = M.recover_truncated_names(tables, tmp)
    assert applied == [], applied
    assert len(unresolved) == 1 and "itself at its column width" in unresolved[0][3], unresolved


def test_a_control_data_binding_names_the_item_in_full():
    """The UI binding is not column-truncated, and it is scoped to one data file."""
    pages = [("BookingDetail", ["InboundHeaderReferen", "Inbound reference", "String", "40"])]
    rows = ["InboundHeaderReferenceBusinessPartner", "String", "40", "BookingDetail"]
    ui = ["Control EDT_Ref\nData binding\nBookingDetail.InboundHeaderReference\n"]
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows, ui_pages=ui)
        applied, _ = M.recover_truncated_names(tables, tmp)
    assert [(a[2], a[3]) for a in applied] == [
        ("InboundHeaderReference", "control binding")], applied


def test_the_table_pages_cannot_seed_the_binding_oracle_with_their_own_cut_names():
    """Harvesting must skip *.table.md, or the cut spelling would confirm itself."""
    with tempfile.TemporaryDirectory() as tmp:
        with open(os.path.join(tmp, "X.table.md"), "w", encoding="utf-8") as fh:
            fh.write("X.SomeItemNameHere\n")
        assert M.harvest_control_bindings(tmp, ["X"]) == {}


def test_captions_separate_columns_the_cut_collapsed_onto_one_name():
    """Six distinct items cut to one string emitted six identical columns - invalid SQL."""
    body = []
    for suffix in ("normal", "tangential", "impoverished"):
        body += ["mse_thoughtproduction", "mse_thoughtproduction_%s" % suffix, "Boolean", "1"]
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, [("Progress", body)], _DECOY)
        M.recover_truncated_names(tables, tmp)
    names = [f["name"] for _, fl in tables for f in fl]
    assert len(names) == len(set(names)) == 3, names


def test_an_export_with_no_truncation_is_left_completely_untouched():
    """The property that matters most: a document this stage already reads right must not change."""
    pages = [("Product", ["ProductID", "Product identifier", "Automatic identifier (8 ", "bytes)",
                          "ProductLabel", "Label", "String", "60"])]
    rows = ["ProductLabel", "String", "60", "Product",
            "ProductLabelExtendedDescription", "String", "200", "Elsewhere"] + _DECOY
    with tempfile.TemporaryDirectory() as tmp:
        tables = _corpus(tmp, pages, rows)
        applied, unresolved = M.recover_truncated_names(tables, tmp)
    assert (applied, unresolved) == ([], []), (applied, unresolved)


def test_foreign_keys_follow_a_restored_column_name():
    """emit_ddl writes the link's item name straight into the ALTER TABLE and never checks it."""
    applied = [("CompanyDetail", "CompanyBankAccount", "CompanyBankAccountNo", "row caption")]
    links = [("Bank", "BankID", "CompanyDetail", "CompanyBankAccount"),
             ("Other", "OtherID", "Untouched", "OtherRef")]
    assert M.apply_renames_to_links(links, applied) == [
        ("Bank", "BankID", "CompanyDetail", "CompanyBankAccountNo"),
        ("Other", "OtherID", "Untouched", "OtherRef")]


def test_the_dictionary_keeps_an_item_named_after_a_type():
    """An item called 'Date' must not be read as the type line of the group above it."""
    rows = ["Date", "Date", "8", "Invoice", "Amount", "Currency", "8", "Invoice"]
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "_schema.md")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(_schema_md(rows))
        items = M.parse_item_dictionary(p, ["Invoice"])
    assert items == {"Date": {"invoice"}, "Amount": {"invoice"}}, items


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = []
    for t in tests:
        try:
            t()
            print("PASS %s" % t.__name__)
        except AssertionError as err:
            failures.append((t.__name__, err))
            print("FAIL %s: %s" % (t.__name__, err))
    print("\n%d/%d passed" % (len(tests) - len(failures), len(tests)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
