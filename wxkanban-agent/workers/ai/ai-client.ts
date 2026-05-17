// AI client with primary + fallback provider routing.
// Spec 019 R6 + spec 025 FR-019: primary chosen from LLM_PROVIDER env
// (groq | gemini | anthropic), default groq. Fallback auto-selected from
// the next provider in preference order whose API key is populated, so a
// single key is sufficient to run. Fails closed when the primary's key is
// missing — never silently uses a different provider's key.

export type ProviderName = "groq" | "gemini" | "anthropic" | "openai";

export interface AIProviderConfig {
	name: ProviderName;
	apiKey: string;
	model: string;
	endpoint: string;
	timeoutMs: number;
	confidenceThreshold: number;
}

export interface AIRequest {
	prompt: string;
	systemPrompt?: string;
	maxTokens?: number;
	temperature?: number;
	// Spec 019 R7 AC 5 — request provider-native JSON-mode where supported.
	// Groq/OpenAI: response_format: { type: "json_object" }
	// Gemini:      generationConfig.responseMimeType: "application/json"
	// Anthropic:   no wire flag; Claude follows JSON instructions natively
	responseFormat?: "json";
}

export interface AIResponse {
	provider: string;
	content: string;
	confidence: number;
	tokenCount: { input: number; output: number };
	latencyMs: number;
	usedFallback: boolean;
}

const FALLBACK_PREFERENCE_ORDER: ProviderName[] = ["groq", "gemini", "anthropic"];

// Spec 019 R6 AC 9 — per-handler env-var override.
// If `handlerName` is supplied (e.g., "implement"), check
// `LLM_PROVIDER_<HANDLER>` (uppercased) before falling back to the global
// `LLM_PROVIDER`. This lets one deployment route conversational surfaces to
// a free model while routing code-emitting handlers to a paid one.
function readProviderName(handlerName?: string): ProviderName {
	const sources: string[] = [];
	if (handlerName) {
		sources.push(`LLM_PROVIDER_${handlerName.toUpperCase()}`);
	}
	sources.push("LLM_PROVIDER");
	for (const key of sources) {
		const raw = (process.env[key] || "").toLowerCase();
		if (raw === "groq" || raw === "gemini" || raw === "anthropic" || raw === "openai") {
			return raw;
		}
	}
	return "groq";
}

function buildProviderConfig(name: ProviderName): AIProviderConfig {
	switch (name) {
		case "groq":
			return {
				name,
				apiKey: process.env["GROQ_API_KEY"] || "",
				model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile",
				endpoint: "https://api.groq.com/openai/v1",
				timeoutMs: 30000,
				confidenceThreshold: 0.7,
			};
		case "gemini":
			return {
				name,
				apiKey: process.env["GEMINI_API_KEY"] || "",
				model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash",
				endpoint: "https://generativelanguage.googleapis.com/v1beta",
				timeoutMs: 30000,
				confidenceThreshold: 0.7,
			};
		case "anthropic":
			return {
				name,
				apiKey: process.env["ANTHROPIC_API_KEY"] || "",
				model: process.env["ANTHROPIC_MODEL"] || "claude-haiku-4-5-20251001",
				endpoint: "https://api.anthropic.com/v1",
				timeoutMs: 30000,
				confidenceThreshold: 0.7,
			};
		case "openai":
			return {
				name,
				apiKey: process.env["OPENAI_API_KEY"] || "",
				model: process.env["OPENAI_MODEL"] || "gpt-4o-mini",
				endpoint: "https://api.openai.com/v1",
				timeoutMs: 30000,
				confidenceThreshold: 0.5,
			};
	}
}

function envVarFor(provider: ProviderName): string {
	switch (provider) {
		case "groq":
			return "GROQ_API_KEY";
		case "gemini":
			return "GEMINI_API_KEY";
		case "anthropic":
			return "ANTHROPIC_API_KEY";
		case "openai":
			return "OPENAI_API_KEY";
	}
}

// AC 7 — pick the first provider OTHER than the primary that has a populated
// API key, following the documented preference order. Returns null if none.
function resolveFallback(primary: ProviderName): AIProviderConfig | null {
	for (const candidate of FALLBACK_PREFERENCE_ORDER) {
		if (candidate === primary) continue;
		const cfg = buildProviderConfig(candidate);
		if (cfg.apiKey) return cfg;
	}
	return null;
}

export class AIClient {
	private primary: AIProviderConfig;
	private fallback: AIProviderConfig | null;
	public readonly handlerName: string | undefined;

	constructor(
		primary?: Partial<AIProviderConfig>,
		fallback?: Partial<AIProviderConfig>,
		handlerName?: string,
	) {
		this.handlerName = handlerName;
		const primaryName = (primary?.name as ProviderName | undefined) ?? readProviderName(handlerName);
		this.primary = { ...buildProviderConfig(primaryName), ...primary };

		if (fallback) {
			const fallbackName = (fallback.name as ProviderName | undefined) ?? "openai";
			this.fallback = { ...buildProviderConfig(fallbackName), ...fallback };
		} else {
			this.fallback = resolveFallback(this.primary.name);
		}
	}

	async call(request: AIRequest): Promise<AIResponse> {
		// AC 6 — fail closed if primary's API key is missing. Don't silently
		// promote the fallback into the primary slot.
		if (!this.primary.apiKey) {
			throw new Error(
				`AI primary provider "${this.primary.name}" is not configured: set ${envVarFor(this.primary.name)} in the environment.`,
			);
		}

		let primaryFailure: string | null = null;
		try {
			const result = await this.callProvider(this.primary, request);
			if (result.confidence >= this.primary.confidenceThreshold) {
				return { ...result, usedFallback: false };
			}
			primaryFailure = `${this.primary.name} returned low-confidence content (length=${result.content.length}, confidence=${result.confidence})`;
		} catch (err) {
			primaryFailure = err instanceof Error ? err.message : String(err);
			if (!this.fallback) {
				throw err;
			}
		}

		if (!this.fallback) {
			throw new Error(
				`AI primary "${this.primary.name}" failed and no fallback configured. Primary error: ${primaryFailure}`,
			);
		}

		try {
			const result = await this.callProvider(this.fallback, request);
			return { ...result, usedFallback: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(
				`Both AI providers failed. Primary (${this.primary.name}): ${primaryFailure}. Fallback (${this.fallback.name}): ${message}`,
			);
		}
	}

	private async callProvider(
		provider: AIProviderConfig,
		request: AIRequest,
	): Promise<Omit<AIResponse, "usedFallback">> {
		const startTime = Date.now();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);

		try {
			let response: Response;
			let content: string;
			let inputTokens = 0;
			let outputTokens = 0;

			if (provider.name === "gemini") {
				response = await fetch(
					`${provider.endpoint}/models/${provider.model}:generateContent?key=${provider.apiKey}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							contents: [{ parts: [{ text: request.prompt }] }],
							...(request.systemPrompt
								? { systemInstruction: { parts: [{ text: request.systemPrompt }] } }
								: {}),
							generationConfig: {
								maxOutputTokens: request.maxTokens || 2048,
								temperature: request.temperature ?? 0.3,
								...(request.responseFormat === "json"
									? { responseMimeType: "application/json" }
									: {}),
							},
						}),
						signal: controller.signal,
					},
				);
				const raw = await response.text();
				if (!response.ok) {
					throw new Error(
						`Gemini API ${response.status} ${response.statusText} (model=${provider.model}): ${raw.slice(0, 200)}`,
					);
				}
				const data = parseJsonOrThrow(raw, provider.name, provider.model, response.status);
				const candidates = data["candidates"] as Array<Record<string, unknown>> | undefined;
				const parts = (candidates?.[0]?.["content"] as Record<string, unknown>)?.["parts"] as
					| Array<Record<string, unknown>>
					| undefined;
				content = (parts?.[0]?.["text"] as string) || "";
				const usage = data["usageMetadata"] as Record<string, number> | undefined;
				inputTokens = usage?.["promptTokenCount"] || 0;
				outputTokens = usage?.["candidatesTokenCount"] || 0;
			} else if (provider.name === "anthropic") {
				response = await fetch(`${provider.endpoint}/messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": provider.apiKey,
						"anthropic-version": "2023-06-01",
					},
					body: JSON.stringify({
						model: provider.model,
						max_tokens: request.maxTokens || 2048,
						temperature: request.temperature ?? 0.3,
						...(request.systemPrompt ? { system: request.systemPrompt } : {}),
						messages: [{ role: "user", content: request.prompt }],
					}),
					signal: controller.signal,
				});
				const raw = await response.text();
				if (!response.ok) {
					throw new Error(
						`Anthropic API ${response.status} ${response.statusText} (model=${provider.model}): ${raw.slice(0, 200)}`,
					);
				}
				const data = parseJsonOrThrow(raw, provider.name, provider.model, response.status);
				const blocks = data["content"] as Array<Record<string, unknown>> | undefined;
				content = (blocks?.find((b) => b["type"] === "text")?.["text"] as string) || "";
				const usage = data["usage"] as Record<string, number> | undefined;
				inputTokens = usage?.["input_tokens"] || 0;
				outputTokens = usage?.["output_tokens"] || 0;
			} else {
				// OpenAI-compatible Chat Completions (groq, openai)
				response = await fetch(`${provider.endpoint}/chat/completions`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${provider.apiKey}`,
					},
					body: JSON.stringify({
						model: provider.model,
						messages: [
							...(request.systemPrompt
								? [{ role: "system", content: request.systemPrompt }]
								: []),
							{ role: "user", content: request.prompt },
						],
						max_tokens: request.maxTokens || 2048,
						temperature: request.temperature ?? 0.3,
						...(request.responseFormat === "json"
							? { response_format: { type: "json_object" } }
							: {}),
					}),
					signal: controller.signal,
				});
				const raw = await response.text();
				if (!response.ok) {
					throw new Error(
						`${provider.name} API ${response.status} ${response.statusText} (model=${provider.model}): ${raw.slice(0, 200)}`,
					);
				}
				const data = parseJsonOrThrow(raw, provider.name, provider.model, response.status);
				const choices = data["choices"] as Array<Record<string, unknown>> | undefined;
				const message = choices?.[0]?.["message"] as Record<string, unknown> | undefined;
				content = (message?.["content"] as string) || "";
				const usage = data["usage"] as Record<string, number> | undefined;
				inputTokens = usage?.["prompt_tokens"] || 0;
				outputTokens = usage?.["completion_tokens"] || 0;
			}

			const latencyMs = Date.now() - startTime;
			return {
				provider: provider.name,
				content,
				confidence: content.length > 0 ? 0.85 : 0.0,
				tokenCount: { input: inputTokens, output: outputTokens },
				latencyMs,
			};
		} finally {
			clearTimeout(timeout);
		}
	}
}

// AC 8 — when the response body isn't valid JSON, throw an Error that names
// the provider, model, HTTP status, and the first 200 chars of the body.
// Replaces the opaque "Unexpected end of JSON input" diagnostic.
function parseJsonOrThrow(
	raw: string,
	provider: ProviderName,
	model: string,
	status: number,
): Record<string, unknown> {
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		throw new Error(
			`${provider} response is not valid JSON (status=${status}, model=${model}): ${raw.slice(0, 200) || "<empty body>"}`,
		);
	}
}
