import type { Options, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

// [SCOPE 102 / T003] BEGIN — Agent SDK loader (contained ESM shim for a CommonJS kit)
// @anthropic-ai/claude-agent-sdk is ESM-only, but the kit is CommonJS. TS with
// module:commonjs would transpile a normal dynamic import() into require(), which
// fails for an ESM package. A Function-built import keeps a real runtime `import()`
// (the specifier lives in a string, so TS never rewrites it), loading the ESM SDK
// correctly. Types come from `import type` above (erased at compile), so nothing
// here pulls the ESM package in via require. This is the ONLY place the SDK is
// loaded; everything else stays plain CommonJS.

/** The one SDK entry the bridge needs: query({ prompt, options }) -> Query. */
export type QueryFn = (params: { prompt: AsyncIterable<SDKUserMessage> | string; options?: Options }) => Query;

export interface AgentSdk {
  query: QueryFn;
}

let cached: Promise<AgentSdk> | undefined;

export function loadAgentSdk(): Promise<AgentSdk> {
  if (!cached) {
    const importEsm = new Function("specifier", "return import(specifier);") as (
      specifier: string,
    ) => Promise<AgentSdk>;
    cached = importEsm("@anthropic-ai/claude-agent-sdk");
  }
  return cached;
}
// [SCOPE 102 / T003] END
