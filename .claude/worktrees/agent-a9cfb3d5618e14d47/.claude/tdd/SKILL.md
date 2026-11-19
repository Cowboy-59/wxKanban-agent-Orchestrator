---
name: tdd
description: Test-driven development with red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

# Test-Driven Development

## Why This Matters

Here's the trap most developers fall into: write the code, then write tests to prove the code works. The problem is you already know the code works — you just wrote it. So you end up writing tests that confirm what you built, not tests that prove it does what the user actually needs.

The better approach is to flip it. Before you write a single line of implementation, write a test that describes what success looks like from the outside. Watch it fail. Then write just enough code to make it pass. Then clean up.

This discipline forces you to think like a user before you think like a developer. It also means your tests survive refactoring — because they test what the system *does*, not *how it does it*. Change the internals as many times as you want; if the behavior is the same, the tests stay green.

An experienced mechanic writes the inspection checklist before the repair, not after. Same idea.

**This methodology is tool-agnostic.** Whether you are writing code yourself, using an AI assistant, or pairing with another developer — the discipline is the same. The AI writes the code; you still define what "done" looks like before it starts. If you let the AI define success, you get tests that prove the AI's assumptions, not yours.

---

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

---

## The Anti-Pattern to Avoid: Horizontal Slicing

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" — treating RED as "write all tests" and GREEN as "write all code."

This produces tests that aren't worth having:

- Tests written in bulk test *imagined* behavior, not *actual* behavior
- You end up testing the *shape* of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes — they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before you understand the implementation

**The correct approach is vertical slices — one tracer bullet at a time:**

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED → GREEN: test1 → impl1
  RED → GREEN: test2 → impl2
  RED → GREEN: test3 → impl3
```

Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

---

## Workflow

### 1. Plan first — you define success, not the AI

Before writing any code:

- [ ] Decide what the public interface should look like
- [ ] List the behaviors to test — written as "the system should..." statements, not implementation steps
- [ ] Prioritize: you can't test everything, pick what matters most to the user
- [ ] Write this list down before any code is generated

**The developer owns this step.** If you hand it to an AI without thinking it through, the AI will make reasonable guesses — and you'll end up testing what the AI assumed you wanted, not what you actually need. A few minutes of thinking here saves hours of debugging later.

### 2. Tracer Bullet — prove the path works

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → test passes
```

This is your tracer bullet — it proves the end-to-end path is wired up before you build the rest.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → passes
```

Rules:
- One test at a time
- Only enough code to pass the current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor

After all tests pass, look for improvements:

- [ ] Remove duplication
- [ ] Simplify — can the same behavior be expressed more clearly?
- [ ] Move complexity behind simpler interfaces
- [ ] Run tests after every change

**Never refactor while RED. Get to GREEN first, always.**

---

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive an internal refactor
[ ] Code is minimal — only what this test needs
[ ] No speculative features added
```
