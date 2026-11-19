# wxKanban — 90-Day Content Calendar (X + LinkedIn)

**Day 1:** Monday 2026-07-27  **Day 90:** Saturday 2026-10-24
**Strategy:** [content-system.md](content-system.md)  **Messaging:** [messaging-hierarchy.md](messaging-hierarchy.md)
**Cadence:** 8 posts/week — 5 on X, 3 on LinkedIn. 13 weeks ≈ **104 slots**.

> Note: the working estimate was "90 slots" for 90 days. At 8 posts/week across 13 weeks
> the real number is **104**. The calendar below is the authority.

## The weekly grid

| Day | X | LinkedIn |
|---|---|---|
| **Mon** | 17:00 UTC | — |
| **Tue** | 13:30 UTC | 11:30 UTC |
| **Wed** | 13:30 UTC | 11:30 UTC |
| **Thu** | 13:30 UTC | 11:30 UTC |
| **Fri** | 17:00 UTC | — |
| **Sat/Sun** | — | — (engagement only, 15 min) |

13:30 UTC = 09:30 ET / 15:30 CEST — the US-morning ∩ Paris-afternoon overlap that matters
for the francophone beachhead. 11:30 UTC = 07:30 ET — the LinkedIn morning-feed window.

## Phase map

| Phase | Weeks | Dates | Lead pillars | CTA |
|---|---|---|---|---|
| **1 — Prove** | 1–4 | Jul 27 – Aug 23 | 3, 1 | None. Close on a question |
| **2 — Provoke** | 5–9 | Aug 24 – Sep 27 | 2, 5 | Soft — bio link only |
| **3 — Convert** | 10–13 | Sep 28 – Oct 25 | 4, 2 + winners | Hard — wxkanban.com in-post |

## Audience rotation

Week A → legacy devs · Week B → AI skeptics/seniors · Week C → career-changers ·
Week D → agencies/consultants. Pillar 3 receipts appear in **every** week regardless.

---

# WEEK 1 — Jul 27–31 · Phase 1 · Audience: legacy devs · **VERBATIM**

Week 1's only job is to establish that a real crossing happened and that you'll show it.
No asks. No links. Every post ends in a question.

---

### Day 1 · Mon Jul 27 · **X** · 17:00 UTC · Pillar 1 · *The series opener*

```
This project management tool used to be a WINDEV application.

Not "inspired by." Not "a rewrite we keep meaning to do."

It was one. We converted it — data, procedures, screens — into an
AI-built full stack.

I'm going to show the whole crossing here: the artifacts, the
mistakes, the parts that didn't survive.

Starting tomorrow.
```
*No link. This post's job is to make the next one worth waiting for.*

---

### Day 2 · Tue Jul 28 · **X** · 13:30 UTC · Pillar 1 · *The four artifacts*

```
Four artifacts. That's all the AI needed to rebuild a 20-year-old
application.

→ The database, exported to generic SQL, then loaded into Postgres
→ Every global procedure, converted to Markdown
→ Every screen, captured as a screenshot
→ Every window's source, converted to text, then to Markdown

That's the input. The AI built from that.

Not one click. Not automatic. Guided, with a human deciding.
But it's four things — not a miracle.

Which of the four would break first on your app?
```
*Attach: screen capture scrolling the four real artifact types.*
**Bookmark-bait — this is the most likely week-1 saver.**

---

### Day 2 · Tue Jul 28 · **LinkedIn** · 11:30 UTC · Pillar 4 · *The apprentice*

```
An ex-mechanic, one year into software, is already good at the
hardest part of this job.

He doesn't have the vocabulary yet. He has the thing that's harder
to teach.

He walks up to a problem and doesn't guess. He reads the symptom,
forms a theory, tests the cheapest one first, and checks his work
before he calls it done.

We have a word for that in software. We call it debugging, and we
treat it like a technical skill.

It isn't. It's judgment. It's the same thing he was doing under a car.

Here's why that matters more now, not less.

AI will write the code. It will write a lot of it, quickly, and some
of it will be confidently wrong. The person who catches that isn't
the fastest typist in the room. It's the one who asks what happens
when this fails.

The hard part of software was never the syntax.

What did you do before software?

#softwaredevelopment #ai #careerchange #mentoring
```
*Highest expected reply rate of week 1 — the closing question is the engine.*

---

### Day 3 · Wed Jul 29 · **X** · 13:30 UTC · Pillar 3 · *Fences*

```
Every function in this codebase says which spec authored it.

// [SCOPE 013 / T042] BEGIN — Audit log retention pruning
   ...
// [SCOPE 013 / T042] END

One command tells me every declaration that's missing one.

When AI writes most of your code, "who wrote this and why" stops
being a git-blame question and becomes an architecture question.

Overkill, or the new minimum bar? Genuinely asking.
```
*Attach: terminal capture of the fence audit exiting clean.*
**Expect disagreement. Disagreement is reach. Stay in the replies.**

---

### Day 3 · Wed Jul 29 · **LinkedIn** · 11:30 UTC · Pillar 3 · *Six stages, five gates* — **CAROUSEL**

Slides:
1. **Six stages. Five gates.** The boring diagram that makes AI-built software shippable.
2. The problem: AI removed the cost of writing code. It didn't remove the cost of shipping the wrong thing.
3. **Design** — decide what "done" means before anything is built.
4. **Implementation** — build against the spec, not against a vibe.
5. **QA** — test what was specified, not what was built.
6. **Human Testing** — someone who isn't you uses it.
7. **Beta** — real users, real data, contained blast radius.
8. **Release** — with an audit trail you could hand to a client.
9. *(screenshot of the real lifecycle view)* This isn't a diagram. It's the gate my own releases pass.
10. The gates are where judgment lives. AI can move between them. It can't decide you're ready to.

Body text:
```
Everyone's asking how to get AI to write more code.

Wrong question. Writing code stopped being the bottleneck.

The bottleneck is deciding what should exist, proving it works, and
being able to show your work afterwards.

Six stages, five gates. The gates are the product.

Which gate does your team actually skip?

#softwaredevelopment #ai #engineeringleadership #softwarequality
```

---

### Day 4 · Thu Jul 30 · **X** · 13:30 UTC · Pillar 2 · *What vibe coding actually gets wrong*

```
Vibe coding doesn't fail because the AI is bad.

It fails because nobody wrote down what "done" means.

The model will cheerfully build you something that runs, passes no
test you defined, and satisfies a requirement nobody stated.

That isn't a model problem. It's the oldest problem in software,
arriving faster than it used to.
```

---

### Day 4 · Thu Jul 30 · **LinkedIn** · 11:30 UTC · Pillar 1 · *The screens survived*

```
The scariest part of rewriting a legacy application isn't the code.

It's the phone call from the client on Monday morning, when their
staff open the new system and nothing is where it was.

So when we converted this product off WINDEV, the screens weren't an
afterthought. They were an input.

Every window: screenshot it, convert its source to text, then to
Markdown. That package — the picture and the structure — is what the
AI rebuilt from.

The result came out modern underneath and familiar on top. The people
using it every day didn't have to relearn their jobs to get the benefit.

That's not a technical detail. That's the difference between a
migration that happens and one that gets postponed for another year.

What would your users riot about losing?

#legacymodernization #softwaredevelopment #ai #ux
```
*Attach: before/after screenshot pair.*

---

### Day 5 · Fri Jul 31 · **X** · 17:00 UTC · Pillar 4 · *The senior question*

```
The question that separates a senior engineer from a fast typist:

"What happens when this fails?"

AI made the typing cheap. It didn't make that question cheaper.
It made it the whole job.

What's the oldest piece of code you're still responsible for?
```

**Sat Aug 1 / Sun Aug 2 — no posts.** 15 min each day: reply to comments, comment on 5
in-niche posts. This is not optional; it's what makes week 2 reach further than week 1.

---

# WEEK 2 — Aug 3–7 · Phase 1 · Audience: AI skeptics / seniors · **VERBATIM**

---

### Day 8 · Mon Aug 3 · **X** · 17:00 UTC · Pillar 3 · *The whole method in one recording*

```
Scope → spec → plan → tasks → code.

One screen recording, start to finish, on a real feature.

The AI does the typing at every step. It doesn't get to decide when
a step is finished.

That's the entire difference.
```
*Attach: 60s screen capture of an orchestrator run. Silent-readable, text overlay.*

---

### Day 9 · Tue Aug 4 · **X** · 13:30 UTC · Pillar 2 · *The reframe*

```
AI made code cheap.

It made judgment expensive.

Price accordingly.
```
*Short by design. This is a quote-bait post — the whole job is to be repeatable in
someone else's words.*

---

### Day 9 · Tue Aug 4 · **LinkedIn** · 11:30 UTC · Pillar 2 · *I skipped the spec on purpose*

```
I let the AI build a feature with no spec, on purpose, to see what
would actually go wrong.

It worked. That was the problem.

The code ran. It was clean. It had tests. And it solved a slightly
different problem than the one I had — because I'd never written
down which problem I had, so the model picked a reasonable one.

I didn't catch it in review. Reviewers check whether code is good.
Almost nobody checks whether it's the right code, because in the old
world writing the wrong thing was slow enough that you noticed
halfway through.

That's what changed. Not the quality. The speed at which you can be
confidently, expensively wrong.

The fix isn't more review. It's deciding what "done" means before
anything gets built — and then having something that refuses to move
on until you have.

Where would this have bitten you hardest?

#ai #softwaredevelopment #engineeringleadership #codequality
```

---

### Day 10 · Wed Aug 5 · **X** · 13:30 UTC · Pillar 1 · *The data path*

```
Migration plans don't die on the code. They die on the data.

The path that actually worked here:

→ Proprietary DB, generated out to generic SQL
→ Data exported to JSON
→ A loader writes it into the new database
→ Postgres, MS SQL or MySQL — your choice, your server

No big-bang weekend. No "we'll do it live."

Where would yours die first — data, screens, or logic?
```

---

### Day 10 · Wed Aug 5 · **LinkedIn** · 11:30 UTC · Pillar 2 · *Five questions* — **CAROUSEL**

Slides:
1. **Five questions to answer before you let AI write a line.** #1 is the one everyone skips.
2. **1. What does "done" look like?** If you can't test it, you haven't defined it.
3. **2. What happens when it fails?** Every path you don't name is a path you're accepting blind.
4. **3. What already exists?** The most expensive AI code is the code that duplicates yours.
5. **4. Who owns this decision?** If the answer is "the model," stop.
6. **5. How will I know later why this exists?** Code without a reason is code nobody dares delete.
7. Answering these takes twenty minutes. Not answering them costs a sprint.
8. AI didn't make these questions less important. It made them the job.
9. Which one does your team actually skip?

Body text:
```
Five questions. Twenty minutes. Answer them before the model writes
anything.

I skipped #1 once on purpose to see what would happen. It cost me a
week and the code was fine — it just solved the wrong problem.

Save this for your next planning session.

Which one does your team actually skip?

#ai #softwaredevelopment #productivity #engineeringleadership
```
*Bookmark/save-bait. Expect this to be the highest save-rate post of Phase 1.*

---

### Day 11 · Thu Aug 6 · **X** · 13:30 UTC · Pillar 5 · *Sovereignty, general framing*

```
A question worth asking about whatever platform you build on:

If you stopped paying tomorrow, could you still open your own
source code?

For a lot of developers that used to be a hypothetical.

It isn't anymore.
```
> ⚠️ **Verify before posting.** This is the safest possible framing — it asks a general
> question and names nobody. Do not name a vendor or characterise licence terms in public
> copy until the facts in `content-system.md` §0 are confirmed first-hand.

---

### Day 11 · Thu Aug 6 · **LinkedIn** · 11:30 UTC · Pillar 3 · *The audit report* (agency framing)

```
Every release here ships with an audit report nobody asked for.

I added it for myself. It turned out to be the thing I'd least want
to give up when a client asks how the work was done.

Because that question always comes. Usually at the worst moment —
a security review, a handover, a new CTO who wants to know what
they've inherited.

"We used AI to build it" is not an answer that survives that meeting.

"Here's every scope, the spec it came from, the gate it passed, and
the audit at release" is.

If you build software for other people, the process you can *show*
is worth as much as the software. Possibly more, because it's the
part they can evaluate.

How do you prove your process to a client today?

#consulting #softwaredevelopment #compliance #ai
```
*Attach: screenshot of a real audit report.*

---

### Day 12 · Fri Aug 7 · **X** · 17:00 UTC · Pillar 4 · *Diagnostics before repair*

```
Nobody replaces an engine because the car makes a noise.

You listen. You narrow it down. You test the cheap theory first.

Every trade that fixes things already knows this. Software calls it
debugging and acts like it invented it.

If you came to this from somewhere else: you're further along than
you think.

What did you do before?
```

**Sat Aug 8 / Sun Aug 9 — no posts.** Engagement only. **Then run the first weekly review**
(content-system.md §7.3) — 16 posts is enough to set a first median.

---

# WEEKS 3–13 — slot assignments + hook banks

From here the calendar assigns **pillar, audience and hook** per slot. Write the copy on
batch day from the templates in `content-system.md` §8.4 — because by week 3 you'll have
real data, and pre-writing week 11 today would mean ignoring it.

## Phase 1 continues

### Week 3 — Aug 10–14 · Audience: career-changers · Pillars 4, 3
| Slot | Pillar | Hook |
|---|---|---|
| Mon X | 3 | "The command that tells me what I haven't finished yet." |
| Tue X | 4 | "A spec isn't paperwork. It's the argument you have with yourself before it's expensive." |
| Tue LI | 4 | "Nobody tells you that the job is 10% typing." *(carousel: what a senior actually does all day)* |
| Wed X | 1 | "A 20-year-old global procedure, as Markdown. Here's what the AI saw." |
| Wed LI | 3 | "I gave the AI a scope document instead of a prompt. Here's the difference." |
| Thu X | 2 | "'It compiles' was never the bar. It's a lower bar now than it's ever been." |
| Thu LI | 1 | "The migration everyone postpones, broken into four things." |
| Fri X | 4 | "What's the thing you're still faking confidence about?" |

### Week 4 — Aug 17–21 · Audience: agencies/consultants · Pillars 3, 1
| Slot | Pillar | Hook |
|---|---|---|
| Mon X | 3 | "Two people, one codebase, zero collisions. Here's the mechanic." *(scope check-out)* |
| Tue X | 1 | "What didn't survive the crossing — and why I'd do it again." |
| Tue LI | 3 | "How I'd prove to a client that AI-built software was built properly." |
| Wed X | 2 | "Reviewing AI code is a different skill than writing code. We're training for the wrong one." |
| Wed LI | 1 | "Before/after: a legacy window and what it became." |
| Thu X | 3 | "Every release ships an audit report. Here's page one." |
| Thu LI | 2 | *(carousel)* "The wrong abstraction, at AI speed, is a very expensive mistake." |
| Fri X | 4 | "The oldest piece of code you're still responsible for — what is it?" |

**End of Phase 1 review:** rank all 32 posts by RPF. The top 3 angles set Phase 2's agenda.

## Phase 2 — Provoke (weeks 5–9, Aug 24 – Sep 27)

Pillars 2 and 5 lead. Soft CTA: bio link only, still nothing in the post body.

**Contrarian hook bank** — one per week, in the Tue or Thu X slot:
- "Prompt engineering is a temporary job title. Requirements engineering isn't."
- "If your AI workflow has no stage gates, you don't have a workflow. You have a chat log."
- "The bottleneck was never typing speed. We just automated the part that wasn't the bottleneck."
- "Most 'AI made me 10x faster' claims are measuring the wrong half of the job."
- "Your AI doesn't need a better prompt. It needs a spec."
- "Senior engineers aren't threatened by AI. They're the only people who can supervise it."
- "Code review can't catch 'this solves the wrong problem.' Nothing downstream can."

**Sovereignty hook bank** — one per week, Thu X or Wed LI. **Every one of these passes the
verify-before-posting table in `content-system.md` §0 first.**
- "Who owns your source code? Not metaphorically. Legally, on the day you stop paying."
- "An escape-hatch checklist for any proprietary platform — five things to confirm you could leave."
- "I've watched two platforms die under people I know. Here's what the survivors had in common."
- "Cloud lock-in and licence lock-in are the same risk wearing different clothes."
- "The developers organising against this aren't anti-vendor. They're pro-continuity."

**Fixed weekly Pillar 3 receipt:** Mon X, every week. The artifacts already exist — this is
the slot that keeps the week shippable when the batch day gets cut short.

**Weeks 5–9 audience rotation:** 5→legacy, 6→skeptics, 7→career-changers, 8→agencies, 9→legacy.

## Phase 3 — Convert (weeks 10–13, Sep 28 – Oct 25)

Pillars 4 and 2, plus systematic repeats of Phase 1–2 winners. **Hard CTA:
wxkanban.com — still in a reply on X and in the first comment on LinkedIn, never the body.**

| Week | Focus | Anchor asset |
|---|---|---|
| **10** | The teaching ladder | Carousel series: the lifecycle as a curriculum, one stage per post |
| **11** | Data drop | "N scopes, M specs, X weeks: what the numbers say about spec-first." **Verify every figure against the repo the morning you post.** |
| **12** | Case study | The full crossing, start to finish, as one long-form piece on blog.wxperts.com — social posts point to it |
| **13** | Winners + the ask | Rebuild the top 5 posts of the 90 days in their opposite format. Close with the clearest statement of the offer you've made all quarter |

**Day 90 post (Sat Oct 24 — the one exception to the no-weekend rule):** the 90-day
retrospective. What you published, what worked, what you were wrong about. It's Pillar 3
applied to the content system itself, and retrospectives with real numbers are among the
most-shared posts in this niche.

---

# Tracking

No engagement columns exist on `campaignposts`, so tally manually here each Friday.

| Wk | Posts | Median RPF | Best post | Best RPF | Share % | Save % | Kill | Double down |
|---|---|---|---|---|---|---|---|---|
| 1 | 8 | | | | | | | |
| 2 | 8 | | | | | | | |
| 3 | 8 | | | | | | | |

*(extend to week 13)*

**Decision rules** — `content-system.md` §7.4. In short: >3× median → 3 derivatives within
7 days. Below median across 3 posts → retire that **angle** for 60 days. Never kill a
pillar on one bad week.

---

# Before day 1 — the checklist

- [ ] Confirm the facts in `content-system.md` §0 (especially the source-code-access claim)
- [ ] Confirm the live CTA destination and that wxkanban.com signup works end to end
- [ ] X and LinkedIn profiles carry the spine sentence and a link
- [ ] Capture the week-1 anchor: the four conversion artifacts on screen
- [ ] Build the week-1 Wednesday carousel (six stages, five gates)
- [ ] Verify the opted-in count in `marketingcontacts` before any email send
- [x] ~~Landing page CTA~~ — **done 2026-07-25.** Both `landing-page.md` and the live
      `marketing/site/index.html` now lead with **Create your free account →**
      `https://wxkanban.com/registration` (verified 200). Expired launch countdown
      removed; the email form is demoted to the secondary "How-To videos" CTA.
      **Not yet deployed** — run `pwsh marketing/site/deploy/redeploy.ps1`
