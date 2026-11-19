# Isolated wxConversion Stage 3 parser patch review

Status: parser regression candidate verified in isolation; NOT installed. PostgreSQL mappings and Stage 3 schema readiness remain unapproved.

## Baseline and isolation

Branch main; HEAD 6b151a7a58d3c40c4e821ca2e93779819fb789fc. Project/orchestrator kit v1.7.83/1.7.83; root package 1.7.76. Existing dirty work is recorded in before.json, without staging, reset, stash or restoration. All writes for this task are confined to this new directory.

The original installed skill was read in full. Current hosted Stage 3 guidance is recorded in evidence/cockpit-guidance.json. No explicit prohibition of an isolated patch was found. No feedback, scope or task write was made.

Original generator SHA-256: f38b62bf52bacce2f9fddbbc22786cb26bf8f32c58415b3c4f3386184b6873b9

Patched generator SHA-256: be9b2720bb09d2c12a9126a82adb55af1cd5e51e119d161d930371b71974df45

Patch SHA-256: e3b8070af07600a1f99dae54c81e67c2028d8e50ee1b17282f772f2b0bebbbf7

original/scripts is an immutable byte-for-byte copy with all copied-file hashes in copied-files.json. patched/scripts is the candidate. Test fixtures and execution/reporting helpers are review infrastructure, not another converter. The splitter is copied solely because existing fidelity tests import its synthetic clean_text seam; the actual ShopMaster PDF was never re-extracted.

## Implemented scope

Changed definitions: match_type, parse_table, recover_truncated_names, apply_renames_to_links, report_unmapped, main.

Added definitions: _SourceLine, _element_type, recognize_source_type, _field_diagnostic, validate_source_tables.

Source recognition now retains array/JSON/UUID records independently of TYPEMAP. Wrapped array integer/unsigned continuations and date/time formats remain attached to their field. String element widths, signedness and byte widths are retained. Source metadata preserves original Markdown line spans, source order, printed/canonical names, raw type fragments, size annotations and available PDF page ranges. Exact PDF pages are asserted only by the independent checked oracle where available.

Unknown records remain in the parsed source inventory and block mapping. Unexplained boundaries, incomplete declarations, unresolved names/collisions and ambiguous relationship renames block emission. Distinct clipped SalesReport rows have different source IDs. No mappings for arrays, JSON or UUID were added, and scalar overrides cannot flatten them.

Name recovery reuses supplied captions/dictionary/control bindings only, retaining printed names and recovery evidence. Existing unresolved tails are not guessed. Ambiguous link recovery no longer silently takes the last value; original ambiguous relationship tuples are retained in diagnostics.

Corpus testing also identified numeric per-element default annotations and clipped GUID-string defaults. Their raw annotations are retained without normalising values. Consoles.ScreenOffset and Server_Consoles.ScreenOffset have a caption/type joined into one text run in the original PDF (pp382 and 538); the isolated parser separates an exact scalar suffix only when the ordinary type position is not recognised. Both independent source rows and following ReceiptPrinter fields survive. No source files were edited.

## Regression results

Final baseline comparison: 93 pass, 19 fail, 16 excluded. The 19 baseline failures are new regression requirements; two new control tests already passed before the patch.

Final patched run: 112 pass, zero failures, 16 excluded.

| Suite | Passed | Excluded |
|---|---:|---:|
| test_pcsoft_schema_parse.py | 27 | 7 |
| test_field_reports_schema.py | 7 | 9 |
| test_wxconv_redact.py | 53 | 0 |
| test_conversion_fidelity.py | 4 | 0 |
| test_boundaries.py | 21 | 0 |

One copied official test was strengthened: it previously expected an unknown Character field to be dropped. It now requires retaining that field with an unresolved mapping and a diagnostic. This implements the owner's explicit contract; supported scalar expectations were not relaxed. The installed test remains untouched.

The 16 exclusions are explicitly listed in both test-result JSON files. They require DDL/ER emission, generator subprocesses or SQL and were not authorised. No claim is made that the entire unfiltered official suite ran. Existing SQL-emitting tests were not replaced by passing placeholders. Structural composite/foreign-key assertions run separately without generating SQL.

The runner installs audit guards denying SQL connections, network connects/binds, subprocesses, and writes outside the isolated root. DDL/ER emitters are replaced with refusal spies during permitted tests. Temporary files stay under temp/. Existing fidelity tests operate on synthetic content/clean_text; no real source extraction was repeated.

## Source reconciliation

303/303 source tables and 150/150 Server_ tables accounted for. Parsed inventory: 7,570 source records, including composite-key pseudo-items; this is not a generated PostgreSQL column count.

All 278 arrays, four JSON fields and both UUID fields pass source-row assertions independently matched to the original-PDF oracle and Markdown positions. All 63 previously absorbed scalar rows plus both composite-key rows pass independent position/name checks. All source IDs are distinct; source spans do not overlap and order is retained.

7,213 legacy scalar/composite records compare unchanged across caption, HFSQL type, key, width, default and components. 79 legacy records containing swallowed Array/UUID/JSON declarations are identified as previously corrupted; two joined-caption/type scalar records are separately corrected from direct source evidence. Zero unexplained legacy differences remain.

All 66 original relationship tuples match the unmodified parser's source tuples exactly, in order. All 66 remain after name recovery, with no endpoint changes in this corpus. This preserves the supplied relationship evidence, not proof that future PostgreSQL constraints have been generated or accepted.

## Controlled refusal and remaining decisions

Direct parser/validation/report functions returned exit code 3, with a complete serialised inventory of 392 blocking occurrences in evidence/controlled-failure/_unmapped-types.json:

- 284 TARGET_MAPPING_UNRESOLVED.
- 45 CANONICAL_NAME_UNRESOLVED.
- 63 CANONICAL_NAME_COLLISION.

These are diagnostic occurrences, not counts of unique missing columns. Collisions include repeated optimiser composite-key names, not only SalesReport columns. Detailed source rows and candidate evidence are in evidence/corpus-result.json. No unresolved source-type or unexplained-boundary diagnostics remain in this checked corpus. All seven requested diagnostic categories have code paths, with focused failure fixtures where applicable.

No new CLI mode was introduced. No PostgreSQL DDL or ER diagram was emitted, even in the controlled refusal test. The defensive mapping guard remains active. Future array/JSON/UUID representation, NULL/empty behaviour, money precision and source-name ambiguity still require separate decisions. The database schema is NOT ready.

## Security

53 existing redaction tests and four fidelity tests pass. A new diagnostic-literal fixture proves values are redacted before JSON serialisation. Diagnostics exclude defaults/record data. They use the existing redactor and write funnel; --fail-on-secrets remains present and the controlled CLI refusal is non-zero. Source-derived evidence scans found zero matched credential literals. Copied test fixtures deliberately contain synthetic redaction examples; they are not real customer credentials.

## Protection

All 3511 recorded original files retain their before-run hashes. This includes the installed converter/helpers/tests, all pre-convert material, existing rebuild application files, scratch previews, specifications and the original PDF. All original copy hashes match. No dependency install, kit update, project configuration change, Scope 012/status change, database access, SQL, export/import, feedback submission, commit or push occurred.

The unrelated .architecture-proof databases were not accessed. Existing path names were recorded via git status only. Background work may change unrelated runtime inventories; no blanket repository-cleanliness claim is made.

## Compatibility and review limits

CLI flags and official input/output locations remain unchanged. The existing parse_table tuple return and scalar field keys remain, with additive source metadata. The diagnostic sidecar retains a legacy types summary and adds diagnosticsVersion=2 plus complete occurrences. Strict refusal for unresolved source identities is intentionally stronger than the previous comment-and-continue behaviour. The field-name heuristics are not presented as complete name recovery.

No production DDL or SQL-emitting regression was run. No real HExportJSON representation was tested. PostgreSQL syntax, array/JSON/UUID mappings, import correctness, source parity beyond the checked evidence, and production readiness remain unverified. Canonical names remain blocked rather than asserted complete.

## Review artifacts and reproduction

- parser-review.patch: generator delta, one strengthened copied test and new focused fixtures.
- copied-files.json: all copied source identities/hashes.
- before.json: protected-file hashes and initial dirty/untracked paths.
- evidence/original-tests.json and patched-tests.json: every test result/exclusion.
- source-oracle.json: original-PDF checked structured/adjacent-row expectations.
- evidence/corpus-result.json: row identities, relationship tuples, recovery decisions and blockers.
- evidence/controlled-failure/_unmapped-types.json: complete blocking inventory.
- evidence/package-summary.json: machine-readable hashes and validation summary.

Reproduce from the project root with the existing Python environment; do not run the patched generator CLI against production outputs:

    .\.venv\Scripts\python.exe -B conversion/parser-review/stage3-2026-10-25/run_offline_tests.py original
    .\.venv\Scripts\python.exe -B conversion/parser-review/stage3-2026-10-25/run_offline_tests.py patched
    .\.venv\Scripts\python.exe -B conversion/parser-review/stage3-2026-10-25/audit_corpus.py

## Installation proposal — NOT executed

After owner approval, obtain wxKanban maintainer review/accepted delivery route. Verify the installed generator still hashes to the original value above; stop on any difference. Retain a byte-for-byte preimage, copy only the accepted generator change (and approved tests), verify the accepted patched hash, then repeat the bounded offline checks. Do not apply this review patch blindly at repository root. No helper, skill, command, stack or application change is required. No DDL generation is included in that installation approval.

Rollback, only if later installation occurred: first verify the installed file equals the exact accepted patched hash. Restore only that generator from original/scripts/pcsoft-schema-to-sql.py and confirm the original SHA-256. Restore only specifically installed tests from their individual preimages. If hashes differ, stop for reconciliation. Never reset/clean/stash the repository or restore unrelated files. No database rollback is needed because this task performs no database operation.

## Next approval

Approve this isolated patch package for maintainer review and a separately bounded installation decision. Until that approval, leave the installed kit unchanged. Mappings, canonical-name decisions and full Stage 3 generation remain separately gated.
