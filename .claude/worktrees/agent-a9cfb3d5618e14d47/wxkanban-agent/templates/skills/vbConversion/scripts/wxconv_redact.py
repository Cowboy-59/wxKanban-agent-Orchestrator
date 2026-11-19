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
    RedactionState.resume(ledger, *upstream) -> same, continuing an existing _redactions.md
    ledger_changed(state)             -> whether the ledger must be (re)written this run
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
    # `authorization` is how Bearer tokens, OAuth secrets and API auth headers are named in
    # the field that holds them, and it was absent entirely -- a field called
    # `CompanyDetail.SMSPortal_Authorization` was invisible to every matcher here. Bare `auth`
    # is safe to add despite being a common word fragment, because KEYED_RE requires the key to
    # be followed immediately by an assignment: `Author = "Fabrice"` and `authcode = "x"` do not
    # match, only `auth = "..."` does.
    "authorization", "auth",
    "data source", "initial catalog",
    "connectionstring", "connection string",
    # WinDev is sold and written in Spanish and French as much as in English; a process password
    # held in `sClave` or `sMotDePasse` passed every matcher here (wxKanban c0d7cfa6). Like every
    # key above, these must END the identifier, so `ClaveCliente` - Spanish code's usual name for a
    # record's lookup key, not a secret - is not matched.
    "clave", "contraseña", "contrasena", "mot de passe",
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
    # A secret passed as a bare positional argument has NO key anywhere near it, so no key-based
    # matcher can ever reach it. A live third-party SMTP password reached pre-convert/ this way,
    # was read into AI context, and was then certified clean by this scanner's own --scan-only
    # report; rotation was the only remedy left (wxKanban 6217e40a). These are the credential-taking
    # PCSoft/WLanguage APIs confirmed in the field. Indices are ZERO-based and count only QUOTED
    # arguments, matching _quoted_args - the same convention the three entries above already use.
    # Getting an index wrong here is worse than omitting the call: it redacts a hostname (real
    # rebuild signal) and leaves the secret in place. SocketConnect and AuthIdentify were also
    # suggested in that report but its signatures were not confirmed, so they are deliberately
    # NOT listed - an unverified index would be exactly that failure.
    "emailstartsmtpsession": {0: "user", 1: "password"},
    "emailstartpop3session": {0: "user", 1: "password"},
    "emailstartimapsession": {0: "user", 1: "password"},
    "emailstartsession": {0: "user", 1: "password"},
    "ftpconnect": {1: "user", 2: "password"},
    # An HFSQL data file's own password, passed as a literal (wxKanban c0d7cfa6):
    # HPass(<data file>, <password>) and HDeclareExternal(<file path>, <logical name>, <password>).
    # The data-file and logical-name arguments are rebuild signal and stay.
    "hpass": {1: "password"},
    "hdeclareexternal": {2: "password"},
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
_TOKEN_NUM_RE = re.compile(r"\[\[" + TOKEN_PREFIX + r"-(\d+)\]\]")


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
# The WLanguage DECLARATION with an initial value puts the type between the name and the `=`:
# `sPassword is string = "..."`, `sClave is a string = "..."`, French `sMotDePasse est une chaîne
# = "..."`. That is how a local variable is normally given a value in WLanguage, and every one
# was missed (wxKanban c0d7cfa6). An initialiser commented out after the type (`ApiToken is string
# //= "..."`) still carries the value. Kept to one line and at most three type words.
_DECL_TAIL = (r"[^\S\r\n]+(?:is|est)(?:[^\S\r\n]+(?:an?|une?))?(?:[^\S\r\n]+[\w][\w\-]*){1,3}?"
              r"[^\S\r\n]*(?://[^\S\r\n]*)?=")
KEYED_RE = re.compile(
    r"(?i)(?P<key>" + _key_alternation() + r")(?:\.(?:Text|Value))?"
    r"(?:" + _DECL_TAIL + r"|[\"']?\s*(?::=|=|:))\s*" + _QUOTED
)

# A Mermaid erDiagram relationship: `fUserRole ||--o{ fUser : "RoleCode"`. The label after the
# colon is the joining column, and an entity named fUser read as the key `user` followed by `:`,
# so the ER diagram's own FK label was replaced with a credential token (wxKanban 0a922271). A
# relationship line names two entities and a column - it cannot hold a credential.
_MERMAID_REL_RE = re.compile(r"^[^\S\r\n]*[\w\"\-]+[^\S\r\n]+[|}][|o](?:--|\.\.)[|o][|{]"
                             r"[^\S\r\n]+[\w\"\-]+[^\S\r\n]*:", re.M)

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

# ...except that a query or filter string CAN contain `password =`: a login check such as
# "Login = '[%sLogin%]' AND PassWord = '[%sPwd%]'" was redacted WHOLE as a connection string,
# destroying the query text while protecting nothing - the value it compares against is a
# placeholder filled in at run time (wxKanban c0d7cfa6). When EVERY credential key in the literal
# is followed by a placeholder - a WLanguage `[%var%]` template, a `%1` StringBuild slot, or a
# `:name` / `@name` / `?` SQL parameter - the literal carries no secret. A literal value after any
# one of the keys keeps the whole literal redacted, exactly as before.
_CONNSTR_VALUE_RE = re.compile(
    r"(?i)\b(?:" + "|".join(k.replace(" ", r"\s*") for k in CONNSTR_CRED_KEYS) + r")\s*=\s*"
    r"(?P<placeholder>'?(?:\[%|%\d|[:@][A-Za-z_]|\?))?"
)


# A keyed value that is nothing but a run-time placeholder - `PassWord = '[%sPwd%]'` inside a filter
# string, `password = '%1'` inside a StringBuild template - carries no secret, and redacting it
# breaks the query text it sits in (wxKanban c0d7cfa6).
_PLACEHOLDER_ONLY_RE = re.compile(r"\[%[^%\r\n]*%\]|%\d+")
_COMMENTED_ALT_RE = re.compile(r"[^\S\r\n]*//[^\S\r\n]*(?::=|=)[^\S\r\n]*" + _QUOTED)


def _connstr_has_secret(val: str) -> bool:
    return any(not m.group("placeholder") for m in _CONNSTR_VALUE_RE.finditer(val)
               if CONNSTR_CRED_RE.match(val, m.start()))


# Which POSITIONAL_CALLS entries are METHODS, reached through a member access (`cn.Open ...`)
# rather than called by bare name. Everything else in the table is a bare function.
_DOTTED_CALLS = {"open"}

# Built FROM POSITIONAL_CALLS rather than repeating it. The two lists were maintained separately,
# so adding a call to the table did nothing until this pattern was edited too - a silent way to
# believe a credential API is covered when it is not. The trailing guard stops a longer identifier
# (HOpenConnectionEx) from matching the shorter name inside it.
CALL_RE = re.compile(
    r"(?i)(?:(?<=\.)\s*(?P<dotted>"
    + "|".join(sorted(_DOTTED_CALLS, key=len, reverse=True))
    + r")|\b(?P<named>"
    + "|".join(sorted((k for k in POSITIONAL_CALLS if k not in _DOTTED_CALLS),
                      key=len, reverse=True))
    + r"))(?![A-Za-z0-9_])\s*(?P<paren>\()?"
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
    # The highest token NUMBER already in use - allocated here, present in text this run has read,
    # or recorded in a ledger this run continues. A new value always gets a number above it.
    # Each stage used to start again at CRED-01, so a page converted from already-redacted
    # pre-convert text could hold the splitter's [[CRED-01]] and its own, different [[CRED-01]] in
    # one file, and every per-page run wrote CRED-01 for a different value (wxKanban f6df3914).
    _last: int = field(default=0, repr=False)
    # Rows carried over from an existing ledger (see resume()), and the files this run has written:
    # a file written again replaces its old rows rather than being listed twice.
    _prior: list = field(default_factory=list, repr=False)
    _written: set = field(default_factory=set, repr=False)

    @classmethod
    def resume(cls, ledger_path, *upstream_ledgers):
        """
        A state that CONTINUES the ledger at `ledger_path` instead of overwriting it.

        For a stage that runs once per element into a shared directory (page-to-react, once per
        page) or that shares its directory with a sibling stage (queries, procedures and reports
        all write rebuild/scopes/_redactions.md). The ledger's rows are kept, except those of files
        this run writes again; token numbers continue above every number in `ledger_path` and in
        each upstream ledger (normally pre-convert/_redactions.md), so no number ever means two
        values. The ledger never held a value, so nothing secret is read back - only token, key,
        file and line.
        """
        state = cls()
        for path in (ledger_path,) + tuple(upstream_ledgers):
            rows = _read_ledger_rows(path)
            if path == ledger_path:
                state._prior = rows
            for token, _key, _src, _line in rows:
                state._note_token(token)
        return state

    def _note_token(self, token: str) -> None:
        m = _TOKEN_NUM_RE.search(token)
        if m:
            self._last = max(self._last, int(m.group(1)))

    def token_for(self, value: str) -> str:
        """Return the stable token for `value`, allocating one on first sight."""
        token = self._tokens.get(value)
        if token is None:
            self._last += 1
            token = _TOKEN_FMT.format(n=self._last)
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

    An ACRONYM prefix is a hump too: `SMTPPassword`, `DBPassword`, `APIToken`, `TWPassword`. There
    the key's capital follows another capital, which the plain hump test rejected, so the commonest
    names of a service credential were never matched (wxKanban c0d7cfa6). It is accepted only when
    the key's next letter is lowercase - a new camel word starting - so `GUID`, `UUID` and `PUID`
    still do not yield `uid`.
    """
    if start == 0:
        return True
    prev = text[start - 1]
    if not (prev.isalnum() or prev == "_"):
        return True
    if not text[start].isupper():
        return False
    if not prev.isupper():
        return True
    return start + 1 < len(text) and text[start + 1].islower()
# [SCOPE 125 / T001] END


# [SCOPE 125 / T020] BEGIN — Credential named by an adjacent comment rather than by its own key
# Comment markers across the three legacy languages this module serves: `//` (WLanguage and
# modern-style VB), `'` (VB6/VBA), `!` (Clarion), `--` (SQL embedded in .txa/.dct exports).
_COMMENT_MARKER_RE = re.compile(r"\A[^\S\r\n]*(?://|--|!|')[^\S\r\n]*(?P<body>[^\r\n]*)")

# The credential keys again, unanchored. Inside a comment there is no `=` to key off, so the
# assignment-anchored KEYED_RE cannot be reused; the end-of-identifier check moves into code.
_KEY_ONLY_RE = re.compile("(?i)" + _key_alternation())

_WS_RE = re.compile(r"\s")


def _comment_key(line: str):
    """
    Return the credential key a comment LINE names as a bare field reference, or None.

    The body must be a SINGLE token — `//CompanyDetail.SMSPortal_Authorization`, never
    `// move the password to config`. That restriction is the entire safety margin of this rule:
    the value it redacts is chosen by the COMMENT rather than by the assignment, so a prose comment
    that merely mentions a credential must not be able to blank out an unrelated string beside it.
    The cost is that a field reference trailed by prose is missed. The observed real-world shape is
    the bare reference, and over-redacting a subject line or a caption would destroy rebuild signal
    for no security gain — the same trade the `.Caption` exclusion in KEYED_RE makes.

    The key must also END its identifier component, so `//Customer.UserName` and `//passwordhash`
    are rejected. KEYED_RE gets that check for free from the `=` that must follow it; here it is
    explicit. A trailing `_` or `.` still terminates, so `//User_ID` and `//Config.Auth.Value` hit.
    """
    m = _COMMENT_MARKER_RE.match(line)
    if not m:
        return None
    body = m.group("body").strip()
    if not body or _WS_RE.search(body):
        return None
    for km in _KEY_ONLY_RE.finditer(body):
        end = km.end()
        if _key_start_ok(body, km.start()) and (end >= len(body) or not body[end].isalnum()):
            return km.group(0).lower()
    return None


def _adjacent_comment_key(text: str, after: int):
    """
    Return the credential key named by the comment adjacent to a quoted literal ending at `after`.

    Checks the remainder of the literal's OWN line first, then the line below it. Both are the same
    developer workaround: a credential routed through an unrelated, non-credential-shaped field
    because the real one was not wired up yet, with the intended field name left behind in a
    comment. PDF text extraction is what pushes the comment down onto the following line.

    KEYED_RE cannot see this at all — the assignment's own key (`MyMessage.Subject`) is innocuous
    and only the comment gives it away. A value in this shape evades every other matcher in this
    module and the conversion then reports success, which is worse than a scan that fails loudly:
    the developer gets no signal to go looking for it by hand.
    """
    line_end = text.find("\n", after)
    tail = text[after:] if line_end == -1 else text[after:line_end]
    key = _comment_key(tail)
    if key or line_end == -1:
        return key
    next_end = text.find("\n", line_end + 1)
    below = text[line_end + 1:] if next_end == -1 else text[line_end + 1:next_end]
    return _comment_key(below)
# [SCOPE 125 / T020] END


# [SCOPE 125 / T001] BEGIN — Collect every redactable span in a block of text
# [SCOPE 125 / T020] MODIFIED-BY — smuggled-credential-via-adjacent-comment collector
def _find_spans(text: str):
    """
    Return [(start, end, key)] for every credential VALUE in `text`, quote characters excluded.

    Spans are collected from all matchers first and only then applied, so no matcher ever sees
    offsets invalidated by another matcher's replacement. Overlapping spans are resolved by keeping
    the earliest, then the longest.
    """
    spans = []

    mermaid = {text.count("\n", 0, r.start()) for r in _MERMAID_REL_RE.finditer(text)} \
        if "--" in text or ".." in text else set()
    for m in KEYED_RE.finditer(text):
        if m.group("val") and _key_start_ok(text, m.start("key")):
            if mermaid and text.count("\n", 0, m.start("key")) in mermaid:
                continue
            # A previous value kept as a comment on the same line, `= "new" //= "old"`, is a second
            # credential for the same key - and on the observed line the commented one was the
            # long, real-looking value (wxKanban c0d7cfa6).
            alt = _COMMENTED_ALT_RE.match(text, m.end())
            if alt and alt.group("val") and not _PLACEHOLDER_ONLY_RE.fullmatch(alt.group("val")):
                spans.append((alt.start("val"), alt.end("val"), m.group("key").lower()))
            if _PLACEHOLDER_ONLY_RE.fullmatch(m.group("val")):
                continue
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

    # Two rules that key on the literal itself rather than on what introduces it, sharing one
    # pass over the quoted literals:
    #  * a connection string carries its credentials unquoted inside one literal, so the keyed
    #    pattern cannot reach them — redact the whole literal when its CONTENT proves it is one;
    #  * a credential smuggled into an unrelated field is named only by an adjacent comment
    #    pointing at the credential-shaped field it belonged in (see _adjacent_comment_key).
    for m in QUOTED_RE.finditer(text):
        val = m.group("val")
        if not val:
            continue
        if CONNSTR_CRED_RE.search(val) and _connstr_has_secret(val):
            spans.append((m.start("val"), m.end("val"), "connection string"))
            continue
        key = _adjacent_comment_key(text, m.end())
        if key:
            spans.append((m.start("val"), m.end("val"), key + " (smuggled via adjacent comment)"))

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

    # Text produced by an earlier stage already carries that stage's tokens; a value new to this
    # run must not be given one of their numbers (see RedactionState._last).
    for m in _TOKEN_NUM_RE.finditer(text):
        state._note_token(m.group(0))

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
    state._written.add(source)

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
"""

_SIDECAR_CONTINUED = """
This ledger is continued by every run that writes into this folder, so it lists all of them - not
only the last. A token number is never reused for a different value; the same value found by two
separate runs can carry two tokens.
"""

_SIDECAR_TABLE = """
| Token | Key | File | Line |
|---|---|---|---|
"""

# One row of the findings table above. Reading it back recovers only what was written: token, key,
# file and line. There is no value in the ledger to read.
_LEDGER_ROW_RE = re.compile(
    r"^\| `(\[\[" + TOKEN_PREFIX + r"-\d+\]\])` \| (.+?) \| `(.*?)` \| (\d+) \|[^\S\r\n]*$", re.M
)


def _read_ledger_rows(path):
    """[(token, key, file, line)] from an existing ledger; [] when there is none."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return []
    return [(m.group(1), m.group(2), m.group(3), int(m.group(4)))
            for m in _LEDGER_ROW_RE.finditer(text)]


def render_sidecar(state) -> str:
    """
    Render the findings sidecar.

    There is deliberately no code path here that could emit a credential value: `Finding` has no
    value field, so the only thing available to render is the token, key, file and line. Nor is
    there a truncated or masked form — a partial mask is a disclosure, not a redaction.

    A state made by RedactionState.resume() also carries the ledger's earlier rows: each per-page run
    used to overwrite the ledger, so after converting every page it listed only the LAST page's
    credentials while the others still held them (wxKanban f6df3914). Rows for a file this run wrote
    again are replaced, never duplicated.
    """
    findings = state.findings
    kept = [r for r in getattr(state, "_prior", []) if r[2] not in getattr(state, "_written", set())]
    rows = kept + [(f.token, f.key, f.source or "(unknown)", f.line) for f in findings]
    files = sorted({r[2] for r in rows if r[2] and r[2] != "(unknown)"})
    distinct = len({r[0] for r in rows}) if kept else state.distinct_count
    body = _SIDECAR_HEADER.format(n=len(rows), files=len(files) or 1, distinct=distinct)
    if kept:
        body += _SIDECAR_CONTINUED
    # How many of each kind, so a reviewer can see at a glance which shapes this source uses
    # (wxKanban c0d7cfa6).
    counts = {}
    for r in rows:
        counts[r[1]] = counts.get(r[1], 0) + 1
    body += "\n| Key | Found |\n|---|---|\n" + "".join(
        "| {k} | {c} |\n".format(k=k, c=c) for k, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    )
    table = ["| `{t}` | {k} | `{s}` | {l} |".format(t=t, k=k, s=s, l=l) for t, k, s, l in rows]
    return body + _SIDECAR_TABLE + "\n".join(table) + "\n"


def ledger_changed(state) -> bool:
    """
    Whether the ledger must be (re)written: this run found something, OR it rewrote a file the
    ledger still lists - that file's old rows must go even though nothing replaced them.
    """
    written = getattr(state, "_written", set())
    return bool(state.findings) or any(r[2] in written for r in getattr(state, "_prior", []))
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
        # "no credential literals found" reads as an all-clear, and a developer acted on it as one
        # while a working SMTP credential sat in the scanned output - it was reachable by no
        # matcher this scanner has, so it was never going to be found (wxKanban 6217e40a). The
        # scanner's limits belong in the line that reports success, not only in the rule doc: a
        # clean scan is evidence about the MATCHERS, not about the source.
        return (
            "SCAN: {r}\n"
            "  no credential literals matched in existing conversion output.\n"
            "  This is not proof the output is clean: values built by concatenation, held in\n"
            "  unconventionally-named variables, or passed to a call this scanner does not know\n"
            "  are not matched. Read the integration code (email, FTP, HTTP, connections)\n"
            "  before treating the artifact as safe to share.".format(r=root)
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
