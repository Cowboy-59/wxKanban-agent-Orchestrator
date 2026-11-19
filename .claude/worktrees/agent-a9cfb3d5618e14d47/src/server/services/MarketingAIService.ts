/**
 * Marketing AI Assist (spec 065)
 *
 * On-demand marketing-copy generation for the SysAdmin Marketing hub. Every
 * function mirrors BugSuggestionService (SCOPE-063): a focused system prompt, a
 * strict expected output, JSON-parsed with fence-stripping, fail-open to null on
 * ANY error (never throws), Pino-logged. Marketing copy uses Claude via the
 * per-call provider override (MARKETING_LLM_PROVIDER / MARKETING_LLM_MODEL),
 * independent of the app-wide LLM_PROVIDER. Generation only — nothing is sent,
 * posted, or published; outputs are drafts for human review.
 */

import { eq } from "drizzle-orm";
import {
  generateOnce,
  getProvider,
  availableProviders,
  type GenerateOptions,
  type LlmProvider,
} from "~/server/ai/llm-provider.js";
import { db } from "~/server/db/client.js";
import { systemSettings } from "~/db/schema/systemSettings.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("marketing-ai");

// [SCOPE 065 / T002] BEGIN — marketing AI assist service (generation + throttle)

const PRODUCT_CONTEXT =
  "wxKanban is an AI-first project-management starter kit and methodology that takes developers " +
  "— especially WinDev/PCSoft developers moving into AI-assisted development — from zero to release " +
  "with a spec-first lifecycle. Tone: confident, practical, encouraging; never hypey.";

/**
 * Marketing copy uses Claude by default. If the override provider is anthropic but
 * no key is configured, fall back to the app-wide default (FR-001) so the action
 * still works rather than failing.
 */
function marketingOpts(): Pick<GenerateOptions, "provider" | "model"> {
  const provider = (process.env["MARKETING_LLM_PROVIDER"] as LlmProvider) || "anthropic";
  // No key for the default Claude provider → fall back fully to the app default.
  if (provider === "anthropic" && !process.env["ANTHROPIC_API_KEY"]) return {};
  // Model: explicit override wins; else Claude default only for anthropic; else let
  // generateOnce pick the provider's own default (avoids sending a Claude id to groq).
  const explicit = process.env["MARKETING_LLM_MODEL"];
  const model = explicit || (provider === "anthropic" ? "claude-sonnet-4-6" : undefined);
  return model ? { provider, model } : { provider };
}

// [SCOPE 100 / T010] Translation-only model override. Translating one source into
// all 5 locales fans out ~5-10 calls at once; on Groq's free tier the default
// llama-3.3-70b-versatile has only 12K TPM, so the burst 429s ("Too Many Requests
// … tokens per minute") and every locale fails open to null. Route just the
// translation calls to a higher-TPM Groq model (llama-4-scout = 30K TPM) so the
// same parallel fan-out fits the budget. Model-only, and only when the marketing
// provider is groq — a groq model id would be rejected by anthropic/gemini, which
// carry their own generous limits and need no override.
const TRANSLATION_MODEL =
  process.env["MARKETING_TRANSLATION_MODEL"] || "meta-llama/llama-4-scout-17b-16e-instruct";

function translationOpts(): Pick<GenerateOptions, "provider" | "model"> {
  const base = marketingOpts();
  return base.provider === "groq" ? { ...base, model: TRANSLATION_MODEL } : base;
}

// [SCOPE 100 / T017] BEGIN — founder-selectable translation/AI provider (FR-011)
/** systemsettings key holding the founder's chosen bio translation/AI provider. */
export const MARKETING_TRANSLATION_PROVIDER_KEY = "marketing.translationProvider";

/**
 * translationOpts() generalized to an explicit provider. Same model policy as the
 * env path: groq keeps the high-TPM translation model, anthropic keeps Sonnet, and
 * gemini / openai-compatible use their own preset default model (via generateOnce).
 */
export function translationOptsFor(provider: LlmProvider): Pick<GenerateOptions, "provider" | "model"> {
  if (provider === "groq") return { provider, model: TRANSLATION_MODEL };
  if (provider === "anthropic") {
    return { provider, model: process.env["MARKETING_LLM_MODEL"] || "claude-sonnet-4-6" };
  }
  return { provider };
}

/**
 * Resolve routing for a bio translate/revise call from the saved setting. Absent,
 * unreadable, or pointing at a now-unconfigured provider → the env default
 * (translationOpts()), so the action never fails on a stale choice (FR-011 fail-open).
 */
export async function resolveTranslationRouting(): Promise<Pick<GenerateOptions, "provider" | "model">> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, MARKETING_TRANSLATION_PROVIDER_KEY))
      .limit(1);
    const provider = (row?.value as { provider?: string } | null | undefined)?.provider;
    if (provider && availableProviders().includes(provider as LlmProvider)) {
      return translationOptsFor(provider as LlmProvider);
    }
  } catch (err) {
    logger.warn({ err }, "reading marketing translation provider failed; using env default");
  }
  return translationOpts();
}

/** The concrete provider the picker shows as selected (for GET /bio/providers). */
export async function getSelectedTranslationProvider(): Promise<LlmProvider> {
  const routing = await resolveTranslationRouting();
  return routing.provider ?? getProvider();
}
// [SCOPE 100 / T017] END

/** Generate + strict-JSON parse. Fail-open: any error → null (logged). */
async function genJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T | null> {
  try {
    const raw = await generateOnce(userPrompt, {
      systemPrompt,
      temperature: opts.temperature ?? 0.6,
      maxTokens: opts.maxTokens ?? 1500,
      ...marketingOpts(),
    });
    const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(json) as T;
  } catch (err) {
    logger.error({ err }, "marketing AI JSON generation failed (fail-open)");
    return null;
  }
}

/** Generate plain text. Fail-open: any error → null (logged). */
async function genText(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number } = {},
  // Provider/model routing. Defaults to the marketing opts; translation callers
  // pass translationOpts() to use the higher-TPM model (SCOPE 100 / T010).
  routing: Pick<GenerateOptions, "provider" | "model"> = marketingOpts(),
): Promise<string | null> {
  try {
    const raw = await generateOnce(userPrompt, {
      systemPrompt,
      temperature: opts.temperature ?? 0.4,
      maxTokens: opts.maxTokens ?? 1500,
      ...routing,
    });
    return raw.trim();
  } catch (err) {
    logger.error({ err }, "marketing AI text generation failed (fail-open)");
    return null;
  }
}

// [SCOPE 096 / T006] BEGIN — draft a feature snippet from a Project-Scope doc
export interface FeatureSnippetDraft {
  name: string;
  valueProp: string;
  audience: "windev" | "careerchanger" | "broad";
  benefit: string;
  cta: string;
}

/**
 * Draft ONE customer-facing marketing feature snippet from a Project-Scope
 * document. Fail-open (null on any error). Copy only — the caller saves it as a
 * draft for review; nothing is published.
 */
export async function featureSnippetFromScope(
  scopeContent: string,
): Promise<FeatureSnippetDraft | null> {
  const system =
    PRODUCT_CONTEXT +
    " You turn an internal Project-Scope document into ONE customer-facing marketing feature snippet. " +
    "Lead with the benefit; strip FR numbers, table names, and internals. Return STRICT JSON only, no prose, " +
    'with keys: name (short, benefit-flavored), valueProp (one present-tense sentence), audience (one of ' +
    '"windev" | "careerchanger" | "broad"), benefit (the outcome/pain removed), cta (a short call-to-action phrase).';
  const user =
    "Draft the marketing feature snippet for this scope. Return JSON only.\n\n" +
    scopeContent.slice(0, 12000);
  const draft = await genJson<FeatureSnippetDraft>(system, user, {
    temperature: 0.5,
    maxTokens: 500,
  });
  if (!draft || !draft.name || !draft.valueProp) return null;
  const audience =
    draft.audience === "windev" || draft.audience === "careerchanger"
      ? draft.audience
      : "broad";
  return { ...draft, audience };
}
// [SCOPE 096 / T006] END

// ─── Soft throttle (per user+action, in-process) ────────────────────────────
const THROTTLE_MS = Number(process.env["MARKETING_AI_THROTTLE_MS"] ?? 4000);
const lastCallAt = new Map<string, number>();

/** Cost guard: reject rapid repeats before reaching the model (FR-004). */
export function checkThrottle(key: string): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const elapsed = now - (lastCallAt.get(key) ?? 0);
  if (elapsed < THROTTLE_MS) return { ok: false, retryAfterMs: THROTTLE_MS - elapsed };
  lastCallAt.set(key, now);
  return { ok: true, retryAfterMs: 0 };
}

// ─── Output shapes ───────────────────────────────────────────────────────────
export interface NewsletterDraft {
  subject: string;
  body: string;
}
export interface NewsletterVariants {
  subjects: string[];
  ctas: string[];
}
export type SocialChannel = "linkedin" | "x" | "facebook" | "reddit" | "youtube";
export interface SocialCopyItem {
  channel: string;
  copy: string;
  hashtags: string[];
}
export interface SeoMeta {
  title: string;
  description: string;
  og: Record<string, string>;
  jsonld: unknown;
  copy?: string;
}
export interface SeoFinding {
  severity: "high" | "medium" | "low";
  issue: string;
  fix: string;
}
export interface SeoAuditResult {
  score: number;
  findings: SeoFinding[];
}
export interface TranslationItem {
  locale: string;
  language: string;
  text: string | null;
}
export interface RepurposeBundle {
  newsletterBlurb: string;
  social: SocialCopyItem[];
  summary: string;
}
export interface OverviewAnalysis {
  narrative: string;
  actions: string[];
}

// The 5 non-English translation targets — mirrors src/client/i18n/locales/
// (en-US is the source). FR-010: the language set tracks the project locales.
export const TRANSLATION_LOCALES: ReadonlyArray<{ locale: string; language: string }> = [
  { locale: "fr-FR", language: "French" },
  { locale: "de-DE", language: "German" },
  { locale: "es-ES", language: "Spanish (Spain)" },
  { locale: "it-IT", language: "Italian" },
  { locale: "pt-BR", language: "Brazilian Portuguese" },
];

const JSON_ONLY = "Output ONLY a compact JSON object — no prose, no markdown fences.";

// ─── Assist actions ──────────────────────────────────────────────────────────

/** Draft a newsletter from a short brief. */
export async function newsletterDraft(brief: string): Promise<NewsletterDraft | null> {
  return genJson<NewsletterDraft>(
    `You are an expert B2B SaaS email marketer. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `Write one marketing newsletter for wxKanban based on this brief:\n${brief}\n\n` +
      `Return JSON exactly: {"subject":"<compelling subject line>","body":"<email body, plain text with short paragraphs>"}`,
    { temperature: 0.7, maxTokens: 1600 },
  );
}

/** Improve an existing newsletter draft (optionally per an instruction). */
export async function newsletterImprove(
  subject: string,
  body: string,
  instruction?: string,
): Promise<NewsletterDraft | null> {
  return genJson<NewsletterDraft>(
    `You are an expert B2B SaaS email marketer editing a draft. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `Improve this newsletter${instruction ? ` (focus: ${instruction})` : ""}.\n` +
      `Current subject: ${subject}\nCurrent body:\n${body}\n\n` +
      `Return JSON exactly: {"subject":"<improved subject>","body":"<improved body>"}`,
    { temperature: 0.6, maxTokens: 1600 },
  );
}

/** Subject-line + CTA alternatives for an existing draft. */
export async function newsletterVariants(
  subject: string,
  body: string,
): Promise<NewsletterVariants | null> {
  return genJson<NewsletterVariants>(
    `You are a conversion copywriter. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `Given this newsletter, propose alternatives.\nSubject: ${subject}\nBody:\n${body}\n\n` +
      `Return JSON exactly: {"subjects":["<5 subject-line options>"],"ctas":["<5 call-to-action options>"]}`,
    { temperature: 0.9, maxTokens: 800 },
  );
}

/** Platform-tailored social copy (one call → per-channel). */
export async function socialCopy(
  message: string,
  channels: SocialChannel[],
): Promise<SocialCopyItem[] | null> {
  const result = await genJson<{ items: SocialCopyItem[] }>(
    `You are a social media manager. ${PRODUCT_CONTEXT} Respect each platform's length and tone ` +
      `(X concise; LinkedIn professional; Reddit conversational/no-hype; Facebook friendly; YouTube a video description). ${JSON_ONLY}`,
    `Write social posts promoting this message:\n${message}\n\n` +
      `Target channels: ${channels.join(", ")}.\n` +
      `Return JSON exactly: {"items":[{"channel":"<channel>","copy":"<post copy>","hashtags":["<relevant hashtags>"]}]}`,
    { temperature: 0.8, maxTokens: 1600 },
  );
  return result?.items ?? null;
}

/** SEO meta + structured data (+ optional page copy) for a page. */
export async function seoGenerate(input: {
  topic: string;
  keywords?: string;
}): Promise<SeoMeta | null> {
  return genJson<SeoMeta>(
    `You are an SEO specialist. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `Generate SEO assets for a landing page about: ${input.topic}.\n` +
      (input.keywords ? `Target keywords: ${input.keywords}.\n` : "") +
      `Return JSON exactly: {"title":"<≤60 char title>","description":"<≤155 char meta description>",` +
      `"og":{"og:title":"...","og:description":"...","og:type":"website"},` +
      `"jsonld":{<valid schema.org JSON-LD object>},"copy":"<optional keyword-targeted intro paragraph>"}`,
    { temperature: 0.5, maxTokens: 1400 },
  );
}

/** Audit an existing page's HTML → scored, prioritized fixes. */
export async function seoAudit(html: string): Promise<SeoAuditResult | null> {
  return genJson<SeoAuditResult>(
    `You are an SEO auditor. ${JSON_ONLY}`,
    `Audit this page HTML for SEO issues (title, meta description, headings, alt text, ` +
      `structured data, thin content). HTML (truncated):\n${html.slice(0, 6000)}\n\n` +
      `Return JSON exactly: {"score":<0-100>,"findings":[{"severity":"high|medium|low","issue":"<what>","fix":"<concrete fix>"}]}`,
    { temperature: 0.3, maxTokens: 1400 },
  );
}

/**
 * Translate one text into a single supported locale (fail-open → null). Mirrors
 * translateAll but for one target — used by the newsletter send path to localize
 * a member's copy to their profile language. Returns null for an English/unknown
 * locale or on any model error, so the caller keeps the source text.
 */
export async function translateText(text: string, locale: string): Promise<string | null> {
  const target = TRANSLATION_LOCALES.find((l) => l.locale === locale);
  if (!target || !text.trim()) return null;
  return genText(
    `You are a professional marketing translator. Translate faithfully, preserving tone, ` +
      `any HTML tags, and the exact line-break/blank-line structure. Output ONLY the translation ` +
      `— no preamble, no code fences.`,
    `Translate the following into ${target.language} (${target.locale}), keeping every line break:\n\n${text}`,
    { temperature: 0.3, maxTokens: 1600 },
    translationOpts(),
  );
}

/** Translate text into all 5 non-English locales; each independent (fail-open per locale). */
export async function translateAll(text: string): Promise<TranslationItem[]> {
  return Promise.all(
    TRANSLATION_LOCALES.map(async ({ locale, language }) => ({
      locale,
      language,
      text: await genText(
        `You are a professional marketing translator. Translate faithfully, preserving tone and any HTML; output only the translation.`,
        `Translate the following marketing copy into ${language} (${locale}):\n\n${text}`,
        { temperature: 0.3, maxTokens: 1600 },
        translationOpts(),
      ),
    })),
  );
}

/** Repurpose one source message into a coordinated multi-channel bundle. */
export async function repurpose(message: string): Promise<RepurposeBundle | null> {
  return genJson<RepurposeBundle>(
    `You are a content strategist. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `Repurpose this source message into a coordinated set of marketing assets:\n${message}\n\n` +
      `Return JSON exactly: {"newsletterBlurb":"<short newsletter paragraph>",` +
      `"social":[{"channel":"linkedin|x|facebook|reddit|youtube","copy":"...","hashtags":["..."]}],` +
      `"summary":"<one-sentence summary>"}`,
    { temperature: 0.8, maxTokens: 1800 },
  );
}

/** Turn the Overview rollup data into a written next-best-action read. */
export async function overviewAnalyze(overview: unknown): Promise<OverviewAnalysis | null> {
  return genJson<OverviewAnalysis>(
    `You are a marketing analyst advising a small B2B SaaS team. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `Here is the current marketing dashboard rollup (JSON):\n${JSON.stringify(overview).slice(0, 4000)}\n\n` +
      `Return JSON exactly: {"narrative":"<concise read of where things stand>","actions":["<3-6 concrete next steps>"]}`,
    { temperature: 0.5, maxTokens: 1200 },
  );
}
// [SCOPE 065 / T002] END

// [SCOPE 065 / T010] BEGIN — campaign-goal, post-content, and layout assist
export interface CampaignGoalResult { goal: string }
export interface PostContentResult { content: string }
export interface LayoutResult { content: string; notes: string[] }

/** Draft or improve a campaign goal from its name + audience segment. */
export async function campaignGoal(input: {
  name?: string;
  segment: string;
  current?: string;
  instruction?: string;
}): Promise<CampaignGoalResult | null> {
  const improving = Boolean(input.current?.trim());
  return genJson<CampaignGoalResult>(
    `You are a B2B SaaS growth marketer. ${PRODUCT_CONTEXT} ${JSON_ONLY}`,
    `${improving ? "Improve" : "Write"} a concise, measurable marketing campaign goal.\n` +
      `Campaign name: ${input.name || "(unnamed)"}\nAudience segment: ${input.segment}\n` +
      (input.current ? `Current goal: ${input.current}\n` : "") +
      (input.instruction ? `Focus: ${input.instruction}\n` : "") +
      `Return JSON exactly: {"goal":"<2-4 sentence goal with a clear target/outcome>"}`,
    { temperature: 0.6, maxTokens: 500 },
  );
}

/** Generate post copy for a channel from the campaign context. */
export async function postContent(input: {
  channel: string;
  context: string;
  locale?: string;
  instruction?: string;
}): Promise<PostContentResult | null> {
  return genJson<PostContentResult>(
    `You are a social media manager. ${PRODUCT_CONTEXT} Respect the target channel's length and tone. ${JSON_ONLY}`,
    `Write a ${input.channel} post.\nCampaign context: ${input.context}\n` +
      (input.locale && !input.locale.startsWith("en") ? `Write it in locale ${input.locale}.\n` : "") +
      (input.instruction ? `Focus: ${input.instruction}\n` : "") +
      `Return JSON exactly: {"content":"<the post copy, well laid out for the channel>"}`,
    { temperature: 0.8, maxTokens: 1200 },
  );
}

/** Reformat copy for a channel and return structure guidance (layout = format + notes). */
export async function layoutAssist(input: {
  channel: string; // a post channel, or "email" for the newsletter
  content: string;
}): Promise<LayoutResult | null> {
  const isEmail = input.channel === "email";
  return genJson<LayoutResult>(
    `You are a content layout specialist. ${JSON_ONLY}`,
    `Reformat the copy below for ${isEmail ? "an email newsletter" : `a ${input.channel} post`}, improving ONLY its ` +
      `visual structure and scannability${
        isEmail
          ? " (clear sections/headings, short paragraphs, a clear call-to-action, valid inline-styled email HTML)"
          : " (hook, body, CTA, line breaks, tasteful emoji/hashtag placement)"
      }.\n\n` +
      // Anti-truncation guardrail: the previous prompt ("lightly tighten") let the
      // model drop copy. It must now preserve every word and only add structure.
      `CRITICAL: Do NOT remove, summarize, shorten, paraphrase, or omit ANY of the copy. ` +
      `Every sentence, fact, link, number, and detail from the input MUST appear in your output. ` +
      `You may only re-order text into sections and add headings, spacing, and markup — never delete content. ` +
      `If in doubt, keep the text.\n\nCopy:\n${input.content}\n\n` +
      `Return JSON exactly: {"content":"<the fully reformatted copy${
        isEmail ? " as clean email HTML" : ""
      }, containing ALL of the original text>","notes":["<2-5 short layout/structure tips>"]}`,
    { temperature: 0.2, maxTokens: 6000 },
  );
}
// [SCOPE 065 / T010] END

// [SCOPE 066 / T003] BEGIN — FAQ default-seed generation
export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Infer a batch of sensible default product/methodology FAQs about wxKanban.
 * Returns drafts for SYSADMIN review (never published automatically). Fail-open:
 * any model error / missing key / unparseable output → null (logged), so the
 * caller saves nothing and the surface stays usable (FR-004).
 */
export async function generateFaqDefaults(
  count = 12,
): Promise<FaqItem[] | null> {
  const n = Math.min(Math.max(count, 1), 25);
  const result = await genJson<{ items: FaqItem[] }>(
    `You are a product educator for wxKanban writing its FAQ. ${PRODUCT_CONTEXT} ` +
      `Cover the things a new user actually asks: the six-phase lifecycle (Design → Implementation → ` +
      `QA Testing → Human Testing → Beta → Release), the spec-first / scope-first rule, what a Scope vs a ` +
      `Spec is, the orchestrator kit and VS Code Cockpit, how to start a project, billing/plans, and the ` +
      `consulting/engagement model. Answers should be concrete and encouraging, 2-4 sentences, no hype. ${JSON_ONLY}`,
    `Write ${n} frequently-asked questions and answers about using wxKanban.\n` +
      `Return JSON exactly: {"items":[{"question":"<the question>","answer":"<2-4 sentence answer>"}]}`,
    { temperature: 0.6, maxTokens: 3000 },
  );
  return result?.items ?? null;
}
// [SCOPE 066 / T003] END

// [SCOPE 100 / T010] BEGIN — markdown-safe translation (FR-007)
// MODIFIED-BY: T017 — optional `routing` param so a founder-chosen provider (FR-011)
// can drive the call; omitted preserves the env-default translationOpts() behavior.
// Deliberately NOT translateAll (:298): its prompt preserves only "tone and any HTML"
// and omits the line-break instruction its sibling translateText carries at :289-291.
// In markdown, line breaks ARE the formatting — blank lines separate paragraphs and
// leading # / - carry meaning. maxTokens is 2048: a chunk is capped at 3500 chars
// (chunker BIO_CHUNK_MAX_CHARS) ≈ ~1200 source tokens, and a 15-30%-longer
// translation still lands well under 2048, so nothing truncates. It was 4000, but
// max_tokens is *reserved* against the per-minute budget whether used or not, so
// the extra 2000 doubled every call's rate-limit cost for no benefit.
export async function translateMarkdownChunk(
  chunk: string,
  locale: string,
  language: string,
  routing: Pick<GenerateOptions, "provider" | "model"> = translationOpts(),
): Promise<string | null> {
  return genText(
    `You are a professional translator. Translate faithfully, preserving tone, any HTML ` +
      `tags, all Markdown syntax (headings, lists, emphasis, links, code fences), and the ` +
      `exact line-break/blank-line structure. Output ONLY the translation — no preamble, ` +
      `no code fences around the whole answer.`,
    `Translate the following Markdown into ${language} (${locale}), keeping every line break ` +
      `and all Markdown syntax intact:\n\n${chunk}`,
    { temperature: 0.3, maxTokens: 2048 },
    routing,
  );
}

/**
 * Translate a SHORT single-line title/heading. Deliberately NOT translateMarkdownChunk:
 * given a bare short line, the instruct model treats it as a document opening and
 * hallucinates a whole fake body — observed with llama-4-scout, a 53-char title came
 * back as a 1,600-char invented bio, overflowing the title varchar(255) column and
 * failing the DB insert. Three guards keep it to the line: a strict single-line
 * prompt, a small token budget so it physically cannot run on, and first-line
 * extraction + a hard 255-char cap before return.
 */
export async function translateTitle(
  title: string,
  locale: string,
  language: string,
  routing: Pick<GenerateOptions, "provider" | "model"> = translationOpts(),
): Promise<string | null> {
  if (!title.trim()) return null;
  const out = await genText(
    `You are a professional translator. Translate the single title the user gives into ` +
      `${language}. Output ONLY the translated title on ONE line — no body text, no ` +
      `explanation, no surrounding quotes, no extra lines.`,
    `Translate this title into ${language} (${locale}):\n\n${title}`,
    { temperature: 0.2, maxTokens: 120 },
    routing,
  );
  if (!out) return null;
  const firstLine = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  return firstLine.slice(0, 255) || null;
}
// [SCOPE 100 / T010] END

// [SCOPE 100 / T011] BEGIN — bio revision assistant (FR-009)
// MODIFIED-BY: T017 — optional `routing` param so the founder-chosen provider (FR-011)
// drives revision too; omitted preserves the marketingOpts() default inside genText.
/**
 * Revise the founder bio per a free-text instruction (e.g. "make this warmer"),
 * returning the COMPLETE replacement Markdown — never a diff or commentary.
 * Fail-open: any model error → null (logged). The caller (routes/marketingAi.ts
 * POST /bio) never applies this to the editor itself — the draft is handed back
 * for a client-side preview that the founder explicitly accepts or discards
 * (FR-009 / US7); this function has no way to mutate saved content.
 */
export async function bioRevise(
  current: string,
  instruction: string,
  routing?: Pick<GenerateOptions, "provider" | "model">,
): Promise<string | null> {
  return genText(
    `You are helping a software founder write their personal bio for a public web page. ` +
      `Return the COMPLETE revised bio in Markdown — not a diff, not commentary. ` +
      `Preserve Markdown structure and the first-person voice. Output only the Markdown.`,
    `Current bio:\n\n${current || "(empty — write a first draft)"}\n\nInstruction: ${instruction}`,
    { temperature: 0.7, maxTokens: 4000 },
    routing ?? marketingOpts(),
  );
}
// [SCOPE 100 / T011] END
