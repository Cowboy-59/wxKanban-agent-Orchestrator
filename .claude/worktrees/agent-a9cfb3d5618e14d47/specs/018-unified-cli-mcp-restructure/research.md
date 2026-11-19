# Research: Unified CLI and AI Gateway (Spec 018)

## AI Gateway Design Research

### Guardrail Pattern Options

#### 1. Pattern-Based Blocking (Chosen)
- Regex + keyword blocklist for prompt injection and off-domain patterns
- Fast, deterministic, no external dependency
- Examples: `ignore previous instructions`, `system prompt override`, requests referencing non-MCP domains

#### 2. LLM-as-Judge Guardrail
- Send each request to a secondary LLM for safety classification
- More accurate but adds latency and cost
- Future enhancement consideration

#### 3. OpenAI Moderation API
- External dependency; adds network latency
- Not suitable for on-premise or air-gapped environments
- Not chosen for initial implementation

**Decision:** Pattern-based blocking for v1; LLM-as-judge as future optional layer.

---

### LLM Provider Normalization

Both Gemini and OpenAI return structured JSON in function-calling mode, but with differing schemas:

| Aspect | Gemini (function calling) | OpenAI (tool calls) |
|--------|--------------------------|---------------------|
| Tool name field | `name` | `function.name` |
| Arguments | `args` (object) | `function.arguments` (JSON string) |
| Confidence | Not in API response; inferred from response | Not in API response; inferred |
| Refusal format | `finishReason: "SAFETY"` | `finish_reason: "content_filter"` |

**Normalization contract:**
```typescript
interface NormalizedToolCall {
  toolName: string;
  args: Record<string, unknown>;
  confidence: number;   // 0–1, inferred from model output quality
  rawResponse: unknown; // preserved for audit
}
```

---

### MCP Runtime Modes

The wxKanban MCP server supports two runtime modes:

| Mode | Transport | Use Case |
|------|-----------|----------|
| stdio | stdin/stdout | VS Code Copilot, local CLI |
| HTTP/SSE | HTTP + Server-Sent Events | Remote agents, web clients |

**Parity implications:**
- Tool behavior (schema, auth, results) MUST be identical across both modes
- Connection/session lifecycle differs by transport — these are documented as transport exceptions
- Test records MUST state which runtime mode was used

---

### MCP Parity Enforcement Approaches

#### 1. CI Diff-Based (Chosen)
- On every PR, compute diff between main MCP and kit MCP shared tool files
- Classify changes as: identical / diverged / transport-exception
- Advisory: report only. Mandatory: block on critical/high.

#### 2. Runtime Contract Testing
- Run identical test payloads against both MCP instances and compare outputs
- Stronger signal but requires both instances running in CI
- Recommended as future Phase 2 addition after advisory stability

#### 3. Shared Source Symlinks
- Symlink shared tool files between main and kit MCP directories
- Eliminates drift entirely but complicates independent transport wrappers
- Not chosen: creates coupling that conflicts with transport exception docs

**Decision:** CI diff-based for v1; runtime contract tests added in Phase 2.

---

### MCP Upgrade Distribution Research

#### GitHub Releases API
- `GET /repos/{owner}/{repo}/releases/latest` — fetch latest release metadata
- Returns: `tag_name`, `name`, `body` (changelog markdown), `published_at`, `assets`
- Rate limit: 60 req/hr unauthenticated, 5000 req/hr authenticated

**Polling strategy:** On-demand check at user request; optionally daily background poll.

**Changelog extraction:**
- Parse GitHub release `body` for sections: `### Added`, `### Changed`, `### Fixed`, `### Breaking`
- Surface command-level changes to user during update decision prompt

#### Update State Machine
```
pending → accepted → [apply] → applied
       → deferred (with window) → [reminder] → pending
       → rejected
```

---

### Cross-Project Drift Database Design

**Storage options:**

| Option | Pros | Cons |
|--------|------|------|
| wxKanban DB table (chosen) | Queryable, aggregatable, matches stack | Adds schema surface |
| GitHub Issues only | Zero DB cost | Not queryable; no aggregation |
| Append-only log file | Simple | No structured query; lost on redeploy |

**Decision:** wxKanban DB as primary; GitHub Issues as human-facing visibility channel.

---

### CI Parity Gate Rollout Research

**Advisory → Mandatory promotion criteria (30-day window):**
- False positive rate < 5% of advisory runs
- No tool regressions attributed to parity gate signal
- At least 10 successful parity check runs completed

**Mandatory mode blocking logic:**
```yaml
# .github/workflows/parity-check.yml
if: ${{ steps.parity.outputs.max_severity == 'critical' || steps.parity.outputs.max_severity == 'high' }}
  run: exit 1  # only when gateMode == 'mandatory'
```

**Rollback authority:** Requires explicit approval from project owner role; logged in `mcpparityconfig.rollbackby`.

---

### Source vs Generated Artifact Governance

**Problem:** In earlier sessions, generated spec files in `specs/018-unified-cli-mcp-restructure/` conflicted with intent-level changes in `specs/Project-Scope/018-unified-cli-mcp-restructure.md`.

**Decision:**
- `specs/Project-Scope/018-unified-cli-mcp-restructure.md` → **authoritative intent source** (requirements, decisions, status)
- `specs/018-unified-cli-mcp-restructure/` → **generated artifacts** (spec.md, plan.md, tasks.md, data-model.md, etc.)
- Generated artifacts are derived from the scope file; they never override it
- If requirements change: update Project-Scope file first, then regenerate artifacts

This convention is enforced by code review — PRs that modify ONLY generated artifacts without a corresponding Project-Scope update should be flagged.
