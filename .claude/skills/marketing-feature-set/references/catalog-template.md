# Catalog + JSON — skeleton and schema

Two files, kept in sync. The `.md` is human-facing; the `.json` drives every script.

## `marketing/feature-set.md` skeleton

Order features by `rank` (best first). Group by product area under `##` headings. One block per
feature. Keep provenance in the footnote line, never in the name/prop.

```markdown
# wxKanban — Marketing Feature Set

> Derived from specs/Project-Scope/*.md + specs/main/spec.md. Point-in-time snapshot; regenerate
> after scopes change. Rank = "biggest bang" score (see the skill's ranking-rubric).

## Top of the ranking — lead with these

1. **One Board for Every PM Tool** — See every task from Jira, Monday, Asana, and Trello in a single
   board. *Broad. Kills the context-switch tax across five tools.* — score 19 · `SCOPE-002`, `FR-003`, `FR-011`
2. **Bill Every Minute** — ...

## Task Management

### One Board for Every PM Tool
- **Value:** See every task from Jira, Monday, Asana, and Trello in a single board.
- **For:** Broad (any developer juggling multiple PM tools)
- **Benefit:** Stop paying the context-switch tax across five tools.
- **Rank:** 1 (score 19) — reach 5 · differentiation 4 · pain 5 · proof-now 5
- _Source: SCOPE-002, SPEC-001/FR-003, FR-011_

### Bill Every Minute
- ...
```

## `marketing/feature-set.json` schema

```json
{
  "generatedAt": null,
  "source": "specs/Project-Scope/*.md + specs/main/spec.md",
  "brand": {
    "accent": "#c8761b",
    "navy": "#0f1722",
    "logo": "marketing/site/wxKanbanLight.png",
    "cta": "Get started →",
    "ctaUrl": "windev.wxperts.com"
  },
  "features": [
    {
      "slug": "unified-task-aggregation",
      "rank": 1,
      "impact": {
        "reach": 5,
        "differentiation": 4,
        "painurgency": 5,
        "proofnow": 5,
        "score": 19,
        "note": "Every multi-tool developer feels this daily."
      },
      "priorityOverride": null,
      "category": "Task Management",
      "name": "One Board for Every PM Tool",
      "valueProp": "See every task from Jira, Monday, Asana, and Trello in a single board.",
      "audience": "broad",
      "benefit": "Stop paying the context-switch tax across five tools.",
      "sourceRefs": ["SCOPE-002", "SPEC-001/FR-003", "FR-011"],
      "banner": {
        "eyebrow": "TASK MANAGEMENT",
        "headline": "One board. Every tool.",
        "subhead": "Jira, Monday, Asana, Trello — unified.",
        "cta": "See it live →",
        "background": null,
        "presets": ["billboard", "og"]
      },
      "locales": {
        "fr-FR": {
          "name": "Un seul tableau pour tous vos outils",
          "valueProp": "Voyez chaque tâche de Jira, Monday, Asana et Trello dans un seul tableau.",
          "benefit": "Fini l'impôt du changement de contexte entre cinq outils.",
          "banner": {
            "eyebrow": "GESTION DES TÂCHES",
            "headline": "Un tableau. Tous les outils.",
            "subhead": "Jira, Monday, Asana, Trello — unifiés.",
            "cta": "Voir la démo →"
          }
        }
      },
      "social": {
        "channels": ["linkedin", "x", "facebook"],
        "seedDrafts": true
      }
    }
  ]
}
```

### Field notes

- **`generatedAt`** — leave `null`; the scripts date the render. (Skill scripts cannot call
  `Date.now()`; stamp it manually only if a fixed date is wanted.)
- **`brand`** — defaults mirror `src/server/lib/banner-brand.ts` + the live landing page. `logo` is a
  local path or URL; `ctaUrl` is shown as plain text on the banner, not linked.
- **`rank` / `impact` / `priorityOverride`** — from step 3. `score = reach + differentiation +
  painurgency + proofnow` (max 20). `priorityOverride` (integer or null) wins over `score` for
  ordering when the user manually bumps a feature; add the reason to `impact.note`.
- **`audience`** — exactly one of `windev` · `careerchanger` · `broad` (the DB `targetsegment` values).
- **`sourceRefs`** — the scopes/FRs this feature distills. Required, ≥1.
- **`banner`** — text for the overlay (kept short — banners are not paragraphs). `background`: a local
  image path (converted to a data-URI) or an `http(s)` URL; `null` → navy brand fallback. `presets`:
  any of `billboard`, `og`, `leaderboard`, `mrec`, `skyscraper`, `halfpage` (see `banners.md`).
- **`locales`** — optional per-language overrides. Each locale may restate `name`/`valueProp`/`benefit`
  (→ its own marketingassets row) and/or `banner` text (→ its own banner PNGs). Missing languages are
  filled later by SCOPE-065's Translate action, not by this skill. Locale keys use the project set:
  `fr-FR`, `de-DE`, `es-ES`, `it-IT`, `pt-BR`.
- **`social`** — `channels` seed one `post` draft each on import (`linkedin`, `x`, `facebook`,
  `reddit`, `youtube`); `seedDrafts:false` skips post seeding for that feature.
