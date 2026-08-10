#!/usr/bin/env python3
"""
wxconv_redact.py - Credential redaction for the wxKanban legacy-conversion pipelines.

Legacy WinDev/WEBDEV, VB6 and Clarion applications routinely hardcode database credentials as
string literals. The conversion pipelines copy source text into artifacts that are committed as
rebuild source material and read into AI context on every subsequent session, so a literal copied
verbatim is disclosed to anyone with repository access AND to the model provider.

This module removes the credential VALUE and keeps the FINDING. "This procedure connects with a
hardcoded credential, at this line" is real rebuild signal and must survive; only the secret goes.

Design rules that are load-bearing (see SCOPE-125):

  * ONLY QUOTED LITERALS ARE REDACTED. `Password = Arg.Something` and `..User = sConfigUser` are
    left completely intact, so the record of WHICH procedures handle credentials survives. A
    scrubber that removed those would score well on "no values in output" while destroying the
    analysis the migration depends on.
  * STABLE TOKENS. The same value always maps to the same token for the whole run, so twelve
    procedures sharing one credential read as one credential, not twelve.
  * NO DOTALL, EVER. Patterns match within a single line. An unterminated quote must not be able to
    swallow the remainder of a page and blank out real content.
  * NOTHING HERE WRITES A FILE OR PRINTS A VALUE. This module returns data; callers decide output.
    The value->token map lives only in memory for the duration of the run and is never serialised.

Dependencies: `re` only. This module must import in an environment where PyMuPDF is absent, because
scan mode reads no PDFs.

Public API:
    RedactionState()                  -> per-run token allocation + accumulated findings
    redact(text, state, source=None)  -> (redacted_text, findings)   # findings carry NO value
    scan(text, source=None)           -> findings                    # read-only, allocates nothing

Usage from a sibling conversion script (same pattern as wxkanban_watermark):
    import os as _rdos, sys as _rdsys
    _rdsys.path.insert(0, _rdos.path.dirname(_rdos.path.abspath(__file__)))
    from wxconv_redact import RedactionState, redact
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------------------------
# Pattern data. Kept as ONE reviewable table rather than literals scattered across nine scripts —
# adding a newly-observed credential shape must be a data change, not a code change.
# ---------------------------------------------------------------------------------------------

# Keys that introduce a credential when followed by an assignment and a QUOTED literal.
# `user` (bare) is present deliberately: WinDev HFSQL connection blocks use `..User` alongside
# `..Password`, so omitting it lets the username half of the commonest WinDev pattern through.
CRED_KEYS = (
    "password", "passwd", "pwd",
    "userid", "user id", "uid", "user",
    "login",
    "apikey", "api_key", "api-key",
    "token", "secret",
    "data source", "initial catalog",
    "connectionstring", "connection string",
)

# Credential keys as they appear INSIDE a connection string (`...;uid=sa;pwd=x;...`). Values there
# are not quoted, so the keyed pattern cannot see them — the whole enclosing literal is redacted
# instead. Restricted to unambiguously credential-bearing keys on purpose: a SQL query will never
# contain `pwd=`, so this cannot mistake a query for a connection string.
CONNSTR_CRED_KEYS = ("pwd", "password", "uid", "user id")

# Calls that take credentials as BARE POSITIONAL literals with no key at all. Maps the lowercased
# call name to {argument index (0-based): key name recorded in the finding}.
# `.Open` deliberately excludes index 0: on a Recordset that argument is a SQL statement, and
# redacting it would destroy real logic. A connection string passed there is still caught by the
# embedded-connection-string rule below, which keys on content rather than position.
POSITIONAL_CALLS = {
    "hdescribeconnection": {1: "user", 2: "password"},
    "hopenconnection": {1: "user", 2: "password"},
    "open": {1: "user", 2: "password"},
}

MAX_CALL_SCAN = 2000  # cap the argument scan so a malformed call cannot walk the whole document

TOKEN_PREFIX = "CRED"

# NOTE ON TOKEN FORM: `[[CRED-01]]`, not `<<CRED-01>>`. Angle brackets are unsafe here — `<CRED-01>`
# parses as a raw HTML tag in GitHub-flavoured Markdown and can be swallowed by the renderer, and
# Markdown is this pipeline's primary output format (including the findings sidecar). Double square
# brackets render literally in Markdown and need no escaping in JSON, SQL or TSX.
_TOKEN_FMT = "[[" + TOKEN_PREFIX + "-{n:02d}]]"

# An already-redacted value must never be redacted again. Two passes run over the same text by
# design — `clean_text()` redacts each PDF page, then `write_text()` re-scrubs every emitted file as
# defence in depth — and `password = "[[CRED-01]]"` still matches the keyed pattern. Without this,
# the second pass would treat the token as a value and allocate a token for the token.
# It is also what makes success metric 1 true: scanning already-redacted output must report zero.
TOKEN_RE = re.compile(r"\A\[\[" + TOKEN_PREFIX + r"-\d+\]\]\Z")


def _key_alternation() -> str:
    """Longest-first alternation of CRED_KEYS, with spaces relaxed to optional whitespace."""
    ordered = sorted(CRED_KEYS, key=len, reverse=True)
    return "|".join(k.replace(" ", r"\s*") for k in ordered)


# A quoted literal that cannot cross a line: the body explicitly excludes CR/LF, so even if a caller
# compiled this with DOTALL the match still cannot run away past the end of the line.
_QUOTED = r"(?P<q>[\"'])(?P<val>(?:(?!(?P=q))[^\r\n])*)(?P=q)"

# The `["']?` after the key is load-bearing, not defensive padding: in JSON the key is itself
# quoted (`"uid": "sa"`), so the closing quote sits between the key and the separator. Without it
# this pattern cannot see a JSON credential pair at all — and JSON is the format the confirmed
# field leak was in (an ad-hoc `analysis/*.json` with no producer script). Caught by
# test_scan_finds_the_reported_leak_shape.
# NO leading \b. A word boundary would require the key to start an identifier, which excludes
# Hungarian notation -- and Hungarian notation is how VB6 names things. `gsPassword`, `m_sPassword`,
# `txtPassword.Text` have no boundary between the prefix and the key, so a \b-anchored pattern walks
# straight past the commonest VB6 credential shape. Found by an end-to-end run, not by unit tests:
# the tests had been written from the same wrong assumption as the pattern.
# Dropping \b outright would over-match (`fluid`, `liquid` contain `uid`), so the start position is
# validated by _key_start_ok() below instead.
# `(?:\.(?:Text|Value))?` covers the VB6 control shape `txtPassword.Text = "..."`. Deliberately
# NOT `.Caption`: `lblPassword.Caption = "Password:"` is a UI label, and redacting it would destroy
# interface signal the rebuild needs while protecting nothing.
KEYED_RE = re.compile(
    r"(?i)(?P<key>" + _key_alternation() + r")(?:\.(?:Text|Value))?"
    r"[\"']?\s*(?::=|=|:)\s*" + _QUOTED
)

# Clarion .txa/.dct place the ENTIRE connection string, credentials included, in the file's OWNER()
# attribute. It matches no key=value shape, so it needs its own pattern. This is the most common
# Clarion credential leak and fires on essentially every Clarion conversion.
OWNER_RE = re.compile(
    r"(?i)\bOWNER\s*\(\s*(?P<q>['\"])(?P<val>(?:(?!(?P=q))[^\r\n])*)(?P=q)\s*\)"
)

QUOTED_RE = re.compile(_QUOTED)

CONNSTR_CRED_RE = re.compile(
    r"(?i)\b(?:" + "|".join(k.replace(" ", r"\s*") for k in CONNSTR_CRED_KEYS) + r")\s*=\s*[^;\r\n]"
)

CALL_RE = re.compile(
    r"(?i)(?:(?<=\.)\s*(?P<dotted>Open)|\b(?P<named>HDescribeConnection|HOpenConnection))\s*(?P<paren>\()?"
)


# ---------------------------------------------------------------------------------------------
# [SCOPE 125 / T001] BEGIN — Finding record (carries no credential value, by construction)
@dataclass(frozen=True)
class Finding:
    """
    One redacted credential. Deliberately has NO value field.

    Everything downstream — the sidecar, the console summary, scan output — is built from these,
    so the value cannot leak into a report by accident. There is nowhere to put it.
    """

    token: str
    key: str
    line: int
    source: str = ""
# [SCOPE 125 / T001] END


# [SCOPE 125 / T001] BEGIN — Per-run token allocation state
@dataclass
class RedactionState:
    """
    Per-run allocation of credential values to stable tokens.

    The map is in-memory only and is never serialised. There is deliberately no option to write it
    out: a flag that puts plaintext secrets on disk is a footgun, and the guard usually proposed for
    it (refuse inside a git work tree) fails on worktrees, submodules, and plain directories that
    are placed under version control later.
    """

    _tokens: dict = field(default_factory=dict, repr=False)
    findings: list = field(default_factory=list)

    def token_for(self, value: str) -> str:
        """Return the stable token for `value`, allocating one on first sight."""
        token = self._tokens.get(value)
        if token is None:
            token = _TOKEN_FMT.format(n=len(self._tokens) + 1)
            self._tokens[value] = token
        return token

    @property
    def distinct_count(self) -> int:
        """How many DISTINCT credential values were seen — not how many occurrences."""
        return len(self._tokens)

    def __repr__(self) -> str:  # never let a repr() in a traceback disclose the map
        return (
            "RedactionState(distinct={d}, findings={f})".format(
                d=len(self._tokens), f=len(self.findings)
            )
        )
# [SCOPE 125 / T001] END


# [SCOPE 125 / T001] BEGIN — Top-level quoted argument scanner for positional credential calls
def _quoted_args(text: str, open_idx: int, end_at_newline: bool):
    """
    Yield (arg_index, val_start, val_end) for each top-level QUOTED argument of a call.

    `open_idx` is the index of the opening parenthesis, or of the first character of the argument
    list for the parenthesis-less VB6 form (`cn.Open a, b, c`). Nested calls are skipped, so
    `F(G("x"), "y")` reports only "y" as argument 1.

    Doubled quotes ("" inside a "..." literal) are the escape form in both VB6 and WLanguage and are
    consumed as part of the literal rather than ending it.
    """
    i = open_idx if not end_at_newline else open_idx
    depth = 0 if end_at_newline else 1
    if not end_at_newline:
        i += 1
    arg = 0
    limit = min(len(text), open_idx + MAX_CALL_SCAN)

    while i < limit:
        ch = text[i]
        if ch in ("\r", "\n"):
            if end_at_newline:
                return
            i += 1
            continue
        if ch in ('"', "'"):
            quote = ch
            start = i + 1
            j = start
            while j < limit:
                if text[j] == quote:
                    if j + 1 < limit and text[j + 1] == quote:  # "" escape
                        j += 2
                        continue
                    break
                if text[j] in ("\r", "\n"):
                    break
                j += 1
            if j < limit and text[j] == quote:
                if depth <= 1:
                    yield arg, start, j
                i = j + 1
                continue
            return  # unterminated literal — stop rather than guess
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth <= 0:
                return
        elif ch == "," and depth <= 1:
            arg += 1
        i += 1
# [SCOPE 125 / T001] END


# [SCOPE 125 / T001] BEGIN — Accept a key at an identifier start or a camelCase hump
def _key_start_ok(text: str, start: int) -> bool:
    """
    Decide whether a credential key matched at a real position or in the middle of another word.

    Accept when the key starts an identifier (`password = ...`, `..User = ...`) OR sits at a
    camelCase hump inside one (`gsPassword`, `m_sPassword`, `txtPassword`) — Hungarian notation is
    the dominant VB6 style and a plain word-boundary anchor misses all of it.

    Reject when the key is buried inside a lowercase run: `fluid` and `liquid` contain `uid`, and
    redacting `fluid = "water"` would destroy signal for no security benefit.
    """
    if start == 0:
        return True
    prev = text[start - 1]
    if not (prev.isalnum() or prev == "_"):
        return True
    return text[start].isupper() and not prev.isupper()
# [SCOPE 125 / T001] END


# [SCOPE 125 / T001] BEGIN — Collect every redactable span in a block of text
def _find_spans(text: str):
    """
    Return [(start, end, key)] for every credential VALUE in `text`, quote characters excluded.

    Spans are collected from all matchers first and only then applied, so no matcher ever sees
    offsets invalidated by another matcher's replacement. Overlapping spans are resolved by keeping
    the earliest, then the longest.
    """
    spans = []

    for m in KEYED_RE.finditer(text):
        if m.group("val") and _key_start_ok(text, m.start("key")):
            spans.append((m.start("val"), m.end("val"), m.group("key").lower()))

    for m in OWNER_RE.finditer(text):
        if m.group("val"):
            spans.append((m.start("val"), m.end("val"), "owner"))

    for m in CALL_RE.finditer(text):
        name = (m.group("dotted") or m.group("named") or "").lower()
        positions = POSITIONAL_CALLS.get(name)
        if not positions:
            continue
        has_paren = m.group("paren") is not None
        start_idx = m.end("paren") - 1 if has_paren else m.end()
        for arg, vs, ve in _quoted_args(text, start_idx, end_at_newline=not has_paren):
            key = positions.get(arg)
            if key and ve > vs:
                spans.append((vs, ve, key))

    # A connection string carries its credentials unquoted inside one literal, so the keyed pattern
    # cannot reach them. Redact the whole literal when its CONTENT proves it is one.
    for m in QUOTED_RE.finditer(text):
        val = m.group("val")
        if val and CONNSTR_CRED_RE.search(val):
            spans.append((m.start("val"), m.end("val"), "connection string"))

    spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
    merged = []
    last_end = -1
    for start, end, key in spans:
        if start < last_end:
            continue
        if TOKEN_RE.match(text[start:end]):  # already redacted — see TOKEN_RE
            continue
        merged.append((start, end, key))
        last_end = end
    return merged
# [SCOPE 125 / T001] END


# [SCOPE 125 / T001] BEGIN — Redact credential values, preserving the finding
def redact(text: str, state: RedactionState, source: str = ""):
    """
    Replace every hardcoded credential VALUE in `text` with its stable token.

    Returns (redacted_text, findings_for_this_call). Findings are also appended to `state.findings`
    so a whole conversion run accumulates into one report. Neither the return value nor the state
    ever carries a credential value.

    Text with no credentials is returned unchanged and identical — this matters, because the stage
    runs upstream of page classification and must not perturb conversion output.
    """
    if not text:
        return text, []

    spans = _find_spans(text)
    if not spans:
        return text, []

    found = []
    out = []
    prev = 0
    for start, end, key in spans:
        value = text[start:end]
        token = state.token_for(value)
        out.append(text[prev:start])
        out.append(token)
        prev = end
        found.append(
            Finding(token=token, key=key, line=text.count("\n", 0, start) + 1, source=source)
        )
    out.append(text[prev:])

    state.findings.extend(found)
    return "".join(out), found
# [SCOPE 125 / T001] END


# [SCOPE 125 / T004] BEGIN — The single emission boundary for every conversion script
def write_text(path, text, state, dry_run=False, generator="wxConversion", kind="converted"):
    """
    THE ONLY WAY A CONVERSION SCRIPT MAY WRITE A FILE.

    Redacts, accumulates findings, stamps the watermark on Markdown, then writes. Returns the size
    in bytes of what was (or would have been) written, matching the return contract of the `write()`
    this replaces.

    Why a funnel rather than a scrub at each call site: the defect this fixes exists because
    credential handling had no owner. Eighteen scripts per tree each emitted independently, several
    through bare `open(path, "w").write(...)`, so there was no single place to put the control. A
    per-call-site fix would work today and be silently reintroduced by the nineteenth emitter.
    After this lands, "no script writes a file except through write_text" is greppable and can be
    asserted in CI.

    The watermark import is lazy and deliberately NOT guarded with a fallback. `stamp_markdown`
    currently lives inside the one function being generalised here, and five of the scripts being
    routed through this helper never had watermarking — an implementer who loses it would silently
    un-watermark every conversion artifact (SCOPE-082 regression). Failing loudly is the point.
    """
    source = os.path.basename(str(path))
    text, _ = redact(text, state, source=source)

    if str(path).endswith(".md"):
        from wxkanban_watermark import stamp_markdown  # noqa: PLC0415 - see docstring

        text = stamp_markdown(text, kind=kind, generator=generator)

    size = len(text.encode("utf-8"))
    if not dry_run:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
    return size
# [SCOPE 125 / T004] END


# [SCOPE 125 / T005] BEGIN — Findings sidecar (records the finding, never the value)
SIDECAR_NAME = "_redactions.md"

_SIDECAR_HEADER = """# Hardcoded credentials found during conversion

**{n} credential literal(s) across {files} file(s); {distinct} distinct value(s).**

The conversion replaced each credential VALUE with a stable token. Everything else was left alone —
the procedures below still show that they connect with a hardcoded credential, which the rebuild
needs to know.

## Read this before assuming you are safe

1. **Every account listed here must be rotated.** The values were hardcoded in the legacy source
   before this conversion ran, so anyone who has ever had access to that source has them.
2. **Redaction does not undo prior disclosure.** If an earlier conversion committed these values, or
   an AI session read an artifact containing them, they are already disclosed and rotation is the
   only remedy. Rewriting a file now changes nothing about that.
3. **This is a mitigation, not a guarantee.** Values built by concatenation, or held in
   unconventionally-named variables, are not matched. A clean report is not proof of a clean source.

The same token always means the same value, so a token repeated below is one credential in several
places — not several credentials.

| Token | Key | File | Line |
|---|---|---|---|
"""


def render_sidecar(state) -> str:
    """
    Render the findings sidecar.

    There is deliberately no code path here that could emit a credential value: `Finding` has no
    value field, so the only thing available to render is the token, key, file and line. Nor is
    there a truncated or masked form — a partial mask is a disclosure, not a redaction.
    """
    findings = state.findings
    files = sorted({f.source for f in findings if f.source})
    body = _SIDECAR_HEADER.format(
        n=len(findings), files=len(files) or 1, distinct=state.distinct_count
    )
    rows = [
        "| `{t}` | {k} | `{s}` | {l} |".format(t=f.token, k=f.key, s=f.source or "(unknown)", l=f.line)
        for f in findings
    ]
    return body + "\n".join(rows) + "\n"
# [SCOPE 125 / T005] END


# [SCOPE 125 / T006] BEGIN — Console summary and the opt-in failure gate
def summary_line(state, sidecar_path: str) -> str:
    """
    The line whose ABSENCE is the defect being fixed.

    Before this, a conversion of a credential-bearing application printed nothing at all about the
    credentials it had just copied into committed artifacts. Silence read as success.
    """
    n = len(state.findings)
    if not n:
        return "  credentials : none found"
    return (
        "  REDACTED {n} credential literal(s), {d} distinct -> {p}\n"
        "               ROTATE these accounts. Redaction does not undo prior disclosure."
    ).format(n=n, d=state.distinct_count, p=sidecar_path)


def add_redaction_args(parser, scan: bool = True):
    """
    Register the shared flags on a conversion script's argument parser.

    `--fail-on-secrets` goes on EVERY conversion script (FR-009). `--scan-only` goes on the family
    SPLITTER only (FR-010) — it walks an output directory rather than converting anything, so
    offering it on a downstream emitter that expects already-split input would just be confusing.
    """
    parser.add_argument(
        "--fail-on-secrets",
        action="store_true",
        help="exit non-zero when hardcoded credentials are found (default: off; redaction always runs)",
    )
    if scan:
        parser.add_argument(
            "--scan-only",
            metavar="DIR",
            help="report credential literals in EXISTING output under DIR; writes and changes nothing",
        )
    return parser


def exit_code(findings_count: int, fail_on_secrets: bool) -> int:
    """
    Redaction is unconditional; only the hard stop is opt-in.

    Defaulting the gate off keeps a first conversion run from blocking a developer who just wants
    to see output. CI turns it on, and that gate is the layer that holds when the instruction files
    have drifted (see SCOPE-125 C-12).
    """
    return 1 if (fail_on_secrets and findings_count) else 0
# [SCOPE 125 / T006] END


# [SCOPE 125 / T007] BEGIN — Read-only exposure scan over already-produced artifacts
SCAN_EXTENSIONS = (".md", ".json", ".sql", ".tsx", ".ts", ".jsx", ".html", ".htm", ".txt", ".csv")
SCAN_SKIP_DIRS = {"node_modules", ".git", "__pycache__", "dist", "build", ".venv", "venv", ".next"}


def scan_tree(root: str):
    """
    Walk `root` and report credential literals in artifacts that already exist. Modifies NOTHING.

    This is the remediation path. Its output must never imply the problem is solved by running it:
    anything found here was committed and very likely read into AI context already, and rotation is
    the only remedy. A scan that quietly rewrote the files would manufacture false comfort, which is
    worse than the current state.
    """
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in sorted(dirnames) if d not in SCAN_SKIP_DIRS]
        for name in sorted(filenames):
            if not name.lower().endswith(SCAN_EXTENSIONS):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError:
                continue
            rel = os.path.relpath(path, root).replace("\\", "/")
            out.extend(scan(text, source=rel))
    return out


def render_scan_report(findings, root: str) -> str:
    """Console report for scan mode. Explicit when clean, so silence is never read as 'skipped'."""
    if not findings:
        return (
            "SCAN: {r}\n  no credential literals found in existing conversion output.".format(r=root)
        )
    lines = [
        "SCAN: {r}".format(r=root),
        "  {n} credential literal(s) found in artifacts that ALREADY EXIST.".format(n=len(findings)),
        "",
        # ASCII only. These strings go to a console whose code page is cp1252 on the Windows
        # machines this runs on; a non-ASCII character prints as a replacement glyph at best and
        # raises UnicodeEncodeError at worst. File content is UTF-8 and unaffected.
        "  These are ALREADY DISCLOSED: committed, and read into AI context on every session",
        "  that opened them. Redacting them now does not undo that. ROTATE the accounts.",
        "",
    ]
    lines += [
        "    {s}:{l}  ({k})".format(s=f.source, l=f.line, k=f.key) for f in findings
    ]
    return "\n".join(lines)
# [SCOPE 125 / T007] END


# [SCOPE 125 / T001] BEGIN — Read-only scan of already-produced artifacts
def scan(text: str, source: str = ""):
    """
    Report credential literals in `text` without modifying anything and without allocating tokens.

    This is the remediation path (FR-010): artifacts produced before redaction existed are already
    disclosed, and rewriting them now would not undo that. Callers must say so in their output —
    rotation is the only remedy, and a scan that silently cleaned files would create false comfort.
    """
    if not text:
        return []
    return [
        Finding(token="", key=key, line=text.count("\n", 0, start) + 1, source=source)
        for start, _end, key in _find_spans(text)
    ]
# [SCOPE 125 / T001] END
