"""SPEC-044 FR-011 §2-4: --type-map answers for Array/JSON/UUID, restored refusal guidance, and
composite keys kept out of the name-collision check. The source-fidelity contract itself is
covered by test_boundaries.py (from the feedback 2634b849 reporter)."""
import importlib.util
import json
import tempfile
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("operator_schema", SCRIPTS / "pcsoft-schema-to-sql.py")
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

HEADER = ("# T\n_Source: PDF pages 10-11_\nT data file items\nCaption\nType\nSize\nUnique Key\n"
          "Key with Duplicates\nDirection\nGDPR\nDefault value\n")


@pytest.fixture(autouse=True)
def clean_mappings():
    M._OPERATOR_MAPPINGS.clear()
    saved = list(M.HFSQL)
    yield
    M._OPERATOR_MAPPINGS.clear()
    M.HFSQL[:] = saved


def parse(body):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "T.table.md"
        path.write_text(HEADER + body, encoding="utf-8")
        diagnostics = []
        return M.parse_table(str(path), diagnostics)[1], diagnostics


def blockers(fields):
    return {d["code"] for d in M.validate_source_tables([("T", fields)])}


ARRAYS = "StartTime\nStarttime\nArray of 7 Time (hhmm)\nScores\nScores\nArray of 3 Unsigned\n2-byte integer\n"


def test_unmapped_array_blocks_as_before():
    fields, _ = parse(ARRAYS)
    assert [f["mapping_status"] for f in fields] == ["unresolved", "unresolved"]
    assert "TARGET_MAPPING_UNRESOLVED" in blockers(fields)


def test_array_family_answer_clears_every_array():
    M.register_type_overrides(["Array=text"])
    fields, diagnostics = parse(ARRAYS)
    assert [(f["key"], f["mapping_status"]) for f in fields] == [("text", "operator"), ("text", "operator")]
    assert [f["operator_mapping"]["label"] for f in fields] == ["Array", "Array"]
    # The source descriptor is kept: the mapping is a decision on top of it, not a rewrite.
    assert fields[0]["source_type"]["kind"] == "array" and fields[0]["source_type"]["dimensions"] == [7]
    assert not any(d["code"] == "TARGET_MAPPING_UNRESOLVED" for d in diagnostics)
    assert blockers(fields) == set()


def test_exact_label_wins_over_family_with_or_without_format():
    M.register_type_overrides(["Array=text", "Array of 7 Time=blob", "Array of 3 Unsigned 2-byte integer=text"])
    fields, _ = parse(ARRAYS)
    assert fields[0]["key"] == "blob" and fields[0]["operator_mapping"]["label"] == "Array of 7 Time"
    assert fields[1]["operator_mapping"]["label"] == "Array of 3 Unsigned 2-byte integer"


def test_json_and_uuid_families():
    M.register_type_overrides(["JSON=text", "UUID=text"])
    fields, _ = parse("Payload\nPayload\nJSON\nGuid\nGuid\nUUID (128 bits)\n")
    assert [(f["name"], f["key"], f["mapping_status"]) for f in fields] == [
        ("Payload", "text", "operator"), ("Guid", "text", "operator")]
    assert blockers(fields) == set()


def test_family_word_is_not_a_type_for_captions():
    # 'UUID=text' must not make a caption reading just 'UUID' look like a type line.
    M.register_type_overrides(["UUID=text"])
    fields, _ = parse("Ident\nUUID\nUnicode string\n36\nNote\nNote\nUnicode string\n10\n")
    assert [(f["name"], f["caption"], f["key"]) for f in fields] == [
        ("Ident", "UUID", "uvarchar"), ("Note", "Note", "uvarchar")]


def test_incomplete_array_is_never_mappable():
    M.register_type_overrides(["Array=text"])
    fields, _ = parse("Odd\nOdd\nArray of 4 Widget\nNext\nNext\nBoolean\n")
    assert fields[0]["mapping_status"] == "unresolved"
    assert "TYPE_DECLARATION_INCOMPLETE" in blockers(fields)


def test_composite_keys_sharing_a_cut_name_do_not_collide():
    body = ("A\nA\n4-byte integer\nB\nB\n4-byte integer\nC\nC\n4-byte integer\n"
            "OptimCompKey_A\nComposite key added by Query\nComposite key: \nA+B\n8\n"
            "OptimCompKey_A\nComposite key added by Query\nComposite key: \nA+C\n8\n")
    fields, _ = parse(body)
    assert [f["key"] for f in fields].count("composite") == 2
    assert "CANONICAL_NAME_COLLISION" not in blockers(fields)


def test_columns_sharing_a_name_still_collide():
    fields, _ = parse("Total\nTotal\n4-byte integer\nTotal\nTotal\n4-byte integer\n")
    assert "CANONICAL_NAME_COLLISION" in blockers(fields)


def test_refusal_says_what_to_do_next(capsys):
    fields, _ = parse(ARRAYS)
    with tempfile.TemporaryDirectory() as out:
        code = M.report_unmapped(M.validate_source_tables([("T", fields)]), out)
        payload = json.loads((Path(out) / "_unmapped-types.json").read_text(encoding="utf-8"))
    err = capsys.readouterr().err
    assert code == 3
    assert '--type-map "Array of 7 Time (hhmm)=<key>"' in err
    assert '--type-map "Array=<key>"' in err
    assert "Valid keys:" in err and "text" in err
    assert "project_submit_feedback" in err
    assert payload["diagnosticsVersion"] == 2
