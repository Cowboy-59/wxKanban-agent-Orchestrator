"""Source-identity assertions independent of PostgreSQL mappings."""
import importlib.util
import os
from pathlib import Path
import tempfile

SCRIPTS = Path(os.environ.get('STAGE3_SCRIPTS') or Path(__file__).resolve().parent)
spec = importlib.util.spec_from_file_location('boundary_schema', SCRIPTS / 'pcsoft-schema-to-sql.py')
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

def parse(body):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'T.table.md'
        path.write_text('# T\n_Source: PDF pages 10-11_\nT data file items\nCaption\nType\nSize\nUnique Key\nKey with Duplicates\nDirection\nGDPR\nDefault value\n' + body, encoding='utf-8')
        diagnostics = []
        return M.parse_table(str(path), diagnostics)[1], diagnostics

def test_monday_array_and_boolean():
    fields, diagnostics = parse('MondayTime\nMondaytime\nArray of 3 Time\n(hhmmsscc)\nMondayFlag\nMondayflag\nBoolean\n0\n')
    assert [f['name'] for f in fields] == ['MondayTime', 'MondayFlag']
    assert fields[0]['source_type']['dimensions'] == [3]
    assert fields[0]['source_type']['format'] == 'hhmmsscc'
    assert fields[0]['default'] is None and fields[1]['default'] == '0'
    assert fields[0]['mapping_status'] == 'unresolved'

def test_books_two_arrays_then_scalar():
    fields, _ = parse('StartTime\nStarttime\nArray of 7 Time (hhmm)\nEndTime\nEndtime\nArray of 7 Time (hhmm)\nBookOrder\nBook order\nUnsigned 2-byte integer\n0\n')
    assert [f['name'] for f in fields] == ['StartTime', 'EndTime', 'BookOrder']
    assert fields[2]['key'] == 'uint2'

def test_unsigned_array_retains_width_and_sign():
    fields, _ = parse('BankCount\nBankcount\nArray of 15 Unsigned\n4-byte integer\nNextID\nNext id\n8-byte integer\n0\n')
    assert [f['name'] for f in fields] == ['BankCount', 'NextID']
    assert fields[0]['source_type']['dimensions'] == [15]
    assert fields[0]['source_type']['element']['unsigned'] is True
    assert fields[0]['source_type']['element']['bytes'] == 4

def test_uuid_does_not_consume_datetime():
    fields, _ = parse('MasterPayLogID\nMasterPayLog ID\nUUID (128 bits)\n00000000-0\nLogDateTime\nLogDateTime\nDate and Time\n(yyyymmddhhmmssccc)\n')
    assert [f['name'] for f in fields] == ['MasterPayLogID', 'LogDateTime']
    assert fields[0]['source_type']['kind'] == 'uuid'
    assert fields[1]['key'] == 'datetime'

def test_both_json_records_and_online_id():
    fields, diagnostics = parse('PaymentDetails\nPaymentDetails\nJSON\nPaymentData\nPaymentData\nJSON\nOnlineId\nOnlineId\n8-byte integer\n0\n')
    assert [f['name'] for f in fields] == ['PaymentDetails', 'PaymentData', 'OnlineId']
    assert sum(d.get('code') == 'TARGET_MAPPING_UNRESOLVED' for d in diagnostics) == 2

def test_label_array_and_composite():
    fields, _ = parse('Label\nLabel\nArray of 20 String\n50\nTypeDescription\nType + Description\nComposite key:\nType+Description\n60\n')
    assert [f['name'] for f in fields] == ['Label', 'TypeDescription']
    assert fields[0]['source_type']['element']['width'] == 50
    assert fields[1]['components'] == 'Type+Description'

def test_dollar_caption_is_not_type():
    fields, diagnostics = parse('TABLE_ServiceDeptSales\n%\nArray of 100 4-byte\ninteger\nTABLE_ServiceDeptSales\nDollar\nArray of 100 Currency\n')
    assert len(fields) == 2
    assert fields[1]['caption'] == 'Dollar'
    assert fields[0]['source_row_id'] != fields[1]['source_row_id']
    assert not any(d.get('type') == 'Dollar' or d.get('field') == 'integer' for d in diagnostics)

def test_unknown_type_keeps_following_field():
    fields, diagnostics = parse('Mystery\nMystery\nUnrecognisedKind\nNextID\nNextID\n8-byte integer\n0\n')
    assert [f['name'] for f in fields] == ['Mystery', 'NextID']
    assert any(d.get('code') == 'SOURCE_TYPE_UNKNOWN' for d in diagnostics)

def test_ambiguous_link_rename_is_blocked():
    diagnostics = []
    result = M.apply_renames_to_links([('T', 'CutName', 'Child', 'ParentID')], [('T', 'CutName', 'FirstName', 'source'), ('T', 'CutName', 'SecondName', 'source')], diagnostics=diagnostics)
    assert result == []
    assert any(d['code'] == 'RELATIONSHIP_ENDPOINT_AMBIGUOUS' for d in diagnostics)

def test_override_after_parse_does_not_flatten_parsed_array():
    # SPEC-044 FR-011 (owner decision B, 2026-10-25): --type-map MAY map an array, but only as
    # an explicit operator choice applied while parsing (test_stage3_operator_mappings.py). A field
    # already parsed stays unresolved and still cannot reach a scalar column type.
    fields, _ = parse('Flags\nFlags\nArray of 7 Boolean\n')
    M.register_type_overrides(['Array of 7 Boolean=boolean'])
    try:
        assert fields[0]['mapping_status'] == 'unresolved'
        try:
            M.col_type(fields[0], 'postgres')
        except SystemExit:
            pass
        else:
            raise AssertionError('structured field reached a scalar target mapping')
    finally:
        M.HFSQL[:] = [x for x in M.HFSQL if x[0] != 'Array of 7 Boolean']
        M._OPERATOR_MAPPINGS.clear()

def test_caption_and_type_joined_by_pdf_text_run():
    fields, _ = parse('ScreenOffset\nScreen horizontal offset (index or Unsigned 4-byte integer\n0\nReceiptPrinter\nReceipt Printing Device\nString\n30\n')
    assert [f['name'] for f in fields] == ['ScreenOffset', 'ReceiptPrinter']
    assert fields[0]['key'] == 'uint4' and fields[0]['default'] == '0'
    assert fields[0]['caption'] == 'Screen horizontal offset (index or'

def test_boundary_ambiguity_blocks_emission():
    fields, _ = parse('Name\nCaption only\n')
    blockers = M.validate_source_tables([('T', fields)])
    assert any(d['code'] == 'FIELD_BOUNDARY_AMBIGUOUS' for d in blockers)

def test_incomplete_array_declaration_blocks_emission():
    fields, _ = parse('Values\nValues\nArray of 7 Unsigned\nNext\nNext\nBoolean\n0\n')
    assert [f['name'] for f in fields] == ['Values', 'Next']
    assert any(d['code'] == 'TYPE_DECLARATION_INCOMPLETE' for d in M.validate_source_tables([('T', fields)]))

def test_diagnostics_redact_schema_literals():
    fields, diagnostics = parse('Details\nPassword = "SYNTHETIC-DIAGNOSTIC-SECRET"\nJSON\n')
    import json
    assert 'SYNTHETIC-DIAGNOSTIC-SECRET' not in json.dumps(diagnostics)
    assert '[[CRED-' in json.dumps(diagnostics)

def test_main_refuses_before_emitters():
    from unittest.mock import patch
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / 'src'
        out = Path(tmp) / 'out'
        src.mkdir()
        (src / 'T.table.md').write_text('T data file items\nCaption\nType\nSize\nUnique Key\nKey with Duplicates\nDirection\nGDPR\nDefault value\nFlags\nFlags\nArray of 7 Boolean\n', encoding='utf-8')
        with patch('sys.argv', ['pcsoft-schema-to-sql.py', '--dialect', 'postgres', '--src', str(src), '--out', str(out), '--fail-on-secrets']), patch.object(M, 'emit_ddl', side_effect=AssertionError('DDL emitter reached')), patch.object(M, 'emit_er', side_effect=AssertionError('ER emitter reached')):
            assert M.main() == 3
        assert not list(out.glob('*.sql'))
        assert not (out / 'ER-diagram.md').exists()

def test_per_element_defaults_are_retained_as_annotations():
    fields, diagnostics = parse('Flags\nFlags\nArray of 3 Boolean\n0\n0\n0\nNext\nNext\nBoolean\n1\n')
    assert [f['name'] for f in fields] == ['Flags', 'Next']
    assert fields[0]['array_default_annotations'] == ['0', '0', '0']
    assert fields[0]['default'] is None and fields[1]['default'] == '1'
    assert not any(d['code'] == 'FIELD_BOUNDARY_AMBIGUOUS' for d in M.validate_source_tables([('T', fields)]))

def test_clipped_guid_string_default_is_not_a_new_field():
    fields, _ = parse('Reference\nReference\nString\n50\n00000000-0\nNext\nNext\nBoolean\n0\n')
    assert [f['name'] for f in fields] == ['Reference', 'Next']
    assert fields[0]['source_annotations'] == ['00000000-0']

def test_scalar_raw_type_format_and_identifier_tail_retained():
    fields, _ = parse('ID\nID\nAutomatic identifier (8\nbytes)\nWhen\nWhen\nDate and Time\n(yyyymmddhhmmssccc)\n')
    assert fields[0]['source_type']['raw'] == ['Automatic identifier (8', 'bytes)']
    assert fields[1]['source_type']['format'] == 'yyyymmddhhmmssccc'
    assert fields[1]['source_type']['raw'] == ['Date and Time', '(yyyymmddhhmmssccc)']

def test_name_collision_is_blocked_without_deduplicating_records():
    fields, _ = parse('PrintedPrefix\nFirst\nArray of 3 String\n20\nPrintedPrefix\nSecond\nArray of 3 String\n20\n')
    diagnostics = M.validate_source_tables([('T', fields)])
    assert len(fields) == 2
    collisions = [d for d in diagnostics if d['code'] == 'CANONICAL_NAME_COLLISION']
    assert len(collisions) == 2 and collisions[0]['source_row_id'] != collisions[1]['source_row_id']

def test_foreign_key_planning_remains_structural_and_offline():
    parent, _ = parse('ID\nID\nAutomatic identifier (8\nbytes)\n')
    child, _ = parse('ID\nID\nAutomatic identifier (8\nbytes)\nParentID\nParentID\n8-byte integer\n0\n')
    links = [('Parent', 'ID', 'Child', 'ParentID')]
    declared, pending = M.plan_foreign_keys([('Parent', parent), ('Child', child)], links)
    assert declared == links and pending == []

def test_ambiguous_relationship_occurrences_remain_distinct():
    diagnostics = []
    links = [('T', 'Cut', 'A', 'ID'), ('T', 'Cut', 'B', 'ID')]
    result = M.apply_renames_to_links(links, [('T', 'Cut', 'First', 'source'), ('T', 'Cut', 'Second', 'source')], diagnostics=diagnostics)
    assert result == [] and len(diagnostics) == 2
    assert diagnostics[0]['source_row_id'] != diagnostics[1]['source_row_id']
    assert [d['source_relationship'] for d in diagnostics] == [list(x) for x in links]
