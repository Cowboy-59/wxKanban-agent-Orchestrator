/**
 * Spec 025 FR-013 / FR-014 — client SSE consumer for the paste-analyze and
 * import endpoints. Parses the shared event contract
 * (progress / chunk / done / heartbeat / error) and dispatches to handlers.
 *
 * Returns a promise that resolves when the stream ends and an abort() to cancel.
 */
export interface AnalyzeStreamHandlers {
  onProgress?: (current: number, total: number) => void;
  onDelta?: (delta: string) => void;
  onDone?: (messageId: string) => void;
  onError?: (message: string) => void;
}

export interface AnalyzeStreamResult {
  /** HTTP status when the request failed before streaming (e.g. 413 handoff). */
  httpError?: { status: number; body: Record<string, unknown> };
}

export function streamAnalyze(
  url: string,
  body: Record<string, unknown>,
  handlers: AnalyzeStreamHandlers,
): { promise: Promise<AnalyzeStreamResult>; abort: () => void } {
  const ctrl = new AbortController();

  const promise = (async (): Promise<AnalyzeStreamResult> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    // Non-SSE error responses (validation, 413 handoff, 422 bug-report) come
    // back as JSON — surface them to the caller without trying to parse a stream.
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok && !contentType.includes('text/event-stream')) {
      const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      handlers.onError?.(typeof errBody.error === 'string' ? errBody.error : `Request failed (${res.status})`);
      return { httpError: { status: res.status, body: errBody } };
    }
    if (!res.body) {
      handlers.onError?.('No response stream.');
      return {};
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let sepIdx;
      while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sepIdx);
        buf = buf.slice(sepIdx + 2);
        let eventName = 'message';
        let dataLine = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7);
          else if (line.startsWith('data: ')) dataLine = line.slice(6);
        }
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine) as {
            delta?: string;
            error?: string;
            current?: number;
            total?: number;
            messageId?: string;
          };
          if (eventName === 'progress' && typeof payload.current === 'number') {
            handlers.onProgress?.(payload.current, payload.total ?? 1);
          } else if (eventName === 'chunk' && payload.delta) {
            handlers.onDelta?.(payload.delta);
          } else if (eventName === 'done') {
            handlers.onDone?.(payload.messageId ?? '');
          } else if (eventName === 'error' && payload.error) {
            handlers.onError?.(payload.error);
          }
        } catch {
          // ignore malformed line
        }
      }
    }
    return {};
  })();

  return { promise, abort: () => ctrl.abort() };
}
