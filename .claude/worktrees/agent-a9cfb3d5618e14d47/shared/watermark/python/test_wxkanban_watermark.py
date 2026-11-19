"""SCOPE-082 / T012 — parity + round-trip tests for the Python watermark port.

Dependency-free: run directly with `python test_wxkanban_watermark.py`
(exit 0 = pass). Mirrors shared/watermark/tests/watermark.test.ts and asserts
the format matches the TS module so either side can verify the other's output.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wxkanban_watermark as wm  # noqa: E402

DOC = "# Form: Customer\n\nConverted element.\n\n- field A\n- field B\n"
TS = "2026-06-30T12:00:00.000Z"


def test_codec_round_trip():
    payload = "wxk1|G|1.5.190"
    assert wm.decode_zero_width(wm.encode_zero_width(payload)) == payload


def test_codec_utf8():
    payload = "wxk1|C|1.2.3—é"
    assert wm.decode_zero_width(wm.encode_zero_width(payload)) == payload


def test_codec_absent():
    assert wm.decode_zero_width("plain text") is None


def test_stamp_recoverable():
    out = wm.stamp_markdown(DOC, kind="converted", version="1.5.190", generated_at=TS)
    info = wm.verify_markdown(out)
    assert info["present"] is True
    assert info["kind"] == "converted"
    assert info["version"] == "1.5.190"


def test_stamp_visible_footer_and_frontmatter():
    out = wm.stamp_markdown(DOC, kind="converted", version="1.5.190", generator="wxConversion", generated_at=TS)
    assert out.startswith("---\n")
    assert "wxkanbanVersion: 1.5.190" in out
    assert "wxkanbanGenerator: wxConversion" in out
    assert "Converted with wxKanban" in out
    assert "www.wxperts.com" in out


def test_idempotent():
    once = wm.stamp_markdown(DOC, kind="converted", version="1.5.190", generated_at=TS)
    twice = wm.stamp_markdown(once, kind="converted", version="9.9.9", generated_at="2027-01-01T00:00:00.000Z")
    assert twice == once


def test_absent_on_unstamped():
    assert wm.verify_markdown(DOC) == {"present": False}


def test_known_format_snapshot():
    # The exact bytes the TS module produces for these inputs (parity contract).
    out = wm.stamp_markdown(DOC, kind="converted", version="1.5.190", generator="wxConversion", generated_at=TS)
    assert out.startswith("---\nwxkanbanGenerator: wxConversion\nwxkanbanVersion: 1.5.190\n")
    assert "<!-- wxkanban:watermark -->" in out
    assert out.rstrip().endswith(wm.encode_zero_width("wxk1|C|1.5.190"))


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
    print("\n%d passed, %d failed" % (len(tests) - failed, failed))
    sys.exit(1 if failed else 0)
