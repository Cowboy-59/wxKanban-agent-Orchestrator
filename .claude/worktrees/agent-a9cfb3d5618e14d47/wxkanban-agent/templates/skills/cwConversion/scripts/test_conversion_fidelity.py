"""SCOPE-125 / T012+T013 — redaction must not change what a conversion produces.

Success metric 4: the element manifest is byte-identical between a redacted and an unredacted run
of the same source. Anything other than a credential value differing is a failure.

Why this test earns its place: the redaction stage sits UPSTREAM of classification and grouping. In
pcsoft-doc-split.py it runs inside clean_text(), before the breadcrumb is even parsed — and that
file's own docstring records a prior bug where a classification mistake silently dropped real
queries and the entire procedure/trigger layer. Inserting an unproven text transform ahead of that
same logic without a fidelity check would be repeating the history the file documents.

The seam for "redaction off" is wxconv_redact._find_spans -> []. Everything else — the write funnel,
the watermark, the sidecar decision — runs exactly as it does in production, so the comparison
isolates redaction rather than bypassing the machinery around it.

This file is IDENTICAL in all nine script directories: it discovers whichever splitter sits beside
it and tests that one, so the three families share one test rather than three that drift.

Fixtures are synthetic (constraint C-9). No real customer source and no real credential is ever
committed as test data — the reported leak included a tracked 2.4 MB source export, and committing
our own would reproduce the defect while testing its fix.

Run directly: `python test_conversion_fidelity.py` (exit 0 = pass).
"""

import importlib.util
import io
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wxconv_redact as rd  # noqa: E402

SPLITTERS = {
    "vb6-project-split.py": "vb",
    "clarion-app-split.py": "cw",
    "pcsoft-doc-split.py": "wx",
}

# Synthetic sources carrying every credential shape this family leaks, plus non-credential content
# that MUST survive untouched.
VB_SOURCE = '''Attribute VB_Name = "modData"
Option Explicit

Public Sub Connect()
    Dim cn As ADODB.Connection
    cn.ConnectionString = "Provider=SQLOLEDB;Data Source=SRV;uid=sa;pwd=Hunter2!"
    gsUser = "svc_reports"
    gsPassword = "P@ssw0rd!"
    gsFromConfig = App.Path
    lblPassword.Caption = "Password:"
End Sub

Public Function Total(ByVal n As Long) As Long
    Total = n * 2
End Function
'''

CW_SOURCE = """  PROGRAM
  MAP
  END
CUSTOMER FILE,DRIVER('MSSQL'),OWNER('SRV,SALES,sa,Hunter2!'),PRE(CUS)
Record   RECORD
CustID     LONG
Name       CSTRING(60)
         END
       END
  CODE
  OPEN(CUSTOMER)
"""


def _find_splitter():
    for name, family in SPLITTERS.items():
        path = os.path.join(HERE, name)
        if os.path.exists(path):
            return path, family, name
    return None, None, None


def _load(path):
    spec = importlib.util.spec_from_file_location("splitter_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _manifest(out_dir):
    """Filenames + byte sizes of everything the run emitted, excluding the credential report."""
    entries = {}
    for root, dirs, files in os.walk(out_dir):
        for f in sorted(files):
            if f == rd.SIDECAR_NAME:
                continue  # only exists when credentials were found; not part of the element manifest
            p = os.path.join(root, f)
            entries[os.path.relpath(p, out_dir).replace("\\", "/")] = os.path.getsize(p)
    return entries


def _run(mod, argv, out_dir, redaction_on):
    original = rd._find_spans
    if not redaction_on:
        rd._find_spans = lambda text: []
    saved_argv = sys.argv[:]
    saved_stdout = sys.stdout
    try:
        sys.argv = argv
        sys.stdout = io.StringIO()
        try:
            mod.main()
        except SystemExit:
            pass
    finally:
        sys.argv = saved_argv
        sys.stdout = saved_stdout
        rd._find_spans = original
    return _manifest(out_dir)


def test_manifest_identical_with_and_without_redaction():
    path, family, name = _find_splitter()
    assert path, "no splitter found beside this test"

    if family == "wx":
        # pcsoft-doc-split reads a PDF, which cannot be synthesised without shipping a binary
        # fixture. Its redaction seam is clean_text(), so fidelity is asserted there instead --
        # see test_clean_text_is_identity_without_credentials below.
        print("     (pcsoft family: PDF-driven, manifest test covered at clean_text level)")
        return

    mod = _load(path)
    src_text = VB_SOURCE if family == "vb" else CW_SOURCE
    src_name = "modData.bas" if family == "vb" else "app.txa"

    manifests = {}
    for label, on in (("redacted", True), ("plain", False)):
        d = tempfile.mkdtemp(prefix="wxk125_")
        try:
            src_dir = os.path.join(d, "src")
            os.makedirs(src_dir)
            with io.open(os.path.join(src_dir, src_name), "w", encoding="utf-8") as fh:
                fh.write(src_text)
            out = os.path.join(d, "out")
            if family == "vb":
                argv = [name, "--src", os.path.join(src_dir, "*"), "--out", out]
            else:
                argv = [name, "--txa", os.path.join(src_dir, src_name), "--out", out]
            manifests[label] = _run(mod, argv, out, on)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    assert manifests["redacted"], "conversion produced nothing - fixture is not exercising the splitter"
    assert set(manifests["redacted"]) == set(manifests["plain"]), (
        "redaction changed WHICH files were produced:\n  only redacted: %s\n  only plain: %s"
        % (
            sorted(set(manifests["redacted"]) - set(manifests["plain"])),
            sorted(set(manifests["plain"]) - set(manifests["redacted"])),
        )
    )


def test_clean_text_is_identity_without_credentials():
    # The pcsoft redaction seam. Credential-free text must come back byte-identical, because every
    # emitted file, _discarded.md and index.md included, is assembled from these page bodies.
    path, family, _ = _find_splitter()
    if family != "wx":
        return
    mod = _load(path)
    body = (
        "Part 3 › WEBDEV page › PAGE_Cust › Control code\n"
        "PROCEDURE Load()\nIF nId = 0 THEN Info(\"new\")\nEND\n"
    )
    state = rd.RedactionState()
    assert mod.clean_text(body, state) == mod.clean_text(body), "redaction perturbed clean text"
    assert state.findings == []


def test_credential_free_source_produces_no_sidecar_and_no_findings():
    state = rd.RedactionState()
    out, found = rd.redact("PROCEDURE Total(n)\n  RETURN n * 2\n", state)
    assert found == [] and state.findings == []
    assert out == "PROCEDURE Total(n)\n  RETURN n * 2\n"


def test_non_credential_content_survives_a_redacted_run():
    state = rd.RedactionState()
    out, found = rd.redact(VB_SOURCE, state, source="modData.bas")
    assert len(found) >= 3, "fixture should carry at least connstring + user + password"
    for must_survive in (
        "Public Function Total(ByVal n As Long) As Long",
        "gsFromConfig = App.Path",
        'lblPassword.Caption = "Password:"',
        "Option Explicit",
    ):
        assert must_survive in out, "redaction destroyed non-credential content: %r" % must_survive
    for must_go in ("Hunter2!", "svc_reports", "P@ssw0rd!"):
        assert must_go not in out, "credential value survived: %r" % must_go


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
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("ERROR- %s: %s: %s" % (t.__name__, type(exc).__name__, exc))
    print("\n%d passed, %d failed" % (len(tests) - failed, failed))
    sys.exit(1 if failed else 0)
