# Contract: Analyze findings (SPEC-156)

**Implements**: FR-006, FR-008, FR-009, FR-011, FR-012 · **Helper**: `.claude/skills/wxBrainstorm/scripts/analyze-findings.mjs`
(plain Node 20, no dependencies). No server route, no database table.

## 1. Analyzer findings file (input)

Every analyzer that runs with `--collect-only` writes one JSON file. That file is what the helper reads.

```json
{
  "analyzer": "wxUIUXCodeReview",
  "checked": true,
  "notCheckedReason": null,
  "findings": [
    {
      "rule": "missing-empty-state",
      "path": "src/client/pages/Board.tsx",
      "line": 120,
      "anchor": "BoardPage",
      "snippet": "{items.map(...)}",
      "message": "List has no empty state",
      "list": "gap",
      "confidence": "Confirmed",
      "feature": null
    }
  ]
}
```

- `analyzer` and `rule` are required. `list` must be `must-fix`, `gap` or `optional`. If it is missing, the value is `gap`.
- `confidence` must be one of: Confirmed, Likely, Assumed, Unknown, Conflicting. If it is missing, the value is `Assumed`.
- `path` is relative to the repo. Backslashes become `/`.
- `line` is used only for display. It never goes into the fingerprint.
- `anchor` is optional. If it is missing, the anchor is the `snippet` with its whitespace collapsed, cut to 120 characters.
- wxDBAnalyze findings carry `table`, `column` and `count`. The helper keeps only those fields from a wxDBAnalyze finding. It drops `snippet`, `sample` and `values` from every finding.

## 2. Sitting data file (output)

The file is `docs/brainstorms/analyze/YYYY-MM-DD-<label>.json` in the analyzed app's repo.

```json
{
  "label": "app-a",
  "sittingDate": "2026-11-08",
  "analyzers": [{ "id": "wxUIUXCodeReview", "class": "moderate", "model": "sonnet", "checked": true, "notCheckedReason": null }],
  "databaseChecked": false,
  "featureGroups": ["Board", "Billing"],
  "findings": [
    {
      "fingerprint": "<sha256 hex>",
      "evidenceHash": "<sha256 hex>",
      "feature": "Board",
      "list": "gap",
      "analyzers": ["wxUIUXCodeReview"],
      "rule": "missing-empty-state",
      "location": "src/client/pages/Board.tsx:120",
      "evidence": "List has no empty state | {items.map(...)}",
      "confidence": "Confirmed",
      "status": "new",
      "decision": null,
      "reason": null,
      "decidedAt": null,
      "decidedBy": null,
      "scope": null
    }
  ],
  "sittingClosed": false
}
```

- **fingerprint**: SHA-256 of `analyzer|rule|path|anchor`. When a merged finding has several analyzers, it uses the first analyzer in sorted order.
- **evidenceHash**: SHA-256 of `message + " | " + snippet`, with whitespace collapsed.
- **Merging**: two findings with the same `rule|path|anchor` become one record. All of their analyzers are credited. Each analyzer's own key stays recorded in the record's `keys[]`, so `compare` can match on any of them.
- **feature**: when a finding's `feature` is not one of the `featureGroups`, it is set to `Unplaced`. The finding is never dropped.
- **decision**: `keep`, `not-needed`, `parked`, or `null`. A record with a decision also needs `decidedAt` (an ISO date) and `decidedBy`. A `not-needed` decision also needs a `reason`.

## 3. Write guards (FR-008, FR-011)

Every subcommand that writes runs `guard` first. If the guard finds a problem, the command exits with code 2, prints one line naming the field, and writes nothing. The guard refuses any string value that:

- looks like a credential, unless it is an existing redaction token such as `[REDACTED:…]` or `${…}`. That covers:
  - `password=…`, `pwd=`, `secret=`, `token=` or `apikey=` with a value;
  - a bearer token;
  - an `AKIA…` key;
  - a PEM block;
  - a connection string with `user:pass@`;
  - a string with `sk-` / `ghp_` / `xox` followed by 20 or more characters.
- looks like personal data:
  - an email address;
  - a phone number (10 or more digits, with separators);
  - a US SSN pattern.
- carries a database row value: any `sample`, `values`, `rows` or `example` key anywhere in the record.

## 4. Subcommands

Every subcommand reads JSON files and prints JSON to stdout. It exits with 0 on success, 1 on bad input, and 2 when a guard refuses or a check is blocked.

| Command | In | Out |
|---|---|---|
| `merge --out <data.json> --label <l> --date <d> --groups <a,b> [--db-checked] <findings.json>...` | analyzer findings files | Writes the sitting data file. Prints `{ written, findings, analyzers }` |
| `compare --previous <old.json> --current <new.json> [--out <file>]` | two sitting data files | Sets each current finding's `status` (`new` / `still-open` / `previously-declined`) and adds fixed records with `status: "fixed"`. A previously declined finding keeps its decision when its evidence hash is unchanged (`resurface: false`); it gets `resurface: true` when the hash changed. Prints `{ new, stillOpen, fixed, previouslyDeclined, resurfaced }` |
| `cross-app --app <label>=<data.json> ...` | two or more sitting data files (read only) | `{ proposals: [{ analyzer, rule, apps: [labels], findings }] }`. A rule found in only one app is never proposed |
| `decide --file <data.json> --fingerprint <fp> --decision keep\|not-needed\|parked --by <who> [--reason …] [--scope SCOPE-NNN]` | one sitting data file | Records one decision with `decidedAt` (now, ISO) and `decidedBy`. Refuses when the sitting is closed, or when a decline has no reason. Rewrites the file through the guard |
| `close <data.json>` | one sitting data file | Sets `sittingClosed: true` only when `check` passes. Exits with 2 when the sitting cannot close |
| `check <data.json>` | one sitting data file | `{ closable, undecided: [fingerprint…], invalid: [...] }`. Exits with 2 when the sitting cannot close |
| `guard <file.json>` | any JSON | `{ ok, problems: [{ path, kind }] }`. Exits with 2 when it finds a problem |

`cross-app` and `check` never write. `compare` writes only to `--out`.
