# Quickstart: Conversion Credential Redaction

**Spec**: 125 · **Spec ID**: `b9b6771b-2176-400f-8cd1-45a5ca8f7674`

---

## What this is

The three legacy-conversion pipelines copy source text verbatim into their output. Legacy WinDev, VB6
and Clarion apps hardcode database credentials, so those literals land in committed artifacts and get
read into AI context on every session. This spec adds a redaction boundary that removes the **value**
while keeping the **finding**.

## Where the code lives

Nine scripts directories — three families across three trees, all byte-identical:

```
.claude/{wx,vb,cw}Conversion/scripts/
_wxAI/skills/{wx,vb,cw}Conversion/scripts/
wxkanban-agent/templates/skills/{wx,vb,cw}Conversion/scripts/
```

Six scripts per family + `wxkanban_watermark.py`. Every change lands in **all three trees**.

## Start here

1. **T001** — write `wxconv_redact.py` in one family directory, with tests. Do not wire it yet.
2. **T004** — write `write_text()`. Six of the target scripts emit through bare
   `open(path, "w").write(...)` and have nothing to hook until this exists.
3. Then Phase C wires each family.

## The three things that will bite you

**The MOJIBAKE table.** `pcsoft-doc-split.py` lines 51-57 hold encoding-repair keys that are raw
multi-byte UTF-8. A lossy rewrite destroys them and **nothing throws** — conversions just start
emitting mojibake. Byte-verify after every edit. Do not put this file through a tooling MODIFY path.

**The watermark call.** `stamp_markdown` lives inside `pcsoft-doc-split.py`'s `write()` — the function
you are generalising. The other five scripts never had it. Lose it and every conversion artifact
silently un-watermarks.

**Over-redaction.** Only quoted literals get redacted. `Password = Arg.Something` must survive
untouched, or you destroy the record of which procedures handle credentials — which is the output the
rebuild actually needs.

## Verify your work

```bash
# pattern + token + sidecar unit tests
python -m pytest .claude/wxConversion/scripts/

# no unmediated writes remain
grep -rn 'open([^)]*"w"' .claude/*/scripts/*.py

# nine copies identical + fences clean
npx tsx wxkanban-agent/... auditfences --strict

# scope + spec quality gate
npx tsx <preflight harness>   # both score 100
```

## Definition of done

Not "the regex works." Done is: metric 5 passes (signal preserved, not just values removed), the
manifest is byte-identical with redaction on and off, the parity guard is green, the kit release
assets are **verified present**, and feedback `f99e80aa` is closed with the shipped version named.

## What this does not fix

Credentials already committed and already read by a model are **already disclosed**. Redaction is
forward-looking only. Rotation of the affected legacy accounts is the only remedy and is not
deliverable from this repository.
