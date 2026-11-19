### Exa Workflow Policy

Exa is for **deep research** when Ref isn't sufficient. Use Exa sparingly and strategically.

**When to use Exa:**

- Deep dives into conceptual or architectural topics
- Recurring issues that Ref documentation hasn't resolved
- General technical best practices (not tied to a specific library)
- Emerging patterns, industry standards, or design philosophy
- Debugging approaches when standard docs aren't helping
- Comparing different approaches or understanding trade-offs
- User explicitly requests broader web research

**When NOT to use Exa (use Ref instead):**

- Standard library/framework documentation lookups
- API reference questions
- Code examples for known libraries
- Syntax or usage questions for specific packages

**Usage hierarchy:**

1. **First**: Try Ref for library/framework docs
2. **If Ref insufficient**: Use Exa for deeper research
3. **Combine**: Use both when solving complex problems that span concepts + implementation

**Exa tools:**

- `mcp__exa__web_search_exa` - General web search for concepts, articles, discussions
- `mcp__exa__get_code_context_exa` - Code-focused search for patterns and examples

**Examples:**

- ✅ Exa: "What are best practices for CSS parallax performance optimization?"
- ✅ Exa: "Why might requestAnimationFrame cause jank on mobile Safari?"
- ✅ Exa: "Modern approaches to form validation UX patterns"
- ❌ Not Exa: "How to use Zod schema validation" (use Ref)
- ❌ Not Exa: "React useState syntax" (use Ref)

**When user says "deep dive" or "research this":**

Use Exa's `web_search_exa` with `type: "deep"` for comprehensive results.
