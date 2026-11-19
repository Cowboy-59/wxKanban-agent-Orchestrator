// [SCOPE 102 / T014] BEGIN — child session env: never inherit the Anthropic API key (FR-013)
/**
 * The headless CLI the bridge spawns must run on the operator's subscription, not a metered
 * API key. `ANTHROPIC_API_KEY` is stripped from the child environment unless
 * `WXKANBAN_REMOTE_USE_API_KEY=1` is set deliberately — stripped here, at the point the child
 * env is built, so it holds no matter what the parent shell or the Windows user environment
 * carries.
 */
export type ChildBillingPath = "subscription" | "api_key";

export interface ChildEnvResult {
  env: NodeJS.ProcessEnv;
  billingPath: ChildBillingPath;
}

export function buildChildEnv(extra: Record<string, string>): ChildEnvResult {
  const useApiKey = process.env["WXKANBAN_REMOTE_USE_API_KEY"] === "1";
  const env = { ...process.env, ...extra };
  if (!useApiKey) {
    delete env["ANTHROPIC_API_KEY"];
  }
  return { env, billingPath: useApiKey ? "api_key" : "subscription" };
}
// [SCOPE 102 / T014] END
