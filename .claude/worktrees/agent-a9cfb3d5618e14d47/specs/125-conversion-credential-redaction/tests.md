# Tests: Conversion Credential Redaction

**Spec**: 125
**Created**: 2026-08-10

All fixtures are **synthetic**. No real customer source, no real credential, and no real generated
documentation export enters the repository as test data (C-9). The reported leak included a tracked
2.4 MB source PDF; committing our own would repeat the defect while testing its fix.

---

## Unit — pattern set (T002)

| Test | Input shape | Expect |
|---|---|---|
| Keyed literal, each key | `password = "…"`, `pwd:"…"`, `uid := "…"` | Redacted, key recorded |
| Bare `user` key | `..User = "…"` | Redacted — the gap in the original report |
| Case insensitivity | `PASSWORD`, `Pwd`, `UID` | Redacted |
| Clarion owner attribute | `OWNER('…')` | Redacted |
| Positional arguments | `HDescribeConnection(cnx, "…", "…")`, ADO `.Open "…", "…", "…"` | Credential positions redacted |
| Multi-word keys | `data source`, `initial catalog`, `connection string` | Redacted |
| **Negative** — parameter passing | `Password = Arg.Something` | **Not** redacted |
| **Negative** — variable reference | `..User = sConfigUser` | **Not** redacted |
| **Negative** — unterminated quote | `password = "unclosed` then a page of content | Remainder **not** consumed |
| **Negative** — word-boundary | `CurrentUserName = "Sales"` | **Not** matched by the bare `user` key |

## Unit — token allocation (T003)

- Same value appearing in 12 places → **1** token, 12 findings.
- 3 distinct values → **3** distinct tokens.
- Token round-trips through Markdown, JSON, SQL and TSX without escaping.
- The value-to-token map is not present in any file written during the run.

## Unit — sidecar (T005)

- No findings → sidecar **not** written.
- Findings present → sidecar written with token, artifact, line, key.
- **Assert no credential value appears in the sidecar in any form** — full, truncated, hashed, or
  partially masked. This is the single most important assertion in the suite.
- Header contains the rotation requirement, the prior-disclosure statement, and the
  mitigation-not-guarantee statement.
- Sidecar carries the watermark.

## Integration — fidelity (T013)

Run the same fixture with redaction active and inactive.

- Element manifest **byte-identical**: file names, kinds, page ranges, `_discarded.md` contents, file
  count.
- Any diff other than a credential value fails the test.
- Rationale: the stage sits upstream of classification in a script whose docstring records a prior bug
  that silently dropped real queries and the entire procedure layer.

## Integration — signal preservation (metric 5)

Fixture with **N** credentials across **M** procedures sharing **K** distinct values:

- exactly **N** findings reported,
- exactly **K** distinct tokens allocated,
- all **M** procedures still present with their credential-handling code intact,
- **0** unquoted right-hand sides redacted.

An implementation that scores perfectly on "zero values in output" by deleting the credential-bearing
procedures fails here. That is the purpose of this test.

## Integration — watermark preservation (T004, T009)

After the funnel refactor, a conversion run still produces watermarked `.md` output. Guards the
SCOPE-082 regression: `stamp_markdown` lives inside the one function being generalised, and six of the
scripts being routed through it never had watermarking.

## Integration — scan mode (T007)

- Against a fixture reproducing the reported leak shape (literals in `analysis/*.json` with no
  producer script): every literal reported with file, line and key.
- **No file modified** — assert mtimes and contents unchanged.
- Clean directory → exit 0 with an explicit "no credential literals found" message.
- `--fail-on-secrets` → non-zero when findings exist.

## Integration — AI path covered without the SKILL.md rule (C-12)

The requirement that stops FR-011 being a single point of failure. See C-12.

- Write an artifact containing a credential literal **with the `SKILL.md` rule absent** — simulating a
  consumer whose customised file never received it.
- Run the scanner (T007) plus the gate (T006). **Assert the literal is still reported** and, with
  `--fail-on-secrets`, that the run exits non-zero.
- No `SKILL.md` may be read or referenced anywhere in that path.

If this test cannot pass, the AI-authored path depends entirely on a file the upgrade may not deliver.

## Build gate — rule-version marker (T014, T016)

- Marker present and current → no message.
- Marker **absent** → message naming the redaction guardrail specifically, stating the AI-authored
  path is relying on the scanner alone. Not a generic changed-file notice.
- Marker **behind** the shipped version → same message.
- **Assert the check never writes to a consumer's `SKILL.md`** — detection only.

## Build gate — parity (T016)

- All 9 copies of `wxconv_redact.py` byte-identical; a single diverging byte fails and names the
  paths.
- Same for `wxkanban_watermark.py`.
- `Bugs/pcsoft-page-to-react_PATCHED.py` present in the inventory.
- Runs under `auditfences --strict` in CI. Fails hard — no local warn-only mode.

## Build gate — no unmediated writes (metric 2)

Grep across all 54 conversion scripts asserts **0** occurrences of a bare `open(..., "w")` write. This
is what prevents the nineteenth emitter from silently reintroducing the leak.

## Encoding gate (C-1)

After any edit to `pcsoft-doc-split.py`, in every tree: byte-compare the MOJIBAKE table (lines 51-57)
against its pre-edit state. A lossy rewrite throws nothing and degrades output weeks later.

## Amendment A — field-reported matcher gaps (T020)

Positive, in `test_wxconv_redact.py`:

- `authorization`, `auth` and Hungarian `sAuthorization` keyed assignments redact.
- The reported instance redacts: an unrelated assignment whose value is named only by the comment on
  the following line. **Assert the assignment and the comment both survive** — the record of which
  procedure carries the credential is the rebuild signal, and blanking it is the worse defect.
- Same-line trailing comment form (what the source looks like before PDF extraction wraps it).
- All four comment markers: `//` (WLanguage), `'` (VB6), `!` (Clarion), `--` (embedded SQL).
- The finding's key names the credential the comment pointed at, and its line number points at the
  VALUE, not at the comment.
- Idempotent: `write_text()` re-scrubs text `clean_text()` already scrubbed, so this rule runs twice
  over the same text by design and must not tokenise its own token.

Negative — these pin the rule from over-reaching and must pass both before and after the fix:

- Prose comments (`// move the password to config`) leave the neighbouring literal byte-identical.
  This rule picks its victim from the comment, so this is the one that matters.
- `//Customer.UserName`, `//passwordhash`, `//Tank.fluid` — key does not end its identifier.
- A comment two lines below is not adjacent.
- `Author = "Fabrice"`, `authcode = "x"`, `AuthorName = "Fabrice"` — bare `auth` does not overmatch.

Suite is 50 tests; run green in all 9 script directories, not just the canonical one.

## Manual verification (T018)

- Kit release assets **explicitly confirmed present** on GitHub Releases, both channels.
- Consumer upgrade delivers `wxconv_redact.py` to all 3 family directories on disk.
- `--version` reports the bumped version.
