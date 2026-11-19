import { db } from '~/db/client.js';
import { projectspecifications as specifications } from '~/db/schema/projectspecification.js';

import { scopeconversations } from '~/db/schema/scopeconversation.js';
import { projecttasks as tasks } from '~/db/schema/projecttask.js';

import { projectphases } from '~/db/schema/projectphase.js';
import { eq, and, asc } from 'drizzle-orm';
import { createLogger } from '~/server/lib/logger.js';
// Aliased deliberately: this class has its OWN static method named `streamChat`.
// A bare `streamChat(...)` inside it resolves to this import (lexical scope beats a
// class static), which is correct but reads like recursion. The alias makes the two
// impossible to confuse.
import { streamChat as llmStreamChat, type ChatMessage } from '~/server/ai/llm-stream.js';
import { generateOnce, parseJsonLoose } from '~/server/ai/llm-provider.js';
import type { Response } from 'express';
import type { AITaskProposal } from '~/shared/types/projects.js';
import { ScopeStageService } from './ScopeStageService.js'; // [SCOPE 123 / T019]

const logger = createLogger('scope-chat-service');

type SSEResponse = Response & { flush?: () => void };

// Simple Levenshtein distance for deduplication
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function isDuplicate(proposed: string, existing: string[]): boolean {
  const norm = normalizeTitle(proposed);
  const maxLen = Math.max(norm.length, 1);
  return existing.some((e) => {
    const dist = levenshtein(norm, normalizeTitle(e));
    return dist / maxLen <= 0.2;
  });
}

export class ScopeChatService {
  // ─── Chat History ───────────────────────────────────────────────────────────

  static async getChatHistory(scopeid: string): Promise<{
    messages: Array<{ id: string; role: string; content: string; createdat: string }>;
    scopecontent: string;
    scopestatus: string;
  }> {
    const [scope] = await db
      .select({ content: specifications.content, status: specifications.status })
      .from(specifications)
      .where(eq(specifications.id, scopeid));

    if (!scope) throw new Error('Scope not found');

    const messages = await db
      .select()
      .from(scopeconversations)
      .where(eq(scopeconversations.scopeid, scopeid))
      .orderBy(asc(scopeconversations.createdat));

    return {
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdat: m.createdat.toISOString(),
      })),
      scopecontent: scope.content,
      scopestatus: scope.status,
    };
  }

  // ─── Streaming Chat (SSE) ───────────────────────────────────────────────────

  static async streamChat(
    scopeid: string,
    userMessage: string,
    res: SSEResponse
  ): Promise<void> {
    // Save user message
    await db.insert(scopeconversations).values({
      scopeid,
      role: 'user',
      content: userMessage,
    });

    // Load scope + conversation history
    const [scope] = await db
      .select({ id: specifications.id, content: specifications.content, title: specifications.title, specnumber: specifications.specnumber })
      .from(specifications)
      .where(eq(specifications.id, scopeid));

    if (!scope) {
      res.write('event: error\ndata: {"error":"Scope not found"}\n\n');
      res.end();
      return;
    }

    const history = await db
      .select({ role: scopeconversations.role, content: scopeconversations.content })
      .from(scopeconversations)
      .where(and(eq(scopeconversations.scopeid, scopeid)))
      .orderBy(asc(scopeconversations.createdat))
      .limit(50);

    // [SCOPE 099 / T005] Real system prompt, and the transport instructions are gone.
    //
    // The old prompt told the model to emit SSE frames as literal text
    // ("Always stream token by token with: event: token\ndata: {...}"). That was
    // never how it worked: this service ALREADY wraps each delta in an `event: token`
    // frame, so a compliant model would have its output double-wrapped and rendered
    // as raw protocol junk in the user's chat bubble. Gemini evidently ignored the
    // instruction; a different model may not, so it goes.
    //
    // `scope_update` / `split_proposal` are removed for the same reason: this service
    // has NO code that emits either frame, and the streaming loop only ever extracts
    // text. The client (ScopeChatView) sets scope content from a `data:` line
    // carrying `content`, which the server never sends — so "update the scope" could
    // never work and it is dishonest to keep telling the model it can. Splitting is
    // kept as a prose suggestion, which is all that ever actually reached the user.
    // Making those features real is a separate product decision, not a port.
    const systemPrompt = `You are an AI assistant helping to define and clarify a project scope document.

Current Scope: ${scope.specnumber}-${scope.title}

Scope Content:
${scope.content}

Your role:
1. Help clarify requirements and identify ambiguities
2. Suggest concrete improvements to the scope, quoting the wording you would change
3. Say so plainly when a topic in this scope is big enough to belong in its own scope

Reply in plain prose. Do not emit SSE frames, event names, or JSON envelopes — the server owns the transport.`;

    // The system prompt used to be faked as a user/model turn pair because the old
    // Gemini call never used systemInstruction. streamChat passes a real system role.
    const messages: ChatMessage[] = [
      ...history.slice(0, -1).map((h) => ({
        role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: h.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    try {
      // streamChat resolves the endpoint (llm-provider) and owns the wire; this
      // service keeps its OWN client-facing SSE contract (`event: token` / `done`),
      // so ScopeChatView needs no change. A misconfigured provider now throws
      // LlmConfigError from resolveEndpoint and lands in the catch below, replacing
      // the old key check — which named GEMINI_API_KEY at the user, in the UI.
      const fullResponse = await llmStreamChat({
        system: systemPrompt,
        messages,
        temperature: 0.4,
        maxTokens: 2048,
        onDelta: (text) => {
          res.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
          if (res.flush) res.flush();
        },
      });

      // Save assistant response
      await db.insert(scopeconversations).values({
        scopeid,
        role: 'assistant',
        content: fullResponse,
      });

      res.write('event: done\ndata: {}\n\n');
      res.end();
    } catch (err) {
      logger.error({ err, scopeid }, 'Scope chat streaming error');
      res.write('event: token\ndata: {"text":"AI is unavailable right now. Please try again."}\n\n');
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  }

  // ─── Split Proposal ─────────────────────────────────────────────────────────

  static async handleSplitDecision(
    scopeid: string,
    action: 'accept' | 'decline',
    topic: string,
    suggestedname: string,
    createdbyid: string
  ): Promise<{ recorded?: boolean; newscope?: Record<string, unknown>; updatescope?: Record<string, unknown> }> {
    if (action === 'decline') {
      await db.insert(scopeconversations).values({
        scopeid,
        role: 'system',
        content: JSON.stringify({ type: 'split_declined', topic, suggestedname }),
      });
      return { recorded: true };
    }

    // Accept: create new scope
    const [parent] = await db
      .select({ projectid: specifications.projectid, specnumber: specifications.specnumber, content: specifications.content })
      .from(specifications)
      .where(eq(specifications.id, scopeid));

    if (!parent) throw new Error('Scope not found');

    // Import ScopeService dynamically to avoid circular imports
    const { ScopeService } = await import('~/server/services/ScopeService.js');
    const newScope = await ScopeService.createScope(
      parent.projectid,
      createdbyid,
      { title: suggestedname, content: `# ${suggestedname}\n\nSplit from scope ${parent.specnumber}: ${topic}\n` }
    );

    await db.insert(scopeconversations).values({
      scopeid,
      role: 'system',
      content: JSON.stringify({ type: 'split_accepted', topic, suggestedname, newScopeId: newScope.id }),
    });

    const updatedParent = await ScopeService.getScope(scopeid);

    return { newscope: newScope as unknown as Record<string, unknown>, updatescope: updatedParent as unknown as Record<string, unknown> };
  }

  // ─── Conversation Export ────────────────────────────────────────────────────

  static async exportConversation(
    scopeid: string,
    format: 'markdown' | 'text' = 'markdown'
  ): Promise<{ filename: string; content: string }> {
    const [scope] = await db
      .select({ specnumber: specifications.specnumber, title: specifications.title })
      .from(specifications)
      .where(eq(specifications.id, scopeid));

    if (!scope) throw new Error('Scope not found');

    const messages = await db
      .select()
      .from(scopeconversations)
      .where(eq(scopeconversations.scopeid, scopeid))
      .orderBy(asc(scopeconversations.createdat));

    const filename = `scope-${scope.specnumber}-conversation.${format === 'markdown' ? 'md' : 'txt'}`;

    let content = '';
    if (format === 'markdown') {
      content = `# Scope ${scope.specnumber}: ${scope.title} — Conversation\n\n`;
      for (const m of messages) {
        if (m.role === 'system') continue;
        content += `**${m.role === 'user' ? 'User' : 'Assistant'}** — ${new Date(m.createdat).toLocaleString()}\n\n${m.content}\n\n---\n\n`;
      }
    } else {
      for (const m of messages) {
        if (m.role === 'system') continue;
        content += `[${m.role.toUpperCase()} — ${new Date(m.createdat).toLocaleString()}]\n${m.content}\n\n`;
      }
    }

    return { filename, content };
  }

  // ─── AI Task Generation ─────────────────────────────────────────────────────

  static async generateTaskProposals(
    scopeid: string,
    projectid: string
  ): Promise<{ proposals: AITaskProposal[] }> {
    const [scope] = await db
      .select({ specnumber: specifications.specnumber, title: specifications.title, content: specifications.content, status: specifications.status })
      .from(specifications)
      .where(and(eq(specifications.id, scopeid), eq(specifications.projectid, projectid)));

    if (!scope) throw new Error('Scope not found');

    const allowedStatuses = ['clarified', 'planned', 'tasks_generated', 'implemented', 'qa_passed', 'human_tested', 'beta_cleared', 'released'];
    if (!allowedStatuses.includes(scope.status)) {
      throw new Error('Scope must be clarified before generating tasks');
    }

    // Get existing task names for deduplication
    const existingTasks = await db
      .select({ name: tasks.name })
      .from(tasks)
      .where(and(eq(tasks.projectid, projectid), eq(tasks.specid, scopeid)));

    const existingNames = existingTasks.map((t) => t.name);

    // [SCOPE 099 / T005] Second Gemini call site in this file — the one the task
    // description originally missed. Same deleted defect as ScopeService:549: it read
    // `GEMINI_API_KEY ?? OPENAI_API_KEY` and posted to a GOOGLE endpoint.
    const prompt = `You are a software project manager. Based on the following scope document, generate a list of implementation tasks.

Scope: ${scope.specnumber}-${scope.title}

Content:
${scope.content}

Generate tasks for these project phases:
- Implementation (coding/development work)
- QA (testing tasks)
- HumanTesting (user acceptance testing tasks)

For each task, provide:
- name: brief task name (max 80 chars)
- description: 1-2 sentence description
- issuetype: "task" or "bug" or "feature"
- priority: "low", "medium", "high", or "critical"
- phase: "Implementation", "QA", or "HumanTesting"

Respond with a JSON object of the exact form {"tasks": [...]}, where each element is a task object with the fields above. Generate 5-15 tasks. Return only that JSON object.`;

    try {
      // maxTokens 4096: 15 tasks plus a reasoning model's hidden channel does not fit
      // the 2048 default, and a truncated response parses to nothing.
      const text = await generateOnce(prompt, { jsonMode: true, temperature: 0.2, maxTokens: 4096 });

      // Accept the envelope OR a bare array. Asking for a bare array (as this did)
      // is incompatible with OpenAI-style JSON mode, which requires a top-level
      // object — gpt-oss wraps it, `raw.filter` then throws, and task generation
      // silently yields zero tasks. Gemini's responseMimeType returns bare arrays,
      // which is why this only breaks off-Gemini.
      type RawTask = { name?: string; description?: string; issuetype?: string; priority?: string; phase?: string };
      const parsed = parseJsonLoose<RawTask[] | { tasks?: RawTask[] }>(text);
      const raw = Array.isArray(parsed) ? parsed : parsed?.tasks;
      if (!Array.isArray(raw)) {
        logger.warn(
          { scopeid, got: parsed === null ? 'unparseable' : Object.keys(parsed ?? {}) },
          'AI task generation returned an unexpected shape — no proposals',
        );
        return { proposals: [] };
      }

      const proposals: AITaskProposal[] = raw.filter((t) => t.name).map((t) => ({
        name: t.name ?? '',
        description: t.description ?? '',
        issuetype: t.issuetype ?? 'task',
        priority: t.priority ?? 'medium',
        phase: t.phase ?? 'Implementation',
        isDuplicate: isDuplicate(t.name ?? '', existingNames),
      }));

      return { proposals };
    } catch (err) {
      logger.warn({ err, scopeid }, 'AI task generation failed');
      return { proposals: [] };
    }
  }

  static async approveTaskProposals(
    scopeid: string,
    projectid: string,
    approvedtasks: Array<{
      name: string;
      description: string;
      issuetype: string;
      priority: string;
      phase: string;
    }>,
    createdbyid: string
  ): Promise<{ created: unknown[] }> {
    // Get phase IDs for the project
    const phases = await db
      .select({ id: projectphases.id, phasename: projectphases.phasename })
      .from(projectphases)
      .where(eq(projectphases.projectid, projectid));

    const phaseMap = new Map(phases.map((p) => [p.phasename, p.id]));

    const created = [];
    for (const t of approvedtasks) {
      const phaseid = phaseMap.get(t.phase) ?? null;
      const [task] = await db.insert(tasks).values({
        projectid,
        phaseid,
        createdbyid,
        specid: scopeid,
        name: t.name,
        description: t.description,
        issuetype: t.issuetype,
        priority: t.priority,
        status: 'open',
        sourceoforigin: 'ai_proposed',
      }).returning();
      created.push(task);
    }

    // Update scope status to tasks_generated
    await db.update(specifications).set({ status: 'tasks_generated', updatedat: new Date() }).where(eq(specifications.id, scopeid));

    // [SCOPE 123 / T019] Tasks now exist, which is Design's exit condition (FR-011): move the scope.
    await ScopeStageService.advance([scopeid], { actor: createdbyid, trigger: 'tasks_generated' });

    logger.info({ scopeid, count: created.length }, 'AI task proposals approved and created');
    return { created };
  }
}
