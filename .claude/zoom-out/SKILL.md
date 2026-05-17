---
name: zoom-out
description: Tell the agent to zoom out and give broader context or a higher-level perspective. Use when you're unfamiliar with a section of code or need to understand how it fits into the bigger picture.
disable-model-invocation: true
---

## Why This Matters

Before you start work on any system — a car, a machine, a building — you take a moment to understand what connects to what. You don't reach in and start turning bolts on something you've never seen before.

Code is the same. Every part of a system has callers, dependencies, and things that depend on it. If you jump straight into a file without understanding where it fits, you risk breaking something three layers away that you didn't know existed.

This habit applies whether you're using an AI assistant or not — before touching unfamiliar code, always ask someone (or something) to show you the map first. With an AI, this skill makes that a one-line ask.

---

I don't know this area of code well. Go up a layer of abstraction. Give me a map of all the relevant modules and callers, using the project's domain glossary vocabulary.
