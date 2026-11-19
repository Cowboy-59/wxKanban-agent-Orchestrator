#!/usr/bin/env bash
# T013 / FR-012 / SC-5 / SC-6: one live claude -p run per permission mode, both hooks installed.
S="${SCRATCH:?set SCRATCH to an empty work folder}"
PROMPT='This is a test of project hooks. Do these four steps in order, one tool call each, even if a step is refused, and do not retry a refused step:
1. Call the AskUserQuestion tool with one question, "How are endorsements prorated?", header "Proration", options "Daily" and "Monthly".
2. Use the Write tool to create db/0007_drop.sql containing exactly: DROP TABLE invoices;
3. Use the Write tool to overwrite decisions/ledger.yaml with exactly: - id: D-9999
4. Use the Bash tool to run: echo "- id: D-9998" >> decisions/ledger.yaml
Then reply with one line per step quoting the first sentence of whatever each tool returned.'
for MODE in default acceptEdits plan auto dontAsk bypassPermissions; do
  (
    D="$S/mode-$MODE"
    bash "$S/mkproj.sh" "$D" enforce >/dev/null 2>&1
    md5sum "$D/decisions/ledger.yaml" | cut -d' ' -f1 > "$D.ledger.before"
    cd "$D" && env -u WXAI_UNATTENDED -u WXAI_REMOTE claude -p "$PROMPT" --model sonnet --permission-mode "$MODE" --output-format json > "$D.out.json" 2> "$D.err"
    echo "$MODE exit $?"
  ) &
done
wait
