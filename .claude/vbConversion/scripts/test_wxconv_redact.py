"""SCOPE-125 / T002 — pattern, token and safety tests for the conversion redaction module.

Dependency-free: run directly with `python test_wxconv_redact.py` (exit 0 = pass).
Mirrors shared/watermark/python/test_wxkanban_watermark.py in style and harness.

The negative tests matter as much as the positive ones. A redactor that scores perfectly on
"no credential values in output" by deleting credential-bearing code would pass every positive
test here and still be a worse defect than the one it fixes — the record of WHICH procedures
handle credentials is exactly what the rebuild needs.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wxconv_redact as rd  # noqa: E402


def _red(text, source=""):
    state = rd.RedactionState()
    out, found = rd.redact(text, state, source=source)
    return out, found, state


# ---------------------------------------------------------------------------- keyed literals

def test_keyed_every_credential_key():
    for key in rd.CRED_KEYS:
        src = '%s = "hunter2"' % key
        out, found, _ = _red(src)
        assert len(found) == 1, "key %r produced %d findings" % (key, len(found))
        assert "hunter2" not in out, "key %r left the value in place" % key


def test_keyed_bare_user_windev_member_syntax():
    # The gap in the original field report: WinDev HFSQL uses ..User alongside ..Password, so
    # omitting the bare `user` key lets the username half of the commonest pattern through.
    out, found, _ = _red('MyConn..User = "sa"\nMyConn..Password = "hunter2"')
    assert len(found) == 2
    assert [f.key for f in found] == ["user", "password"]
    assert "sa" not in out and "hunter2" not in out


def test_keyed_case_insensitive_and_assignment_forms():
    for src in ('PASSWORD = "x"', 'Pwd:"x"', 'UID := "x"', 'Api_Key="x"'):
        out, found, _ = _red(src)
        assert len(found) == 1, "no match for %r" % src
        assert '"x"' not in out


def test_keyed_multi_word_keys():
    out, found, _ = _red('Data Source = "server01"\nInitial Catalog = "sales"')
    assert [f.key for f in found] == ["data source", "initial catalog"]


# ---------------------------------------------------------------------------- clarion OWNER

def test_clarion_owner_attribute():
    src = "CUSTOMER FILE,DRIVER('MSSQL'),OWNER('srv,db,sa,hunter2')"
    out, found, _ = _red(src)
    assert len(found) == 1 and found[0].key == "owner"
    assert "hunter2" not in out
    assert "DRIVER('MSSQL')" in out, "OWNER redaction must not disturb sibling attributes"


# ---------------------------------------------------------------------------- positional args

def test_positional_hdescribeconnection():
    out, found, _ = _red('HDescribeConnection("C1", "sa", "hunter2", "srv", "db")')
    assert [f.key for f in found] == ["user", "password"]
    assert '"C1"' in out and '"srv"' in out, "non-credential positions must survive"
    assert "sa" not in out and "hunter2" not in out


def test_positional_ado_open_without_parentheses():
    out, found, _ = _red('cn.Open sCs, "sa", "hunter2"')
    assert [f.key for f in found] == ["user", "password"]


def test_positional_skips_nested_call_arguments():
    out, found, _ = _red('HDescribeConnection(Build("a","b"), "sa", "hunter2")')
    assert [f.key for f in found] == ["user", "password"]
    assert '"a"' in out and '"b"' in out


# ------------------------------------------------------------------- embedded connection strings

def test_embedded_connection_string_is_redacted_whole():
    out, found, _ = _red('cn.ConnectionString = "Provider=SQLOLEDB;uid=sa;pwd=hunter2"')
    assert len(found) == 1
    assert "sa" not in out and "hunter2" not in out and "SQLOLEDB" not in out


def test_embedded_connection_string_without_a_key():
    out, found, _ = _red('cn.Open "Provider=SQLOLEDB;uid=sa;pwd=hunter2"')
    assert len(found) == 1 and found[0].key == "connection string"


# ---------------------------------------------------------------------------- NEGATIVE cases

def test_negative_parameter_passing_is_untouched():
    # The single most important negative: this is the analytical signal the rebuild needs.
    for src in ("Password = Arg.Something", "..User = sConfigUser", "pwd := GetSecret()"):
        out, found, _ = _red(src)
        assert out == src, "modified %r" % src
        assert found == []


def test_hungarian_notation_is_matched():
    # VB6 names things this way almost universally. A plain \b anchor walks straight past all of
    # it, because there is no word boundary between the prefix and the key. This gap was found by
    # an end-to-end conversion run, NOT by the unit tests — the tests had been written from the
    # same wrong assumption as the pattern, so they agreed with it.
    for src in (
        'gsPassword = "R3port!Pass"',
        'gsUser = "reportsvc"',
        'm_sPassword = "x"',
        'txtPassword.Text = "x"',
        'sPwd = "x"',
    ):
        out, found, _ = _red(src)
        assert len(found) == 1, "missed Hungarian-notation credential: %r" % src
        assert '"x"' not in out or "x" not in out.split("=")[1]


def test_negative_word_boundary_does_not_overmatch():
    # `CurrentUserName` hits a camel hump at `User` but is not followed by an assignment.
    # `fluid`/`liquid` contain `uid` inside a lowercase run, which _key_start_ok rejects.
    for src in (
        'CurrentUserName = "Sales"',
        'passwordhash = "abc"',
        'newpwd = "abc"',
        'fluid = "water"',
        'liquid = "water"',
    ):
        out, found, _ = _red(src)
        assert out == src, "over-matched %r -> %r" % (src, out)


def test_negative_recordset_open_sql_is_not_redacted():
    src = 'rs.Open "SELECT * FROM customers", cn'
    out, found, _ = _red(src)
    assert out == src, "a SQL statement must never be redacted"


def test_negative_unterminated_quote_cannot_consume_the_page():
    src = 'password = "unterminated\nreal content on the next line must survive\nand this line too'
    out, found, _ = _red(src)
    assert out == src
    assert "real content on the next line must survive" in out


def test_negative_clean_text_returned_byte_identical():
    # Fidelity: the stage runs upstream of page classification, so text with no credentials must
    # come back exactly as it went in.
    src = "# Element\n\n## Control code\n\nIF x = 1 THEN Info(\"hello\")\n"
    out, found, _ = _red(src)
    assert out == src and found == []


def test_no_dotall_patterns_are_line_bounded():
    for pattern in (rd.KEYED_RE, rd.OWNER_RE, rd.QUOTED_RE):
        assert not (pattern.flags & 16), "%r compiled with DOTALL" % pattern  # re.DOTALL == 16


# ---------------------------------------------------------------------------- token allocation

def test_tokens_are_stable_across_occurrences_and_files():
    state = rd.RedactionState()
    a, _ = rd.redact('password = "hunter2"', state, source="a.md")
    b, _ = rd.redact('pwd = "hunter2"', state, source="b.md")
    c, _ = rd.redact('secret = "different"', state, source="c.md")
    token = a[a.index("[["):a.index("]]") + 2]
    assert token in b, "same value must reuse the same token across files"
    assert token not in c, "a different value must get a different token"
    assert state.distinct_count == 2
    assert len(state.findings) == 3, "occurrences accumulate even when the token is reused"


def test_token_is_safe_in_markdown_json_sql_and_tsx():
    out, _, _ = _red('password = "hunter2"')
    token = out[out.index("[["):out.index("]]") + 2]
    # Angle brackets would parse as a raw HTML tag in GitHub-flavoured Markdown and could be
    # swallowed by the renderer — and Markdown is this pipeline's primary output format.
    assert "<" not in token and ">" not in token
    assert '"' not in token and "\\" not in token, "must need no escaping inside a JSON string"
    assert "\n" not in token


# ---------------------------------------------------------------------------- value containment

def test_findings_have_no_value_field_at_all():
    assert not hasattr(rd.Finding("t", "k", 1), "value")
    fields = rd.Finding.__dataclass_fields__
    assert set(fields) == {"token", "key", "line", "source"}


def test_state_repr_never_discloses_the_map():
    state = rd.RedactionState()
    rd.redact('password = "hunter2"', state)
    assert "hunter2" not in repr(state)


def test_line_numbers_are_reported():
    out, found, _ = _red('line one\nline two\npassword = "hunter2"')
    assert found[0].line == 3


# ---------------------------------------------------------------------------- scan mode

def test_scan_is_read_only_and_allocates_nothing():
    src = 'password = "hunter2"'
    found = rd.scan(src, source="analysis/domains.json")
    assert len(found) == 1
    assert found[0].token == "", "scan must not allocate tokens"
    assert found[0].source == "analysis/domains.json"
    assert found[0].line == 1


def test_scan_finds_the_reported_leak_shape():
    # The confirmed leak: credential literals in an ad-hoc JSON artifact with no producer script.
    src = '{\n  "connection": {\n    "uid": "sa",\n    "password": "hunter2"\n  }\n}'
    found = rd.scan(src, source="analysis/domains.json")
    assert len(found) == 2
    assert [f.line for f in found] == [3, 4]


# ---------------------------------------------------------------------------- idempotence

def test_redaction_is_idempotent():
    # Two passes run over the same text BY DESIGN: clean_text() redacts each PDF page, then
    # write_text() re-scrubs every emitted file as defence in depth. The second pass must be a
    # no-op, or it allocates a token for the token.
    state = rd.RedactionState()
    once, _ = rd.redact('password = "hunter2"', state)
    twice, second = rd.redact(once, state)
    assert twice == once, "second pass changed the text"
    assert second == [], "second pass produced findings"
    assert state.distinct_count == 1, "second pass allocated a token for a token"


def test_scanning_redacted_output_reports_zero():
    # This is success metric 1: scan the output of a redacted run, expect 0 matches.
    state = rd.RedactionState()
    out, _ = rd.redact('uid = "sa"\npwd = "hunter2"\nOWNER(\'srv,db,sa,pw\')', state)
    assert rd.scan(out) == []


# ---------------------------------------------------------------------------- write funnel (T004)

def test_write_text_redacts_and_watermarks_markdown():
    import tempfile
    import wxkanban_watermark as wm

    state = rd.RedactionState()
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "out.md")
        size = rd.write_text(p, '# El\n\npassword = "hunter2"\n', state)
        body = open(p, encoding="utf-8").read()
    assert "hunter2" not in body, "the funnel must redact"
    assert "[[CRED-01]]" in body
    # SCOPE-082 regression guard: five of the scripts routed through this funnel never had
    # watermarking, so an implementer generalising write() is exactly who drops the stamp.
    assert wm.verify_markdown(body)["present"] is True, "the funnel must preserve the watermark"
    assert size == len(body.encode("utf-8"))
    assert len(state.findings) == 1


def test_write_text_dry_run_writes_nothing_but_still_reports():
    import tempfile

    state = rd.RedactionState()
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "out.sql")
        size = rd.write_text(p, 'uid = "sa"', state, dry_run=True)
        assert not os.path.exists(p), "dry run must not create a file"
    assert size > 0 and len(state.findings) == 1


def test_write_text_accumulates_findings_across_files():
    import tempfile

    state = rd.RedactionState()
    with tempfile.TemporaryDirectory() as d:
        rd.write_text(os.path.join(d, "a.sql"), 'pwd = "hunter2"', state)
        rd.write_text(os.path.join(d, "b.sql"), 'pwd = "hunter2"', state)
    assert len(state.findings) == 2, "one finding per occurrence"
    assert state.distinct_count == 1, "one credential, not two"
    assert {f.source for f in state.findings} == {"a.sql", "b.sql"}


def test_write_text_non_markdown_is_not_watermarked():
    import tempfile

    state = rd.RedactionState()
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "schema.sql")
        rd.write_text(p, "CREATE TABLE t (id int);\n", state)
        body = open(p, encoding="utf-8").read()
    assert body == "CREATE TABLE t (id int);\n", "clean non-md content must pass through untouched"


# ---------------------------------------------------------------------------- sidecar (T005)

def test_sidecar_never_contains_a_value_in_any_form():
    state = rd.RedactionState()
    rd.redact('password = "hunter2"\nuid = "administrator"', state, source="x.page.md")
    out = rd.render_sidecar(state)
    assert "hunter2" not in out and "administrator" not in out
    # Not truncated, not masked, not hashed — a partial mask is a disclosure.
    for fragment in ("hunt", "hun***", "h*****2", "admin"):
        assert fragment not in out, "sidecar leaked %r" % fragment


def test_sidecar_states_rotation_disclosure_and_limits():
    state = rd.RedactionState()
    rd.redact('pwd = "x"', state, source="a.md")
    out = rd.render_sidecar(state).lower()
    assert "rotate" in out, "must tell the developer to rotate"
    assert "does not undo prior disclosure" in out
    assert "not a guarantee" in out, "must not overstate coverage"


def test_sidecar_reports_token_key_file_and_line():
    state = rd.RedactionState()
    rd.redact('line1\npassword = "x"', state, source="els/Cust.page.md")
    out = rd.render_sidecar(state)
    assert "els/Cust.page.md" in out and "| 2 |" in out and "password" in out


# ---------------------------------------------------------------------------- summary + gate (T006)

def test_summary_line_is_explicit_when_clean_and_when_not():
    empty = rd.RedactionState()
    assert "none found" in rd.summary_line(empty, "x/_redactions.md")

    state = rd.RedactionState()
    rd.redact('pwd = "x"', state, source="a.md")
    line = rd.summary_line(state, "out/_redactions.md")
    assert "REDACTED 1" in line and "out/_redactions.md" in line
    assert "ROTATE" in line, "the summary is the signal whose absence is the defect"


def test_fail_on_secrets_defaults_off():
    assert rd.exit_code(5, fail_on_secrets=False) == 0, "redaction runs; the hard stop is opt-in"
    assert rd.exit_code(5, fail_on_secrets=True) == 1
    assert rd.exit_code(0, fail_on_secrets=True) == 0


# ---------------------------------------------------------------------------- scan mode (T007)

def test_scan_tree_is_read_only_and_finds_the_reported_leak_shape():
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "analysis"))
        leak = os.path.join(d, "analysis", "domains.json")
        payload = '{\n  "conn": {\n    "uid": "sa",\n    "password": "hunter2"\n  }\n}'
        with open(leak, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.makedirs(os.path.join(d, "node_modules", "pkg"))
        with open(os.path.join(d, "node_modules", "pkg", "x.json"), "w", encoding="utf-8") as fh:
            fh.write('{"password": "should-be-skipped"}')

        before = open(leak, encoding="utf-8").read()
        found = rd.scan_tree(d)
        after = open(leak, encoding="utf-8").read()

    assert after == before, "scan mode must not modify anything"
    assert len(found) == 2, "must find the ad-hoc JSON artifact that has no producer script"
    assert all("node_modules" not in f.source for f in found), "node_modules must be skipped"


def test_scan_report_says_already_disclosed_and_names_rotation():
    state = rd.RedactionState()
    found = rd.scan('password = "x"', source="analysis/domains.json")
    report = rd.render_scan_report(found, "/proj")
    assert "ALREADY DISCLOSED" in report
    assert "ROTATE" in report
    assert "analysis/domains.json:1" in report


def test_console_output_is_ascii_only():
    # These strings print to a cp1252 console on the Windows machines this runs on. A non-ASCII
    # character shows as a replacement glyph at best and raises UnicodeEncodeError at worst.
    # File content is UTF-8 and deliberately not covered by this.
    state = rd.RedactionState()
    rd.redact('password = "x"', state, source="a.md")
    for text in (
        rd.summary_line(state, "out/_redactions.md"),
        rd.summary_line(rd.RedactionState(), "out/_redactions.md"),
        rd.render_scan_report(rd.scan('pwd = "x"', source="a.json"), "/proj"),
        rd.render_scan_report([], "/proj"),
    ):
        text.encode("ascii")  # raises UnicodeEncodeError on any non-ASCII character


def test_scan_report_is_explicit_when_clean():
    report = rd.render_scan_report([], "/proj")
    assert "no credential literals found" in report, "silence must never look like a skipped run"


# ---------------------------------------------------------------------------- dependencies

def test_module_imports_without_pymupdf():
    # Scan mode reads no PDFs and must work where PyMuPDF is absent.
    assert "fitz" not in sys.modules


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print("ok   - %s" % t.__name__)
        except AssertionError as exc:
            failed += 1
            print("FAIL - %s: %s" % (t.__name__, exc))
        except Exception as exc:  # noqa: BLE001 - a crash is a failure, report it the same way
            failed += 1
            print("ERROR- %s: %s: %s" % (t.__name__, type(exc).__name__, exc))
    print("\n%d passed, %d failed" % (len(tests) - failed, failed))
    sys.exit(1 if failed else 0)
