---
id: testing-qa
part: web-app
audience: customer
sources: 
---
# Automated tests (QA)

Every version of a project is checked twice before it can be released: once by the AI, and once by a person. This page covers the first half — the automated suite that runs in the **QA** phase. The tests you sign off yourself live on the next page, [User tests](testing-user.md).

## What you're looking at

At the top is the **version header** — something like **Version 1.4.0** — with the state that version is in: **In build**, **In UAT**, **In production**, or **Superseded**. Everything below is scoped to that version, so a signoff earned on one version does not silently carry to the next.

Under the header are the controls that make a large suite usable, then the list of test items, then a **Run** button for each gate.

If a scope has not been implemented yet you'll see **"No test items yet. They are generated when the scope is implemented."** — that's the empty state, and it means the work simply hasn't reached testing rather than that anything is wrong.

## Narrowing the list

- **Scope:** — a project can carry a suite for every scope it contains, and a flat list across a hundred of them answers nobody's question. Pick a scope and the page shows only its items. Only that scope's tests are fetched, which is what keeps a large project responsive.
- **All / Outstanding / Forced / Failing** — **Outstanding** is the day-to-day view, **Failing** is the one to work from when something breaks, and **Forced** shows items that must be clear before the project can release (their force-test setting is on). See [Forced test](glossary.md).

Each item is marked **Required** or **Optional**, and tagged **AI** or **Tester** so you can see at a glance whether a machine or a person wrote it.

## Running a gate

Click **Run** next to a gate and the AI works through every automated test in it. The view updates while it goes — totals read like **12 passed · 1 failed · 20 total** and refresh every couple of seconds. When the run finishes, the list reloads itself.

If the runner stops reporting, you'll see **"Run stalled — no report from the runner"** rather than a spinner that never resolves. That's a real state, not a display glitch: the run needs starting again.

## The user tests you can see but not start

You'll notice a line like **"4 user test(s) waiting for release to UAT"**. Those tests exist and are counted here deliberately, so the team can see the work is waiting — but they can't be opened yet. They unlock only once the automated tests pass for this version, so nobody is ever asked to hand-test a build already known to be broken. See [User tests](testing-user.md).

## Turning the requirement off

Administrators can change whether testing gates a release at all, under **Testing requirement**. A project can be set to skip testing, and an individual scope can either **Inherit** that setting or **Override** it.

This does not delete any tests — it stops them blocking the release. The hint on screen says it plainly: **"Administrators only. The change is written to the audit log."**

## Common tasks

**Run the automated tests for a scope**

1. Open the project and choose the **QA** phase.
2. Set **Scope:** to the scope you're interested in.
3. Click **Run** beside the gate you want.
4. Watch the totals; the list refreshes when the run finishes.
5. Switch the filter to **Failing** to work through whatever didn't pass.

**Find out why a release is blocked**

1. Filter to **Outstanding** and check for **Required** items still unfinished.
2. Check the **"waiting for release to UAT"** count — user tests block a release too.
3. If an item shows as **Forced**, it must be clear before the project can release. An administrator sets this for a scope and can change it for a single test.
