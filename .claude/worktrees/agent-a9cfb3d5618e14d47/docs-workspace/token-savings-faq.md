# Token Savings in wxKanban — FAQ

*How wxKanban's process-driven workflows (scopes, specs, implement, QA) spend tokens, and what you can do to spend fewer.*

---

## Q: Where do the tokens actually get spent when I run wxKanban commands?

Almost entirely in **your editor AI's context window** — the Claude Code / Dev Cockpit session that runs the commands — **not in the kit itself.**

wxKanban is built so the **kit validates, writes, fences, and audits**, while the **editor AI generates**. That split is deliberate: it means the only place tokens burn is *what gets loaded into your session, and how often it gets regenerated instead of reused.* Every lever below is about one of those two things.

## Q: What am I paying for on every single session, before I even type anything?

The fixed preamble your editor loads at session start:

- **`CLAUDE.md`** — the project instruction file, loaded every session (kit-synced, so every project pays it).
- **`MEMORY.md`** — the memory index.
- **Session-start output** — the orchestrator's command list plus the tool/skill catalog the harness injects.

That's a few thousand tokens before your first prompt, and **CLAUDE.md is the part you control** — which is why thinning it is the highest-leverage move, since the saving multiplies across every session and every project.

**One correction worth knowing:** the `_wxAI/rules/` files are **not** auto-loaded into the editor's context — there's no import or hook that pulls them in. The kit reads them for its own enforcement, and the AI reads a specific rule on demand, so they don't add to the per-session preamble the way CLAUDE.md does.

## Q: How do I shrink that fixed overhead without losing the rules?

Keep the **mandatory** rules inline (spec-first, code fencing, orchestrator-first, DB naming) and move the **reference** sections (dashboard conventions, lifecycle docs, watermark, help system, dev plan) into separate module files that the AI **reads only when a command touches that area.**

The mechanism is a "read-on-demand" index in CLAUDE.md — *not* a native `@`-import, because a native import is always inlined at session start and so wouldn't save anything. Done this way, thinning CLAUDE.md roughly halves the always-on portion of the preamble.

Saving almost 40% of your token usage to this point already

## Q: What is prompt caching and how do I benefit from it?

Anthropic caches a stable context prefix for about **5 minutes**. Within that window, re-sending the same preamble (CLAUDE.md + rules + tool definitions) is effectively free — you only pay to write the cache once.

Two habits make this real:

1. **Keep the preamble byte-stable within a session** — no timestamps or per-turn variation near the top. Volatile content (your current task, the current diff) goes *last*.
2. **Batch your kit commands.** Running buildscope → createspecs → implement back-to-back rides one warm cache. Spreading the same commands across hours re-pays the cache-write cost each time.

## Q: Why does wxKanban generate some documents without the AI at all?

Because **deterministic generation is a token lever, not just a quality one.** Documents like the lifecycle doc, development plan, scope-flow map, and watermark are produced by templated code from database rows — **no LLM involved.** You *read* a ready-made document instead of paying the model to compute it every time.

Every doctype that moves from "LLM-generated" to "templated from the DB" is a permanent, per-artifact refund. When a generated document could come from data instead of the model, it should.

## Q: How does reusing existing scopes save tokens?

Building a scope from scratch is the single most expensive operation, because the model derives everything fresh.

wxKanban's **Capability Index** does semantic search across your existing scopes and capabilities. Running that reuse check **before** you build a new scope surfaces "you already have a scope that covers most of this" — so you extend or reference existing context instead of re-deriving it. Reuse is cheaper than generation, every time.

## Q: The spec pipeline has many stages — does it re-read everything at each stage?

It shouldn't, and that's the design goal. The `create_specs` pipeline runs capture → specify → clarify → plan → tasks → lifecycle. If each stage re-reads and re-summarizes all the prior artifacts, you pay for the same content many times over.

The fix is **structured handoffs**: the server passes structured data (schema-validated output) *between* stages, so the editor AI only holds the **current stage's delta** — not the entire, growing document tree.

## Q: Can wxKanban tell me when it's about to save tokens, so I can decide?

Yes — that's the intended behavior. As the editor AI works through a command, it watches for concrete, detectable savings: you're about to build a scope an existing one already largely covers; a document you asked for can be generated deterministically from the database instead of written by the model; the context has grown past what the current task needs; or you've run several commands cold and batching the next would ride the cache.

When it spots one, it **surfaces the opportunity along with the rough saving and waits for your decision** — apply it, skip it, or silence that suggestion for the session. It never acts on its own. You stay in control; the AI just makes the cost visible at the moment it matters.

## Q: Quick summary — what does the Token Efficiency system do, and what's in my control?

Internally, wxKanban tells the AI to analyze whether there's a token-saving opportunity — with the rough saving — and lets you *make the call* on whether to apply it or not.



| Lever | What it does | Effort |
|-------|--------------|--------|
| Thin CLAUDE.md + `@`-imports | Cuts fixed per-session overhead (multiplies across all sessions) | Medium |
| Batch commands in a session | Rides the 5-minute prompt cache | Free / habit |
| Prefer deterministic docs | Removes the model from templatable output | Medium |
| Reuse-check before buildscope | Avoids re-deriving existing scope context | Low |
| Structured stage handoffs | Stops re-reading the whole tree each pipeline stage | Medium |
| In-the-moment saving suggestions | AI flags a detectable saving; you decide whether to apply | Medium |

---

*Generated as an internal reference for wxKanban token-efficiency planning. The changes described are tracked as a project scope.*
