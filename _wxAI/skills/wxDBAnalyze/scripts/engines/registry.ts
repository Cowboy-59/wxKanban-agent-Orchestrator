import type { EngineAdapter, EngineId } from "../core/engine.js";
import { createRefusingAdapter } from "./stub.js";
import { postgresAdapter } from "./postgres/index.js";

// [SCOPE 121 / T014] BEGIN — Adapter registry
const IMPLEMENTED_ADAPTERS: Partial<Record<EngineId, EngineAdapter>> = {
  postgres: postgresAdapter,
};

/** Every engine resolves to an adapter; unimplemented ones resolve to a refusing stub. */
export function adapterFor(engine: EngineId): EngineAdapter {
  return IMPLEMENTED_ADAPTERS[engine] ?? createRefusingAdapter(engine);
}
// [SCOPE 121 / T014] END
