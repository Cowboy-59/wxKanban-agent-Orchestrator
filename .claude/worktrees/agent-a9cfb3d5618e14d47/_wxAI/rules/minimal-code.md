# Minimal Code Rule

**Rule ID**: minimal-code  
**Applies To**: ALL AI providers (Claude, Gemini, Mistral, Blackbox, OpenAI, Kimi, Minimax, Grok)  
**Enforcement**: MANDATORY at level `on` or `lite` — see Levels below

---

## Rule Statement

**Write the smallest complete change that does the job.** The best code is the code never written. Laziness applies to the *solution*, never to the *scope*: everything the task requires is still finished, including the callers, tests and fixtures the change breaks.

---

## Level (settings)

The level is read from `decisions/settings.yaml`, key `minimalCode.level` (SPEC-142 contract C3). The file is project-owned; the kit never overwrites it.

| Level | Meaning |
|-------|---------|
| `on` | **Default.** A missing file or missing key means `on`. Apply the whole rule. |
| `lite` | Used for conversion work (WinDev, VB6, Clarion). Keep the closing footer, and **skip nothing whenever legacy behavior is unclear**: if you cannot tell whether an old behavior matters, port it and say so. |
| `off` | The rule is not applied. No footer is required. |

G.O.D. may set the level for a single run (a conversion run starts at `lite`); a per-run level overrides the file for that run only and never edits the file.

---

## Read Before Changing

Read the task and the code it touches first. List every place the change must reach: callers, tests, fixtures, config, exports. Check what the change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

Be lazy about the solution, never about reading, and never about finishing every part the task needs, including the callers, tests and fixtures the change breaks.

## The Ladder — take the first option that fully works

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Is it already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does. (Run the searches in `search-before-suggest.md`; this rule does not repeat them.)
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line. A one-liner that needs decoding is not short.
6. Otherwise: the minimum code that works.

## Working Rules

- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch.
- Comment only the why the code cannot show, in one line.
- Bug fix: before editing, grep every caller of the function you touch, then fix the root cause once, in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.

## Never Cut

These are never skipped at any level where the rule applies:

- Validation at trust boundaries
- Error handling that prevents data loss
- Security (authentication, authorization, secrets, injection)
- Accessibility
- The calibration real hardware needs
- Anything the user asked for

## Tests for Risky Logic

Lazy code without its check is unfinished. New non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.

## Known Shortcuts

A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

## Closing Footer — "What I skipped"

End the reply with one or two lines: what was skipped or left unchecked, and any risk the user should know. Required at `on` and `lite`.

---

## Relationship to Other Rules

- `search-before-suggest.md` — rung 2 of the ladder. That rule says how to search; this one says what to do with the result.
- `development-guidelines.md` — quality guidance. Where they conflict on size, this rule wins; the Never Cut list always wins.
- `constitution.md` — no `any`, Pino only, fences by the orchestrator. Minimal code never relaxes these.

---

**Version**: 1.1.0 (rewritten 2026-10-23 against Ponytail's `AGENTS.md`, read in full)  
**Last Updated**: 2026-10-23  
**Applies To**: All wxKanban AI interactions

---

## Attribution

This rule is adapted from Ponytail (https://github.com/DietrichGebert/ponytail), used under the MIT License.

MIT License

Copyright (c) 2026 DietrichGebert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
