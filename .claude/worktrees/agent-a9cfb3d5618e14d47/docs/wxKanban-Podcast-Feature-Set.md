# wxKanban — What It Is, What It Does, and Why We Build It With Itself

**Background notes for the interview** with Andy "Cowboy" Stapleton, founder, wxperts
**Prepared:** 2026-09-13 · **App version:** 1.5.316 · **Orchestrator kit version:** 1.7.62

---

## 0. How to use this document

Everything you need to run the segment, in the order you'd want it.

**Parts 1–3** are the story: what the product is, the situation that created it, and the one
thing about how it's built that's genuinely unusual. **Part 4** is the full feature set with an
honest status against each item. **Part 5** is the short version — if the segment only has room
for five minutes, run it off that page alone.

**Parts 6 and 7** are for you: lines that tend to land well, and the harder questions with
straight answers already on the record, so you can push without worrying the conversation will
stall. Ask anything in Part 7 on air. None of it is off limits.

---

## 1. The sixty-second version

wxKanban is a task-management and time-tracking system that doubles as a guided software
development lifecycle. You scope a feature by talking it through; it writes the specification;
it breaks the specification into tasks; your AI editor writes the code against those tasks; and
every function that lands in the codebase carries a comment naming the specification and task
that authorized it. Nothing advances to the next phase until that phase's gate is satisfied.

It exists because of a specific problem. Seasoned developers on proprietary platforms — the
beachhead is the 4GL developers, on PCSoft WINDEV/WEBDEV, Clarion, PowerBuilder, Uniface,
DataFlex and others. Those tools generate the application for you, so you never see the code
that actually runs; what you write is proprietary, against black-box functions. Their
livelihood and their clients' running applications sit on ground they do not own. wxKanban is the guided crossing to AI-built full-stack software on open foundations, built so the judgment those developers already have becomes the asset that makes them faster rather than the thing that gets thrown away.



**The one line:** *You're not starting over. You're crossing over — onto ground you own.*

---

## 2. Why it exists

### The trigger is not hypothetical

In late 2024 one of those 4GL companies was acquired. In 2025 the perpetual and dongle
license model ended in favor of a subscription in which developers lose access to their own
source code if they stop paying. The backlash was organized enough that developers formed an alliance to fight the lock-in.

So the fear that drives this product — *what happens when the platform you built your career on changes the terms?* — is not a marketing hypothetical anyone has to be argued into. The trigger was already pulled. The audience is already activated. They are looking for somewhere to go.

### What the crossing actually involves

Four artifacts, in this order:

1. **The data.** export proprietary collection of data, to generic SQL, then converts to PostgreSQL, MS SQL, or MySQL.
2. **The code and procedures.** Each one converts to a Markdown file that AI can read and reason about.
3. **The screens.** Screenshots capture the look; the window and page source files convert to text, then to Markdown.
4. **The rebuild.** Those artifacts — procedures, screens, screenshots, migrated data — feed
   the AI, which builds the modern full-stack application.

wxKanban ships skills that do the mechanical half of this from the technical documentation the legacy IDE generates: `wxConversion` for WINDEV / WEBDEV, `vbConversion` for VB6, `cwConversion` for Clarion. But the crossing itself is guided and done *with* the customer, screen by screen. There is no "click to convert" button, and we do not pretend there is.

### The proof is the product

The strongest asset in this entire story is that **wxKanban itself was a PCSoft WINDEV application that made this exact crossing.** The founder did not build a bridge and point at it. He walked across it, and wxKanban is what came out the other side.

---

## 3. Why we use wxKanban to build wxKanban

This is the part most worth the airtime, because it is checkable.

Every feature in this product was scoped, specified, tasked, built, tested, and released using the product. Not as a demo. As the only way work gets done here. When the methodology is inconvenient, we do not step around it — we fix the methodology, and that fix becomes a feature.

### What that produces, measured today

| | |
|---|---|
| Scope documents (the "what and why" of a feature) | **102** |
| Specification folders (spec + plan + tasks + lifecycle) | **103** |
| Tasks tracked across those specifications | **1,400** |
| Functional requirements in the core specification | **82** |
| Lines of TypeScript / TSX in the application | **181,416** across 733 files |
| Tables in the declared data model | **108** |
| Automated test files | **247** |
| Code units carrying a traceable authorship fence | **612**, spanning 55 scopes |
| Slash commands available to a developer in the editor | **73** |
| Packaged AI skills | **34** |
| Tools the hosted MCP server exposes to an AI agent | **52** |

Every one of those numbers was counted out of the repository on the morning of 2026-09-13.

### The single most unusual consequence

Open any top-level function in this codebase and you find something like this above it:

```ts
// [SCOPE 013 / T042] BEGIN — Audit log retention pruning
export function pruneAuditLogs(...) { ... }
// [SCOPE 013 / T042] END
```

That fence says: this function exists because scope 013 asked for it, and task T042 authorized it. It is written by the orchestrator, never by hand. A build-time audit fails if new code shows up without one.

So there is an unbroken chain from *a conversation about what to build* to *the specific lines that got built*. You can start at any line of code and walk backward to the reason it exists. 
You can start at a requirement and find every line that serves it. In an industry where the
honest answer to "why is this code here" is usually "nobody remembers," that is the thing worth talking about.

### The documentation cannot drift

The chain runs in both directions. Change the scope or the spec, and the orchestrator insists on
carrying that change through every document and every piece of code it touches — you do not get
to update one and forget the other.

In practice it sounds like this. You tell the AI, *"I need to send a newsletter to all the
contacts in marketing."* The orchestrator answers that this means scope 005 changes, and walks
you through updating it before a line of code gets written. You did not ask for a documentation
update. You asked for a newsletter. You get both, because there is no path to the second that
skips the first.

### Why we insist on it

Three reasons, and the third is the real one.

1. **It survives the AI's confidence.** AI writes code that looks right. Gates and tests are how you find out whether it is right, and the discipline has to be enforced by the tool because  nobody enforces it on themselves at 11pm.

2. **It survives the developer's memory.** Six weeks later nobody remembers why a decision was   made. The specification does.

3. **It is the curriculum.** The primary mission of this product is educational — getting someone  from "I have started using AI" to "I have released a product" without starting over. The lifecycle, the gates, the spec-first rule: those are not bureaucracy. They are the judgment a ten-year senior developer has, made explicit and enforced, so a newer developer builds the habit while shipping real work.

And the honest version of all three:

> The scopes, the specs, the use cases, and the test plans matter more than the code the AI
> generated. For every change, every modification, and even a full rewrite later, those are the
> asset. The code is the cheapest thing in the building now — it is the only part AI can
> regenerate on demand. What it cannot regenerate is the record of what you meant.

---

## 4. The feature set

Organized under the three things the product claims to do. The status column is deliberate:
nothing is marked shipped that isn't, and the three items that are still in progress say so.

### Pillar I — Own your foundation

*Never bet your career on one vendor's survival again.*

| Feature | What it does | Status |
|---|---|---|
| **4GL crossing** | Converts a legacy 4GL application into a modern React + Tailwind rebuild scaffold, or a stack of your choice, working from the technical documentation the IDE generates — per-element Markdown, regenerated pages with behavior wired, database schema and ER, queries, report stubs | Shipped as a skill; the engagement around it is guided |
| **Data comes with you** | Your proprietary data exports to standard SQL, then lands in PostgreSQL, MS SQL, or MySQL that you own | Method, proven on this product |
| **Bring your own LLM** | Point the AI at your own model and embedding endpoint so code and data never leave your environment | In active development (SCOPE-099) |
| **Credential redaction on conversion** | Secrets found in legacy source are redacted before anything reaches an AI | Shipped |
| **Verified code-egress boundary** | We can state exactly which three paths ever send your code outside your environment | Audited and documented |

### Pillar II — The lifecycle is the skill

*The tools changed. The judgment didn't.*

| Feature | What it does | Status |
|---|---|---|
| **The 6-phase lifecycle** | Design → Implementation → QA Testing → Human Testing → Beta → Release, with stage gates that refuse to let unfinished work advance | Shipped — the signature feature |
| **Design by conversation** | Talk through what you are building; the AI writes the scope live, flags overlap with scopes you already have, and produces a full project overview | Shipped |
| **Spec-first enforcement** | Specification, plan, and tasks exist before code does — not as a suggestion, as a gate | Shipped |
| **Code fencing** | Every top-level function, component, route, table, and migration is fenced with the scope and task that authored it; a build audit fails on unfenced code | Shipped |
| **Pre-test gate** | Work cannot enter testing until the conditions for testing are actually met | Built and proven, not yet released |
| **Test plan generation** | Builds a requirement-traceable test plan from your routes, services, tables, and UI flows, then drives it through three signoff gates | Shipped |
| **Release audit** | Every release produces a full audit report | Shipped |
| **Reuse what you already built** | At scoping time it surfaces what your other projects already do and recommends build-new, extend, or extract-shared, from a semantic capability index | Shipped |
| **AI finds the work you forgot** | Reads project context and proposes the tasks it implies; you accept or reject each one | Shipped |

### Pillar III — Run the whole practice

*One surface for the work, the time, and the money.*

| Feature | What it does | Status |
|---|---|---|
| **One board for every PM tool** | Jira, Monday.com, Asana, and Trello sync in alongside your internal tasks; changes flow back | Shipped |
| **Timers to invoices** | If you're a consultant: billable time per task with pause and resume, then timesheets and PDF invoices; each entry is marked invoiced once so hours are never double-billed | Shipped |
| **Consultant command center** | Consolidated task queue, billable time, earnings, and client connections across every engagement | Shipped |
| **Hire a consulting firm in-platform** | Scoped collaboration, time tracking, and B2B billing without handing over team-member access | Engagement core shipped; discovery marketplace and in-platform payments are roadmap |
| **Teams, roles, multi-tenancy** | Company-isolated users, projects, and billing with role-based access | Shipped |
| **Compliance in the workflow** | Load SOC 2, HIPAA, NIST, HITRUST, ISO 27001, or GDPR once; it extracts audit tasks and runs automated code audits as you build | Shipped |
| **Catch your app's bugs automatically** | Install bug-trapping into your project; silent runtime failures land on your own board, grouped and de-duplicated, with an AI-proposed cause and fix | Shipped |

### The editor is the product surface

| Feature | What it does | Status |
|---|---|---|
| **VS Code Dev Cockpit** | Remaining work, project health, and the next step live in your sidebar | Shipped, on the marketplace |
| **Orchestrator kit** | A CLI and MCP workflow engine that scaffolds scopes, generates specs and tasks, writes and fences code, and runs audits | Shipped, auto-updating |
| **Scope check-out / check-in** | Claim a scope; the editor shows which scopes are claimed and read-only so parallel work does not collide | Shipped |
| **Remote session bridge** | Hand a running session off to your phone and keep driving it | Shipped |
| **Community help in the editor** | Real-time chat with other builders without leaving VS Code | Shipped |

### Speaks your language

The application, the public sites, and the AI-generated guidance all work in French, German,
Spanish, Italian, and Portuguese — deliberately, because the beachhead community is
multi-language, and because adopting AI-assisted development should not require clearing an
English-language wall first. In-app help is plan-aware: it tells you whether your subscription includes the thing you are reading about.

---

## 5. The five things that are actually different

If the segment only has room for five minutes, these are the five.

1. **The product is the proof.** wxKanban was a 4GL application that made the crossing it
   sells. Nobody else in this niche can say that, and it is checkable.

2. **Every line of code names its reason.** 612 fenced code units, machine-written, audited at
   build time. From a spoken idea to the shipped line, the chain is unbroken.

3. **The gates are not advisory.** Most methodology tools let you skip the step. This one
   refuses. That is unpopular for about a week and then it is the reason the product works.

4. **It teaches while you ship.** The mission is educational. The target reader is not a
   computer-science graduate — the standard we design for is a career-changer about a year in, an ex-mechanic who already understands diagnostics, root cause versus symptom, and checking
   your work. He does not need a lecture on why software is hard. He needs the vocabulary and the professional habits, and he gets them by shipping real work inside a structure that has  the judgment built in.

5. **The crossing is done with you, not sold to you.** There is no "click to convert" button and  we do not pretend there is. There is a method, real tooling for the mechanical half, and a founder who walks it with you screen by screen.

---

## 6. Lines that tend to land

Short, true, and quotable — pull any of them, or ask Andy to say it in his own words.

- "You're not starting over. You're crossing over — onto ground you own."
- "The hard part of software was never the syntax. It was the judgment. You already have it. AI still demands it. We hand you the new tools and walk you across."
- "We made the exact crossing we're asking you to make. The product is the proof."
- "AI writes code that looks right. The gates are how you find out if it *is* right."
- "Ask most codebases why a function exists and the honest answer is 'nobody remembers.' Ask
  ours and it tells you the scope and the task."
- "Your whole career is sitting on someone else's platform. What happens when they pull the plug?"
- "The lifecycle is the skill. The tools just changed."
- "Forty-plus years, every platform shift — mainframe to web to cloud. I've been made obsolete
  before. This time I built the bridge first."

---

## 7. The hard questions — ask them

These are the skeptical questions the product actually has to answer. The answers are here so
you know there's somewhere to go when you ask, not so you'll skip them. The interesting parts of
this story are on the other side of these.

**"Isn't this just Jira with AI bolted on?"**
Jira tracks that work exists. This produces the work. You talk through a feature, it writes the
specification, it derives the tasks, your editor builds against them, and the gates decide
whether it advances. It also syncs *with* Jira, because most people already have one and are not
going to abandon it.

**"Isn't it just a wrapper around Claude or GPT?"**
The AI in your editor generates. The kit validates, writes, fences, and audits — and it is
provider-configurable, so the model is a component, not the product. The durable part is the
methodology and the traceability, and neither of those comes from the model.

**"What happens when the AI writes bad code?"**
It does, regularly. That is the premise of the design, not an edge case. Tests, stage gates, a pre-test gate, a required test plan, and a release audit exist precisely because confident wrong output is the normal failure mode. Speaking personally: green unit tests and a clean build once shipped two fatal bugs here, which is why endpoint testing is now non-negotiable on every fix.

**"You are asking people to leave a proprietary platform. Aren't you just a different lock-in?"**
Fair question, and the answer has to be structural rather than a promise. The output is React, Tailwind, PostgreSQL, and TypeScript — or a stack of your own — standard, portable, yours. You keep your source, and you can choose other stacks for mobile, web, or desktop. There is work underway so the AI can run against your own model endpoint, meaning your code never leaves your environment at all. And we have audited and published exactly which paths ever send code
outside the boundary. If we disappeared tomorrow, you would still have a running application on foundations nobody can revoke.

**"How much of this is real versus roadmap?"**
Most of it is running in production today; the tables in Part 4 mark the exceptions
individually. The honest ones: bring-your-own-LLM is in active development, the consulting
marketplace has its engagement core shipped but discovery and in-platform payments are roadmap, and the pre-test gate is built and proven but not yet released.

**"Who is this actually for?"**
Three types of people. 
* The seasoned developer stranded on a proprietary platform — that is the beachhead. 
* The career-changer a year into software who is capable but has not yet absorbed the professional habits. 
* The small independent developer that needs to change and wants to use AI to gain from the knowledge he already possesses.

The bet is that all need the same thing: structure that carries the judgment, so they can move fast without starting over.

We started back in "cobol" and mainframes documenting the IN and OUT that was needed and using paper with flowcharts and process diagrams to fill the "inbetween" to produce the output. So my goal is to give back 45+ years of development in several languages and 2 4GL's and let the individual whether a programmer or not, learn to build for their business or personal and extend that knowledge safely and assured of success.

**"How big is the interest?"**
Well past beta scale. Over a thousand people registered interest before launch, which is why the original five-seat beta model was retired in favor of broad signup. 55 companies so far using it successfully in 5 countries.

---

