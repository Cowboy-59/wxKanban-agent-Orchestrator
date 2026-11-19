import type { DimensionId } from "../core/finding.js";
import type {
  AdditiveRule,
  DbConnection,
  EngineAdapter,
  EngineId,
  RawDimensionData,
  SupportLevel,
} from "../core/engine.js";

// [SCOPE 121 / T003] BEGIN — Refusing adapter for unimplemented engines
export class AdapterNotImplementedError extends Error {
  readonly engine: EngineId;

  constructor(engine: EngineId) {
    super(
      `the ${engine} adapter is not implemented — wxDBAnalyze Phase 1 ships ` +
        "PostgreSQL only. Nothing was read and nothing was written.",
    );
    this.name = "AdapterNotImplementedError";
    this.engine = engine;
  }
}

/**
 * A stub that REFUSES rather than one that returns empty results.
 *
 * An adapter returning zero findings is indistinguishable from a clean
 * database, which would report a customer's unexamined schema as healthy.
 * Refusing is the only honest behaviour for an engine we have not built.
 */
export function createRefusingAdapter(engine: EngineId): EngineAdapter {
  const refuse = (): never => {
    throw new AdapterNotImplementedError(engine);
  };

  return {
    engine,
    supports(_dimension: DimensionId): SupportLevel {
      return "not-implemented";
    },
    async connect(_url: string): Promise<DbConnection> {
      return refuse();
    },
    async collect(
      _dimension: DimensionId,
      _connection: DbConnection,
    ): Promise<RawDimensionData> {
      return refuse();
    },
    additiveWhitelist(): AdditiveRule[] {
      return [];
    },
  };
}
// [SCOPE 121 / T003] END
