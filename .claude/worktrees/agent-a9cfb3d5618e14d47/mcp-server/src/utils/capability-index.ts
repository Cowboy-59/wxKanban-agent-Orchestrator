// [SCOPE 074 / T003] BEGIN — System Capability Index: embed / upsert-by-source / cosine search.
// Server-side, DB-only. Tenant-scoped by projectId (callers pass the authenticated scope's
// projectId). Vector ops use raw parameterized SQL because drizzle 0.30 has no vector type.
// Semantic search is DISCOVERY ONLY — results are ranked candidates, never a written artifact.
import { pool } from '../db/connection.js';
import { embed, resolveEmbeddingsConfig } from './embeddings-provider.js';
import logger from './logger.js';

export type SourceType = 'scope' | 'app' | 'code';
export type CapabilityType = 'process' | 'table' | 'route' | 'doctype' | 'command' | 'workflow';

export interface CapabilityInput {
  owner: string;
  capabilityType: CapabilityType;
  name: string;
  description: string;
}

export interface CapabilityMatch {
  id: string;
  owner: string;
  sourceRef: string;
  sourceType: SourceType;
  capabilityType: CapabilityType;
  name: string;
  score: number; // cosine similarity in [0,1] (1 = identical)
}

export interface SearchOptions {
  topK?: number;
  sourceType?: SourceType;
  capabilityType?: CapabilityType;
}

/** pgvector text literal for a number[] — exported for unit testing. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Replace-by-source: delete a (projectId, sourceRef) unit's prior rows and insert the
 * current capability set, embedding each description. Idempotent for unchanged input
 * (same rows in, same rows out). Returns the number of rows indexed.
 */
export async function indexCapabilities(
  projectId: string,
  sourceRef: string,
  sourceType: SourceType,
  caps: CapabilityInput[],
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM capabilityindex WHERE projectid = $1 AND sourceref = $2', [projectId, sourceRef]);

    if (caps.length > 0) {
      const vectors = await embed(caps.map((c) => c.description));
      for (let i = 0; i < caps.length; i += 1) {
        const c = caps[i];
        await client.query(
          `INSERT INTO capabilityindex
             (projectid, sourcetype, sourceref, owner, capabilitytype, name, description, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
          [projectId, sourceType, sourceRef, c.owner, c.capabilityType, c.name, c.description, toVectorLiteral(vectors[i])],
        );
      }
    }

    await client.query('COMMIT');
    logger.info('capability_index.indexed', { projectId, sourceRef, sourceType, count: caps.length });
    return caps.length;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('capability_index.index.failed', err as Error, { projectId, sourceRef });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Semantic similarity search within one project. Returns ranked candidates (owner + score),
 * tenant-scoped — callers MUST pass the authenticated scope's projectId.
 */
export async function searchCapabilities(
  projectId: string,
  queryText: string,
  opts: SearchOptions = {},
): Promise<CapabilityMatch[]> {
  const topK = Math.min(Math.max(opts.topK ?? 10, 1), 100);
  const [qvec] = await embed([queryText], resolveEmbeddingsConfig());
  const params: unknown[] = [toVectorLiteral(qvec), projectId];
  let where = 'projectid = $2';
  if (opts.sourceType) {
    params.push(opts.sourceType);
    where += ` AND sourcetype = $${params.length}`;
  }
  if (opts.capabilityType) {
    params.push(opts.capabilityType);
    where += ` AND capabilitytype = $${params.length}`;
  }
  params.push(topK);
  const limitIdx = params.length;

  const sql = `
    SELECT id, owner, sourceref, sourcetype, capabilitytype, name,
           1 - (embedding <=> $1::vector) AS score
    FROM capabilityindex
    WHERE ${where}
    ORDER BY embedding <=> $1::vector
    LIMIT $${limitIdx}`;

  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({
    id: r.id,
    owner: r.owner,
    sourceRef: r.sourceref,
    sourceType: r.sourcetype,
    capabilityType: r.capabilitytype,
    name: r.name,
    score: Number(r.score),
  }));
}
// [SCOPE 074 / T003] END
