# wxKanban — Viral Content System (LinkedIn + X)

**Created:** 2026-07-25
**Owner:** Andy "Cowboy" Stapleton (solo, ~5 hrs/week)
**Channels:** X and LinkedIn only. Faceless — screen capture, no on-camera talent.
**CTA:** broad signup at **wxkanban.com**
**Companion:** [content-calendar-90day.md](content-calendar-90day.md) — the executable schedule.

---

## 0. How this file relates to everything else

This is **downstream of [messaging-hierarchy.md](messaging-hierarchy.md)**, which is locked.
It does not redefine the promise, the three message pillars, the proof, or the
"what we do NOT say" list. It answers the one question the hierarchy leaves open:

> The hierarchy's channel map (§5) covers the landing page, launch email, Facebook groups,
> the How-To series, and docs. **LinkedIn and X appear nowhere.** This file is that engine.

Reading order: `messaging-hierarchy.md` → this file → `content-calendar-90day.md`.
Community targets and sequencing live in [communities.md](communities.md).

**Hard rule:** any post that contradicts `messaging-hierarchy.md` §7 does not ship.
No "another Kanban board." No "learn to code." No effortless/automatic conversion —
it is *guided*, done **with** you. Never imply AI replaces the developer.

### Verify-before-posting flags

Several load-bearing facts in this system came from automated research or notes now
1–3 months old. Confirm each against first-hand knowledge before it appears in public copy:

| Claim | Status |
|---|---|
| PCSoft acquired by Constellation Software (late 2024) | Marked **confirmed by Andy 2026-05-31** — recheck wording |
| 2025 end of perpetual/dongle licences → SaaS | Same — recheck |
| Devs lose access to their own source code if they stop paying | **Highest-risk claim. Verify precisely.** Phrase as what the community reports, not as a legal characterisation |
| Wx Alliance exists to fight lock-in | Verify current status before naming them |
| Any scope/spec counts, version numbers, or dates | Read from the repo the morning you post |

Getting one of these wrong in public costs more than any post gains.

---

## 1. The psychology of virality

### 1.1 Why anything spreads

People do not share content. **People share things that do a job for them.** Every
principle below is a job. If a post does none of these jobs, it will not spread no matter
how true it is.

The six classic drivers (Berger's STEPPS), each translated into a wxKanban angle:

**Social Currency — "sharing this makes me look good."**
The strongest single driver in developer audiences. Devs share what signals taste,
seniority, and being early. *Angle:* give them insider knowledge they can pass on —
the actual mechanics of converting a proprietary app, the specific failure mode of
vibe coding, a method with a name. A named method is more shareable than a good method,
because a name is repeatable in someone else's words.

**Triggers — "something in my day reminds me of this."**
Content tied to a recurring stimulus gets re-shared long after publication. *Angle:*
attach to events that happen weekly in a dev's life — a merge conflict, a code review,
an AI that confidently wrote the wrong thing, a licence renewal email, a client asking
"how long will this take?" Every one of those is a trigger you can own.

**Emotion — "this made me feel something activating."**
High-arousal emotions travel (awe, anger, anxiety, hope). Low-arousal ones do not
(sadness, contentment). *Angle:* your audience has a genuine, currently-live anger and
anxiety about platform ownership, and a genuine hope about levelling up rather than
starting over. You do not have to manufacture the emotion — it already exists. Name it
accurately and you get reach; exaggerate it and you get distrust from a community that
knows the facts better than you do.

**Public — "I can see other people doing it."**
Behaviour spreads when it's observable. *Angle:* build in public with visible artifacts.
A spec doc, a fence audit, a lifecycle stage gate on screen is a *public* practice. Make
the method visible and people copy it — copying is the highest form of sharing.

**Practical Value — "this is useful, so I'll pass it to someone."**
The most reliable, least glamorous driver. *Angle:* teach one concrete, extractable thing
per post — the checklist, the prompt, the fence convention, the four-artifact conversion
recipe. Practical value is what makes people send a post in a DM, which is where most
real sharing happens and none of it is measurable.

**Stories — "the point rides inside a narrative."**
People don't retain arguments; they retain stories that carry arguments. *Angle:* you have
the best story available in this category and it costs nothing to tell: **this product was
a WINDEV application, and we converted it.** The tool is the ending of the story. Tell the
crossing, not the feature list.

### 1.2 Two mechanisms specific to developer audiences

Generic virality frameworks under-serve this niche. Two additions:

**Identity Defense.** Developers share, with unusual intensity, content that defends their
professional identity against a threat. A 20-year WINDEV developer being told their skills
are obsolete, or a senior being told AI makes them unnecessary, will amplify anyone who
articulates the counter-argument better than they can. *This is the single highest-leverage
mechanism available to you*, because your spine message — "the hard part was never the
syntax, it was the judgment; you already have it" — **is** an identity defense. Every time
you state it, you hand someone ammunition for an argument they are already having.

**Receipt Sharing.** Developers discount claims and amplify artifacts. A screenshot of a
real audit report outperforms a paragraph describing audit capability, by a wide margin.
This is why the faceless constraint is an advantage here, not a limitation: your entire
format vocabulary is screen capture, and screen capture *is* the receipt. Never make a
claim you can screenshot instead.

### 1.3 The spine

Every post ladders into one sentence, taken verbatim from `messaging-hierarchy.md` §1:

> **The hard part of software was never the syntax — it was the judgment.
> You already have it. AI still demands it.**

It reaches all four target audiences at once, which is the only reason a four-audience
strategy is affordable at 5 hrs/week:

| Audience | What the spine says to them | Message pillar |
|---|---|---|
| Legacy devs (WINDEV / VB / Clarion) | Your 20 years aren't obsolete — they're the asset | I |
| Career-changers ~1 yr in | What you're missing is learnable, and it isn't syntax | II |
| Experienced devs / AI skeptics | Vibe coding fails by skipping judgment, not by using AI | II |
| Agencies & solo consultants | Judgment at scale = an auditable lifecycle you can sell | III → II |

---

## 2. Eighteen content ideas

Each has the trigger it pulls, why it spreads, and **who specifically shares it**.
"Developers" is not an answer; named communities are.

### The conversion story (Pillar 1 — The Crossing)

**1. "This app was WINDEV. Here's the commit where it stopped being WINDEV."**
Screen capture walking the actual artifacts.
*Trigger:* Story + Receipts. *Why it spreads:* it is the rarest thing in dev marketing —
a vendor who did the thing they're selling, with the diff to prove it. *Who shares:*
wxforum.info regulars, WinDev-US, Wx Alliance members, anyone who has argued that leaving
is impossible.

**2. "Four artifacts. That's all the AI needed to rebuild a 20-year-old app."**
The recipe: HFSQL → generic SQL → target DB (via JSON export + loader); global procedures →
Markdown; screens → screenshots + source-to-text → Markdown; then the AI builds.
*Trigger:* Practical Value + Social Currency. *Why:* it converts "impossible migration"
into a four-item list someone can evaluate on a Sunday. Lists of four get saved.
*Who shares:* developpez.net WINDEV forum, wxforum.info, consultants sizing a migration.

**3. "Your screens are the spec. Here's how a screenshot became a React component."**
Before/after: legacy window beside the rebuilt page.
*Trigger:* Public + Emotion (relief). *Why:* the deepest fear in a rewrite is that users
will revolt at an unfamiliar UI. Showing familiarity preserved kills the objection visually.
*Who shares:* devs with clients they're afraid to disrupt; agency owners.

**4. "HFSQL → PostgreSQL, with the data, without a big-bang weekend."**
The export/loader path.
*Trigger:* Practical Value. *Why:* data migration is where migration plans die; anyone who
has lived a bad cutover shares the version that looks survivable.
*Who shares:* DBAs, senior devs, anyone burned by a Friday-night migration.

**5. "What I'd do differently if I crossed a second app tomorrow."**
Honest retrospective, including what went badly.
*Trigger:* Social Currency + Emotion (trust). *Why:* admitted mistakes are the cheapest
credibility available and the hardest for competitors to copy.
*Who shares:* skeptics — the most valuable amplifiers, because their endorsement carries
weight theirs normally doesn't.

### The argument (Pillar 2 — Judgment Over Syntax)

**6. "Vibe coding doesn't fail because AI is bad. It fails because nobody wrote down what 'done' means."**
Text-first.
*Trigger:* Identity Defense + Emotion. *Why:* it validates the skeptic without making them
anti-AI, which is the only position most seniors actually hold and rarely see stated.
*Who shares:* senior devs on X, tech leads on LinkedIn, engineering managers.

**7. "AI made code cheap. It made judgment expensive. Price accordingly."**
*Trigger:* Identity Defense + Social Currency. *Why:* it reframes a threat as a raise.
Consultants will quote it at clients.
*Who shares:* freelancers, agency owners, anyone justifying a rate.

**8. "I let the AI skip the spec on purpose. Here's the wreckage."**
Screen capture of a deliberately un-specced build going wrong.
*Trigger:* Emotion (schadenfreude + recognition) + Receipts. *Why:* demonstrated failure
is more persuasive than asserted best practice, and it's honest about the tool's limits.
*Who shares:* everyone who has quietly had this exact experience and assumed it was them.

**9. "Six stages, five gates. The boring diagram that makes AI-built software shippable."**
Design → Implementation → QA → Human Testing → Beta → Release.
*Trigger:* Practical Value + Public. *Why:* highly screenshot-able, and it's a framework
people can adopt without buying anything — which is precisely why they'll credit you.
*Who shares:* team leads, process-minded devs, and (later) people teaching it to others.

**10. "Every function in this codebase says which spec authored it. Here's why."**
The code-fencing convention on screen.
*Trigger:* Social Currency + Receipts. *Why:* it's a genuinely unusual practice; unusual +
defensible = discussion. Expect disagreement, which is reach.
*Who shares:* architecture-opinion accounts, people who love and people who hate the idea.

**11. "The question that separates a senior from a fast typist: 'what happens when this fails?'"**
*Trigger:* Identity Defense. *Why:* it's a compliment to the reader disguised as an
observation. Compliments get shared.
*Who shares:* seniors sharing at juniors; mentors; hiring managers.

### The receipts (Pillar 3 — Receipts)

**12. "One command, and the codebase tells me every un-fenced declaration."**
Terminal capture of the fence audit.
*Trigger:* Receipts + Practical Value. *Why:* short, satisfying, verifiable. The
faceless format at its best.
*Who shares:* tooling enthusiasts, DX people.

**13. "Scope → spec → plan → tasks → code, in one screen recording."**
The orchestrator running end to end.
*Trigger:* Public. *Why:* it makes an abstract methodology concrete in 60 seconds.
*Who shares:* anyone who has tried to explain "spec-driven development" and failed.

**14. "110 scope documents later, here's what I'd tell myself at scope 1."**
*Trigger:* Story + Social Currency. *Why:* volume is proof of persistence, and the
lesson format is inherently extractable. (Verify the count before posting.)
*Who shares:* builders in public, indie hackers.

**15. "The release audit report nobody asked for, that I'd never ship without now."**
*Trigger:* Practical Value + Identity Defense. *Why:* speaks directly to consultants who
need to look professional to clients.
*Who shares:* agencies, compliance-adjacent devs, B2B buyers.

### The on-ramp (Pillar 4 — The Apprentice)

**16. "An ex-mechanic one year into software already has the hardest skill. He just doesn't have the vocabulary yet."**
*Trigger:* Emotion (hope) + Identity Defense. *Why:* it is the single most emotionally
charged idea available to you. Career-changers will share it about themselves; mentors
will share it at their juniors. Highest expected share rate of anything in this list.
*Who shares:* career-changers, bootcamp grads, mentors, anyone who came from a trade.

**17. "Diagnostics before repair. You already do this. It's called debugging."**
One-concept translation of a trade skill into a software habit.
*Trigger:* Practical Value + Story. *Why:* analogy content travels because it makes the
reader feel smart instantly.
*Who shares:* the same audience as #16, plus educators.

**18. "The five questions to answer before you let AI write a line."**
Extractable checklist.
*Trigger:* Practical Value. *Why:* checklists are the most saved and DM'd format that
exists. Saves are a ranking signal on both platforms.
*Who shares:* everyone; this is the bookmark-bait piece.

### Newsjacking (Pillar 5 — Sovereignty Watch)

Handled as a *reactive* pillar rather than a fixed idea list — see §3. It carries the
highest reach potential and the highest factual risk. Every Pillar 5 post passes the
verify-before-posting table in §0 first.

---

## 3. The five content pillars

Content pillars are recurring **formats**, not messages. Each ladders into a locked
message pillar.

### Pillar 1 — The Crossing → *Message Pillar I*
Before/after conversion artifacts. Primary audience: legacy devs.

Angles: (a) the four-artifact recipe; (b) data migration path; (c) a screen, before and
after; (d) a global procedure as Markdown; (e) what didn't survive the crossing and why;
(f) how long it actually took; (g) the objection I hear most and my honest answer;
(h) crossing a *second* app — what's reusable.

### Pillar 2 — Judgment Over Syntax → *Message Pillar II*
Text-first contrarian argument. Primary audience: AI skeptics and seniors.

Angles: (a) spec-first vs vibe coding; (b) AI made code cheap, judgment expensive;
(c) deliberate failure demos; (d) the stage-gate argument; (e) what AI still can't decide;
(f) why "it compiles" was never the bar; (g) reviewing AI code is a different skill than
writing code; (h) the cost of a wrong abstraction at AI speed.

### Pillar 3 — Receipts → *Message Pillars II + III*
Screen capture of real artifacts in this repo. Primary audience: all — this is the
credibility floor.

Angles: (a) fence audit run; (b) full orchestrator run; (c) a real scope doc, read aloud
in text; (d) the VS Code Cockpit; (e) a release audit report; (f) the test plan generator;
(g) scope check-out/check-in preventing a collision; (h) an AI spec session transcript
excerpt; (i) a shipped-scope changelog.

**This pillar is the engine.** It costs almost nothing because the artifacts already exist.
Every scope doc, every audit run, every command is a post you don't have to invent. When
the batch day is short, ship Pillar 3.

### Pillar 4 — The Apprentice → *Message Pillar II*
One lifecycle concept, plain language, trade analogies. Primary audience: career-changers.

Angles: (a) what a spec actually is; (b) why "done" needs a definition; (c) diagnostics
before repair; (d) reading an error like a symptom; (e) why professionals write it down
first; (f) the difference between a task and a scope; (g) how to review code you didn't
write; (h) what a senior actually does all day.

### Pillar 5 — Sovereignty Watch → *Message Pillar I*
Reactive newsjacking on platform ownership and lock-in. Primary audience: legacy devs,
with broad spillover.

Angles: (a) the licence-model change and what it means practically; (b) "who owns your
source code?" as a general question every dev should ask; (c) escape-hatch checklist for
*any* proprietary platform; (d) what the community organised in response; (e) the same
risk in modern stacks — cloud lock-in isn't different in kind; (f) the founder's history
across two prior platform deaths.

**Guardrail:** this pillar attacks a *situation*, never individuals, and never gloats.
The audience includes people who still depend on that platform to feed their families.
Contempt for their choices reads as contempt for them.

### The sequencing loop

Pillar 5 raises the stakes → Pillar 1 shows escape is real → Pillar 3 proves it shipped →
Pillar 2 argues why the method → Pillar 4 makes it learnable → back to 5.

**Ache → escape → proof → reason → on-ramp.**

Each post sets up the next because the loop is a single argument told across a week.
Pillar 5 without Pillar 1 is doom-posting. Pillar 1 without Pillar 3 is a claim.
Pillar 2 without Pillar 4 is elitism. Keep the loop intact.

---

## 4. Platform engineering

The same idea must be rebuilt, not copy-pasted, for each platform. Mechanics differ enough
that cross-posting identical text underperforms both natively-written versions.

### 4.1 X

**A timing note that matters more here than in most niches:** the beachhead community is
heavily francophone. The overlap window where US-East morning meets Paris afternoon is
**13:00–15:00 UTC** (09:00–11:00 ET / 15:00–17:00 CEST). That is the primary slot for any
post targeting the WINDEV audience. For general dev/AI content, US-centric windows apply.

| Setting | Choice |
|---|---|
| Primary window | 13:00–15:00 UTC, Tue–Thu (francophone overlap) |
| Secondary window | 17:00–19:00 UTC, Tue–Thu (US afternoon) |
| Cadence | 5 posts/week |
| Format ranking (faceless) | Single post with one strong idea > short native video (≤60s, silent-readable) > thread (teardowns only) > image |
| Links | **Never in the body.** Link goes in a reply, posted 15+ min later |
| Hashtags | 0–1. `#WINDEV` only when the post is genuinely for that community |
| Threads | Only when the content is genuinely sequential. A padded thread is punished |

**Hook patterns that stop the scroll on X** (first line is the entire battle — everything
after line 1 is only read if line 1 earns it):

- *The confession:* "I let the AI skip the spec on purpose. Here's the wreckage."
- *The reframe:* "AI made code cheap. It made judgment expensive."
- *The receipt:* "This function knows which spec wrote it. Here's why that matters."
- *The number:* "Four artifacts. That's all the AI needed to rebuild a 20-year-old app."
- *The stake:* "Your whole career runs on someone else's platform."
- *The defense:* "You're not behind. You're holding the one skill that didn't get cheaper."

**Engagement tactics:** post, then spend 20 minutes replying to 8–10 accounts in-niche.
Replies from a small account on a large account's post reach more people than the small
account's own post. For the first 30 days, **reply volume matters more than post volume.**
Bookmarks are a strong ranking signal — checklist and recipe posts are engineered for them.

### 4.2 LinkedIn

**Critical constraint from [communities.md](communities.md):** there is **no open WINDEV
group on LinkedIn**. LinkedIn is therefore a *feed + influencer engagement* channel, not a
group channel. Named opinion leader worth engaging rather than pitching: Bertin Carrière
(publishes on the PCSoft/developer relationship). The WINDEV product page's followers are
an ad-targeting asset if paid is ever switched on.

| Setting | Choice |
|---|---|
| Primary window | Tue/Wed/Thu, 07:30–09:00 in the reader's local morning. Given the FR/US split, **07:00–08:00 ET** covers US morning and FR early-afternoon |
| Cadence | 3 posts/week |
| Format ranking (faceless) | **Document/carousel post (PDF)** > native video (≤90s, captions burned in) > text-only with short lines > single image |
| Links | In the **first comment**, never the body |
| Hashtags | 3–5, mixing broad (`#softwaredevelopment`, `#ai`) and niche (`#windev`, `#legacymodernization`) |
| Length | 900–1,300 characters for text posts. The first 140 characters are above the "see more" fold — treat them as the entire ad |

**The document post is your single biggest lever.** It's the highest-reach format available
to a faceless account because LinkedIn ranks on dwell time and a carousel forces dwell.
Every checklist, framework, and before/after in this system should have a carousel version.
8–10 slides, one idea per slide, huge type, slide 1 is the hook, last slide is the ask.

**Hook patterns for LinkedIn** (more context-setting than X, but no throat-clearing):

- *The credential-free story open:* "This product used to be a WINDEV application."
- *The named fear:* "A developer I know can't open his own source code without a subscription."
- *The reversal:* "Everyone's asking how to use AI to write more code. Wrong question."
- *The teaching promise:* "Five questions to answer before you let AI write a line. #1 is the one everyone skips."

**Engagement tactics:** reply to every comment within 60 minutes, and reply with a
*question* — comment threads with back-and-forth outrank comment counts. Comment
substantively on 5 relevant posts before publishing your own; it warms the feed and is the
only reliable way a near-zero-follower account gets seen.

### 4.3 One idea, four renderings

Anchor: *"Four artifacts. That's all the AI needed to rebuild a 20-year-old app."*

| Rendering | Treatment |
|---|---|
| **X single** | The number hook + the four items, one line each. No link. Bookmark-bait |
| **X video** | 45s screen capture scrolling the four real artifacts. Text overlay, silent-readable |
| **LinkedIn document** | 6 slides: hook / artifact 1–4 / "the tool in your hands is the result" |
| **LinkedIn text** | Same content opened with the story ("This product used to be a WINDEV app"), closing on a question |

Never publish all four the same day. Space by platform, 48h+ apart.

---

## 5. Engagement acceleration

Both algorithms weight the first 60–90 minutes heavily. With a near-zero follower count on
these two platforms, organic early engagement will not appear on its own — it has to be
imported from channels you already own.

### 5.1 "Near-zero audience" is misleading

You have **near-zero followers on X and LinkedIn**, and **substantial distribution
everywhere else.** That distinction is the whole strategy:

| Asset | How it accelerates |
|---|---|
| **WinDev-US Facebook group** (wxPerts-run — owned) | Warm, active, already discussing licensing. Post the *idea* natively, link the X/LinkedIn version only when it genuinely adds something |
| **@WinDevUS on X** (owned) | Amplify the personal account from the brand account within the first hour |
| **blog.wxperts.com** (owned) | Long-form home for each anchor; the post that social points to once CTAs turn on |
| **`marketingcontacts` list** | See §5.3 — small opted-in segment, use precisely |
| **Wx Alliance** | Message-perfect, self-selected audience. **Partnership approach, never a spam-drop.** Offer the conversion write-up as a resource for their members |
| **developpez.net / wxforum.info** | High-intent, ad-hostile. Earn trust by answering questions with no link for weeks before ever referencing yourself |
| **VS Code Marketplace listing** | Passive discovery surface. Its description should carry the spine sentence |
| **Andy's 40-year reputation** | "Some of you already know me" is an opener no competitor can use |

### 5.2 The first-90-minutes playbook

1. **T-60 min** — comment substantively on 5 in-niche posts on the platform you're about to
   post to. This warms distribution and is the highest-ROI 15 minutes in the system.
2. **T-0** — publish. No link in the body.
3. **T+5 min** — add the link (if any) as a reply/first comment.
4. **T+0 to T+45** — stay in the replies. Answer every comment with a question.
5. **T+30 min** — amplify from `@WinDevUS` (X) if the post fits that audience.
6. **T+2 hrs** — if the post is genuinely useful to the FB group, share the *idea* there
   natively. Facebook groups punish link-drops; write it as a peer post.
7. **T+24 hrs** — if the post outperformed, reply to your own post with the next angle.
   If it underperformed, leave it. Do not delete; do not repost within 21 days.

### 5.3 Email

**Do not blast the whole list.** Per prior campaign notes, only a small fraction of
`marketingcontacts` is genuinely opted in — verify the opted-in count in the database
before any send, and send only to that segment. Treat email as a *quality* accelerant:

- **Weekly digest (opted-in only):** one short email per week, containing the week's anchor
  and a direct ask to reply — replies, not clicks, are the goal early on.
- **Never** ask the list to go like a post. It reads as desperate and it converts badly.
  Ask them to *answer a question* instead; the ones who care will engage publicly on their own.
- New subscribers arrive from wxkanban.com. The list grows from content; content is not
  fuelled by the list.

### 5.4 Questions that actually drive comments

Generic "what do you think?" gets nothing. These get replies because they invite the reader
to talk about *themselves*:

- "What's the oldest piece of code you're still responsible for?"
- "What's the one thing your platform does that you'd genuinely miss?"
- "What did AI confidently get wrong for you this week?"
- "What did you do before software?"  ← highest reply rate of any question in this list
- "Where would your migration die first — data, screens, or logic?"

---

## 6. Authority and trust architecture

### 6.1 What actually makes someone credible here

In this niche, credibility is **not** follower count, and it is not certifications.
It is, in order:

1. **You did the thing.** wxKanban was a WINDEV application and it was converted. Nobody
   else selling a bridge has walked across it with their own product.
2. **Longevity through prior shifts.** 40+ years, mainframe → web → cloud, two platform
   deaths survived. This is unfakeable and it is the founder's core asset.
3. **Verifiable artifacts.** Specs, fences, audit reports, a published extension. Receipts
   over rhetoric.
4. **Admitting limits.** Saying "this is guided, not one-click" *increases* trust with an
   audience that has been oversold before. The honesty guardrail is a marketing asset.

### 6.2 The progressive ladder

Run all three levels concurrently — different levels serve different audiences — but weight
them by phase.

| Level | Content | Audience | Proves |
|---|---|---|---|
| **Beginner** | "What a spec actually is." "Diagnostics before repair." (Pillar 4) | Career-changers | You can teach |
| **Intermediate** | "Six stages, five gates." "Reviewing AI code is a different skill." (Pillars 2, 3) | Working devs | You have a method |
| **Expert** | "Four artifacts to rebuild a 20-year-old app." "What didn't survive the crossing." (Pillar 1) | Legacy devs, architects | You've done it |

Expert content earns citations. Beginner content earns volume and goodwill. You need both:
authority without an on-ramp attracts peers, not customers.

### 6.3 Data, case studies, contrarian takes

- **Data:** your own build is the dataset. Number of scopes, time from scope to shipped
  feature, defects caught at each gate. Publish real numbers, including unflattering ones —
  *verify each against the repo the morning you post.*
- **Case study:** the wxKanban conversion is case study #1 and it's already done. Each beta
  conversion engagement is a potential case study #2, #3 — get written permission early.
- **Contrarian takes:** the reliable engine of reach, but they must be *defensible and
  narrow*. "Spec-first beats vibe coding" is defensible. "AI coding is a fad" is not, and
  it would contradict your own product. Be contrarian about *method*, never about AI itself.

### 6.4 Getting cited

- **Be quotable.** Write at least one extractable sentence per post. The spine sentence is
  the model.
- **Name your frameworks.** "The four artifacts." "Six stages, five gates." A named thing
  gets cited; a described thing gets paraphrased and lost.
- **Give the method away free.** People cite what they can use without buying. The lifecycle
  is the curriculum — publishing it *is* the marketing.
- **Engage upward before asking.** Comment usefully on the named opinion leaders' posts for
  weeks before any ask. In small niches, everyone remembers who showed up before they needed
  something.
- **Be the citable source on one narrow topic.** Realistic goal for 90 days: *the* reference
  for "how to move a WINDEV application to an AI-built full stack." That is a small enough
  hill to actually own.

---

## 7. Metrics and iteration

### 7.1 An honest constraint

`campaignposts` tracks `status`, `scheduledat`, `liveurl` and `publishedat` — **it has no
engagement columns.** Version 1 of tracking is therefore a manual weekly tally against
`liveurl`, recorded in the calendar file. Adding metrics columns to `campaignposts` is a
sensible follow-on scope; it is deliberately **not** part of this content work.

### 7.2 The metrics that matter

Vanity metrics (followers, likes, impressions) are ignored for the first 60 days.

| Metric | Definition | Why it matters | Early target |
|---|---|---|---|
| **Reach per follower (RPF)** | impressions ÷ followers | The single best health metric for a small account — it measures whether the algorithm is pushing you *past* your audience | > 3× and rising |
| **Share rate** | (reposts + shares) ÷ impressions | Direct measure of virality | > 0.5% |
| **Save rate** | (bookmarks + saves) ÷ impressions | Strong ranking signal on both platforms; proxy for practical value | > 0.3% |
| **Comment depth** | replies ÷ unique commenters | Conversation beats volume in both rankings | > 1.5 |
| **Profile visit rate** | profile clicks ÷ impressions | Intent — the real precursor to signup | > 1% |
| **Signups attributed** | wxkanban.com signups with social referrer | The only metric that pays | Phase 3 only |

**Viral coefficient (K):** for content, use `K = share rate × average sharer audience ÷
your audience`. Below 1 means content decays; above 1 means it compounds. Realistically K
stays well under 1 — the useful signal is its *direction*, not its absolute value.

### 7.3 The weekly review — 30 minutes, Fridays

1. Record RPF, share rate, save rate, comment depth for all 8 posts in the calendar file.
2. Compute the rolling 30-day median RPF. This is the benchmark; nothing is judged in absolute terms.
3. Sort the week's posts against the median.
4. Apply the decision rules (§7.4).
5. Write one sentence: *what did this week teach me that I didn't know last week?*
   If it's blank two weeks running, the content is too safe.

### 7.4 Decision rules

**Double down** — any post above **3× median RPF**:
- Produce 3 derivatives within 7 days (different angle, same idea).
- Build the LinkedIn document version if it started on X, and vice versa.
- Promote the underlying angle into a fixed weekly slot.

**Iterate** — between 1× and 3× median: keep the angle, change the hook. The idea works;
the packaging doesn't.

**Kill** — an *angle* (not a single post) that lands below median across **3 posts**:
retire it for 60 days. Three data points, not one — single posts fail for timing reasons
constantly.

**Never kill a pillar on a single bad week.** Pillar 5 in particular is spiky by nature:
it does nothing until the news gives it a reason, then it outperforms everything.

### 7.5 A/B testing that works at this volume

At 8 posts/week you cannot run clean experiments. Do this instead:

- **Hook A/B:** same body, two different opening lines — one on X, one on LinkedIn, same
  week. Cross-platform noise is real but the effect size for hooks is large enough to see.
- **Format A/B:** same content as a text post one week, as a carousel three weeks later.
- **CTA A/B (Phase 3 only):** question-close vs link-close, alternating weeks.
- **Test one variable at a time, and only when you have a post worth optimising.** Testing
  a weak idea's hook is wasted effort.

---

## 8. Production framework — surviving at 5 hrs/week

### 8.1 The weekly shape

| Block | Time | What |
|---|---|---|
| **Batch day** (Mon AM) | 3 hrs | Produce the week's anchor + write all 8 posts |
| **Engagement** (daily) | 15 min × 5 | Reply window around each post; comment on others |
| **Weekly review** (Fri) | 30 min | Metrics + decision rules |

**Total: ~5 hrs.** There is no daily creation step. That is the point — a system requiring
daily creativity will be abandoned by week 3, and an abandoned system beats no system by
exactly nothing.

### 8.2 The batch day runbook

1. **(20 min) Pick the anchor.** One artifact, one argument, or one teaching concept. Look
   at what actually happened in the repo last week — shipped scopes are free anchors.
2. **(40 min) Capture.** Screen recording, terminal capture, or before/after screenshots.
   Capture more than you need; extra frames become future posts.
3. **(60 min) Write the eight posts** from the anchor using §8.3.
4. **(40 min) Build the carousel** for the week's LinkedIn document post.
5. **(20 min) Load into `campaignposts`** — set `content` and `scheduledat`, leave
   `status: draft` until published, then record `liveurl`.

**If the batch day gets cut short, ship Pillar 3.** The artifacts already exist; a fence
audit capture is 10 minutes end to end.

### 8.3 One anchor → ten-plus outputs

| # | Output | Channel |
|---|---|---|
| 1 | Single post, number/receipt hook | X |
| 2 | Short native video (≤60s) from the capture | X |
| 3 | Thread — only if genuinely sequential | X |
| 4 | The best single line, standalone | X |
| 5 | Reply/quote applying the idea to something in the timeline | X |
| 6 | Document/carousel post | LinkedIn |
| 7 | Text post, story-opened | LinkedIn |
| 8 | Native video, captions burned in | LinkedIn |
| 9 | Long-form write-up | blog.wxperts.com |
| 10 | Peer-voiced version (no link) | WinDev-US FB group |
| 11 | Weekly digest item | Email (opted-in segment) |
| 12 | Helpful answer if it fits a live thread | wxforum.info / developpez.net |

### 8.4 Templates

**X — receipt post**
```
[Concrete claim with a number or artifact.]

[One line of context.]

→ [item 1]
→ [item 2]
→ [item 3]

[The reframe — the sentence you want quoted.]

[Question.]
```

**X — contrarian post**
```
[The common belief, stated fairly.]

[Why it's wrong, in one line.]

[What's actually true.]

[The consequence for the reader.]
```

**LinkedIn — story post**
```
[Concrete opening scene, under 140 chars — this is the whole ad.]

[2–3 short lines of setup.]

[The turn: what actually happened.]

[The lesson, generalised.]

[Question to the reader.]

#hashtag #hashtag #hashtag
```

**LinkedIn — carousel (8–10 slides)**
```
1  Hook — the promise or the number
2  The problem, named
3–7 One idea per slide, huge type
8  The proof (screenshot of a real artifact)
9  The reframe (the quotable line)
10 What to do next / the question
```

### 8.5 Tooling

Deliberately minimal. Every tool added is a tool to maintain.

| Job | Tool |
|---|---|
| Screen capture | OBS (video), ScreenToGif (short loops) |
| Code images | Carbon / ray.so |
| Carousel PDFs | Any deck tool, or HTML → print-to-PDF for full control |
| Scheduling | Typefully or Buffer (X + LinkedIn both supported) |
| Source of truth | **`campaignposts` in wxKanban** — dogfood it |
| Metrics | Native analytics, tallied manually into the calendar file |

---

## 9. The 90-day arc

Full day-by-day schedule in [content-calendar-90day.md](content-calendar-90day.md).
Day 1 = **Monday 2026-07-27**. Day 90 = **Saturday 2026-10-24**.

| Phase | Days | Dates | Job | Pillar weight | CTA |
|---|---|---|---|---|---|
| **1 — Prove** | 1–30 | Jul 27 – Aug 25 | Establish voice and receipts. Earn the right to an opinion | 3 and 1 heavy | None. Posts close on a question |
| **2 — Provoke** | 31–60 | Aug 26 – Sep 24 | Contrarian takes + sovereignty. This is where reach comes from | 2 and 5 heavy | Soft — profile/bio link only |
| **3 — Convert** | 61–90 | Sep 25 – Oct 24 | Data drops, citable assets, the teaching ladder | 4 and 2, plus repeats of winners | Hard — wxkanban.com in-post |

**Why the CTA is delayed:** both platforms suppress outbound links, and an account with no
established credibility that asks for a click on day 1 trains its own audience to scroll
past. Phase 1 builds the receipts that make the Phase 3 ask land.

**Audience rotation** — each week leads with one audience so all four get deliberate
coverage without any single post trying to address everyone:

- Week A → Legacy devs (Pillars 1, 5)
- Week B → AI skeptics / seniors (Pillar 2)
- Week C → Career-changers (Pillar 4)
- Week D → Agencies / consultants (Pillar 3 with a business framing)

Pillar 3 receipts appear in **every** week regardless of lead audience — they're the
credibility floor, not a rotation slot.

---

## 10. What success looks like at day 90

Deliberately modest, because a solo operator at 5 hrs/week starting from near zero on two
platforms should be measured on leading indicators, not revenue:

- **Rising RPF** on a 30-day rolling median. This matters more than follower count.
- **3–5 posts above 3× median** that have been systematically mined for derivatives.
- **One named, cited framework** — most likely "the four artifacts" or "six stages, five gates."
- **A defensible claim to one narrow topic:** how to move a WINDEV application to an
  AI-built full stack.
- **A repeatable batch day** that survived 12 weeks without being abandoned.
- **Attributable signups** from social — a real but secondary number in Phase 3.

If only one of these lands, make it the last-but-one: owning a narrow topic compounds,
and everything else is downstream of it.
