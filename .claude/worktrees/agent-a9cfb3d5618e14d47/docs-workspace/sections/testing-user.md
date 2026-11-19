---
id: testing-user
part: web-app
audience: customer
sources: 
---
# User tests

Some things a machine cannot judge: whether a screen reads clearly, whether a total is the number you expected, whether a workflow makes sense end to end. Those are your tests, and they live in the **Human Testing** phase. The automated half is covered on the previous page, [Automated tests (QA)](testing-qa.md).

## Before anything is released to you

Until the automated tests pass for the current version, this page shows **"Not ready for you yet"** and a count of how many tests are waiting.

That's intentional. Hand-testing a build that the machine has already found broken wastes your time and produces bug reports about problems that are already known. Once the automated run passes, the tests release to you and the page fills in.

## What a test looks like

The summary line reads something like **3 required · 2 optional · version 1.4.0**, so you always know how much is left and which version you are signing off.

Each test is laid out in three parts:

- **Before you start** — the state things need to be in for the test to mean anything.
- **Steps** — what to do, in order.
- **Check afterwards** — what should be true once you're done.

Work through them in that order. Skipping the preconditions is the usual reason a test appears to fail when nothing is actually wrong.

## Passing and failing

**Pass** records your signoff against this version, in your name.

**Fail** asks what actually happened, and that wording matters — as the screen says, **"A failure files a bug report with these steps attached."** Your description becomes the report. Describe what you saw rather than what you think caused it; the person reading it cannot see your screen.

This is the fastest way to file a useful bug report, because the reproduction steps are attached for you.

## Adding your own test

**Add a test** lets you write a test that isn't in the generated suite — something you know is worth checking that nobody thought to specify. It's tagged **Tester** rather than **AI**, so anyone reading the results can see a person wrote it.

## When you're asked to test something again

Occasionally a test you've already signed off will come back marked **"Please test this again"**. Something changed since your signoff and the system can't determine whether your verification still holds.

Test it again and sign off as normal. If you're confident the change couldn't have affected what you verified, say why — your earlier signoff stands, and your explanation is recorded alongside it.

## Common tasks

**Sign off your tests for a version**

1. Open the project and choose the **Human Testing** phase.
2. If you see **"Not ready for you yet"**, the automated tests haven't passed — there's nothing to do.
3. Read **Before you start**, follow the **Steps**, then confirm **Check afterwards**.
4. Click **Pass**, or **Fail** and describe what happened.
5. Repeat until no **Required** tests remain.

**Report something that's wrong**

1. Open the test that exposed it.
2. Click **Fail** and describe what you did and what you saw.
3. The bug report is filed with the steps attached; follow it up under My Feedback.
