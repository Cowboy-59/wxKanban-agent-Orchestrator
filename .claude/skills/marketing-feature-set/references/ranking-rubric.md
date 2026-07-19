# "Biggest bang" ranking rubric

The point of ranking is to decide **what leads** — the catalog order and which billboards flip first.
It is a *starting proposal*; the user reprioritizes after (step 3). Do not skip the human check.

## The four axes (score each 1–5)

Judge each feature from the **buyer's** point of view, biased toward the project's beachhead
(WinDev → AI) and career-changer segments.

| Axis | Question | 1 | 5 |
|------|----------|---|---|
| **reach** | How many prospects have this pain? | niche | nearly everyone in the target market |
| **differentiation** | How hard is this to get elsewhere? | commodity, every competitor has it | unique / signature to wxKanban |
| **painurgency** | How acute is the pain it removes? | nice-to-have | actively hurts today, they'd pay to stop it |
| **proofnow** | Can we *show* it working right now? | vaporware / deferred | shipped, demoable on the live app |

`score = reach + differentiation + painurgency + proofnow` (max 20). Sort descending → `rank`.

`proofnow` is deliberately weighted equal to the rest: a shipped, demoable feature beats a stronger-
on-paper one that isn't built yet, because marketing can only credibly sell what exists. Cross-check
`proofnow` against actual build state (memory / git / the dev-plan), not the spec's intent.

## Tie-breakers

1. Higher `proofnow` wins (sell what's real).
2. Better fit to the **primary** segment (WinDev conversion) wins.
3. Fewer dependencies to explain wins (a feature you can pitch in one sentence beats one needing setup).

## Worked example

| Feature | reach | diff | pain | proof | score |
|---------|:-:|:-:|:-:|:-:|:-:|
| Guided WinDev→AI conversion | 4 | 5 | 5 | 5 | **19** |
| One board for every PM tool | 5 | 3 | 5 | 5 | **18** |
| 6-phase lifecycle methodology | 4 | 5 | 4 | 5 | **18** |
| Time tracking → invoices | 4 | 2 | 4 | 5 | **15** |
| SOC 2 posture | 2 | 3 | 3 | 4 | **12** |

Conversion tops it (signature + acute + demoable), even though the PM board has broader reach — the
beachhead is WinDev shops, and conversion is the thing only wxKanban does for them.

## After scoring — reprioritize with the user

Present the top ~8 with scores and one-line rationales, then ask what to promote/demote. Common human
overrides the rubric misses: a feature that photographs well for a billboard, a seasonal campaign
angle, a lighthouse-customer story, or a channel where one feature massively out-converts. Record the
override in `priorityOverride` + `impact.note`.
