import type { CockpitSummary, MyFeedbackItem } from '../types.js';

// Thin MCP HTTP client for the cockpit. Deliberately NOT reusing
// wxkanban-agent/core/http/mcp-client.ts:
//   - cross-package CommonJS import into the bundled extension is awkward, and
//   - that client enforces a stale `wxk_(live|test)_<64hex>` token regex that
//     rejects the real base64url tokens KitEncryptionService.generateApiToken
//     emits (recorded as a kit finding).
// Wire protocol: POST {baseUrl}/call {tool,args} + Bearer; the response body is
// the MCP envelope {content:[{type,text}]} whose text is the tool's JSON.

// [SCOPE 042 / T014] BEGIN — McpClientError
export class McpClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'McpClientError';
  }
}
// [SCOPE 042 / T014] END

// [SCOPE 042 / T014] BEGIN — CockpitMcpClient (POST /call, bearer, 429 retry, envelope unwrap)
export class CockpitMcpClient {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
    this.base = cfg.baseUrl.replace(/\/+$/, '');
    this.token = cfg.token;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async callTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.base}/call`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
    const body = JSON.stringify({ tool, args });

    let res = await this.fetchImpl(url, { method: 'POST', headers, body });
    if (res.status === 429) {
      const waitMs = (Number.parseInt(res.headers.get('Retry-After') ?? '1', 10) || 1) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      res = await this.fetchImpl(url, { method: 'POST', headers, body });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new McpClientError(`MCP ${tool} failed: HTTP ${res.status} ${text.slice(0, 200)}`, res.status);
    }
    const wire = (await res.json().catch(() => undefined)) as { content?: Array<{ text?: string }> } | undefined;
    const text = wire?.content?.[0]?.text;
    if (typeof text !== 'string') {
      throw new McpClientError(`MCP ${tool}: unexpected response shape`, res.status);
    }
    return JSON.parse(text) as T;
  }

  cockpitSummary(projectId: string): Promise<CockpitSummary> {
    return this.callTool<CockpitSummary>('project.cockpit_summary', { projectid: projectId });
  }

  // [SCOPE 043 / T010] the submitter's own feedback + status (for the cockpit section)
  async listMyFeedback(projectId: string): Promise<MyFeedbackItem[]> {
    const res = await this.callTool<{ items: MyFeedbackItem[] }>('project.list_my_feedback', {
      projectId,
    });
    return res.items ?? [];
  }
}
// [SCOPE 042 / T014] END
