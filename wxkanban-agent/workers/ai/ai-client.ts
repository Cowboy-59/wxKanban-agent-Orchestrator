// AI client with primary + fallback provider routing (R6)

export interface AIProviderConfig {
	name: string;
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
}

export interface AIResponse {
	provider: string;
	content: string;
	confidence: number;
	tokenCount: { input: number; output: number };
	latencyMs: number;
	usedFallback: boolean;
}

const DEFAULT_PRIMARY: AIProviderConfig = {
	name: 'gemini',
	apiKey: process.env['GEMINI_API_KEY'] || '',
	model: process.env['GEMINI_MODEL'] || 'gemini-2.5-flash',
	endpoint: 'https://generativelanguage.googleapis.com/v1beta',
	timeoutMs: 30000,
	confidenceThreshold: 0.7,
};

const DEFAULT_FALLBACK: AIProviderConfig = {
	name: 'openai',
	apiKey: process.env['OPENAI_API_KEY'] || '',
	model: 'gpt-4',
	endpoint: 'https://api.openai.com/v1',
	timeoutMs: 30000,
	confidenceThreshold: 0.5,
};

export class AIClient {
	private primary: AIProviderConfig;
	private fallback: AIProviderConfig;

	constructor(primary?: Partial<AIProviderConfig>, fallback?: Partial<AIProviderConfig>) {
		this.primary = { ...DEFAULT_PRIMARY, ...primary };
		this.fallback = { ...DEFAULT_FALLBACK, ...fallback };
	}

	async call(request: AIRequest): Promise<AIResponse> {
		const startTime = Date.now();

		// Try primary provider
		try {
			const result = await this.callProvider(this.primary, request);
			if (result.confidence >= this.primary.confidenceThreshold) {
				return { ...result, usedFallback: false };
			}
			// Below threshold — try fallback
		} catch {
			// Primary failed — try fallback
		}

		// Try fallback provider
		try {
			const result = await this.callProvider(this.fallback, request);
			return { ...result, usedFallback: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Both AI providers failed. Last error: ${message}`);
		}
	}

	private async callProvider(
		provider: AIProviderConfig,
		request: AIRequest
	): Promise<Omit<AIResponse, 'usedFallback'>> {
		const startTime = Date.now();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);

		try {
			let response: Response;
			let content: string;
			let inputTokens = 0;
			let outputTokens = 0;

			if (provider.name === 'gemini') {
				response = await fetch(
					`${provider.endpoint}/models/${provider.model}:generateContent?key=${provider.apiKey}`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							contents: [{ parts: [{ text: request.prompt }] }],
							generationConfig: {
								maxOutputTokens: request.maxTokens || 2048,
								temperature: request.temperature ?? 0.3,
							},
						}),
						signal: controller.signal,
					}
				);
				const data = await response.json() as Record<string, unknown>;
				const candidates = data['candidates'] as Array<Record<string, unknown>> | undefined;
				const parts = (candidates?.[0]?.['content'] as Record<string, unknown>)?.['parts'] as Array<Record<string, unknown>> | undefined;
				content = (parts?.[0]?.['text'] as string) || '';
				const usage = data['usageMetadata'] as Record<string, number> | undefined;
				inputTokens = usage?.['promptTokenCount'] || 0;
				outputTokens = usage?.['candidatesTokenCount'] || 0;
			} else {
				// OpenAI-compatible endpoint
				response = await fetch(`${provider.endpoint}/chat/completions`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${provider.apiKey}`,
					},
					body: JSON.stringify({
						model: provider.model,
						messages: [
							...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
							{ role: 'user', content: request.prompt },
						],
						max_tokens: request.maxTokens || 2048,
						temperature: request.temperature ?? 0.3,
					}),
					signal: controller.signal,
				});
				const data = await response.json() as Record<string, unknown>;
				const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
				const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined;
				content = (message?.['content'] as string) || '';
				const usage = data['usage'] as Record<string, number> | undefined;
				inputTokens = usage?.['prompt_tokens'] || 0;
				outputTokens = usage?.['completion_tokens'] || 0;
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
