// [SCOPE 075 / T2-4] BEGIN — company-wide capability search + owned-surface indexing.
// Reads/writes the SCOPE-074 capabilityindex directly (app DB == hosted MCP DB) via raw
// parameterized SQL (pgvector cosine; drizzle 0.x has no vector type). Search is company-scoped
// via companyprojects.companyid. Indexing is the owned-surface producer (LLM-extracted, fail-open).
import { pool } from "~/db/client.js";
import { generateOnce } from "~/server/ai/llm-provider.js";
import { embed, toVectorLiteral } from "~/server/ai/embeddings.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("portfolio-capability");

export interface CapabilityMatch {
  owner: string;
  sourceRef: string;
  capabilityType: string;
  name: string;
  projectId: string;
  projectName: string;
  score: number;
}

export interface OwnedCapability {
  capabilityType: string;
  name: string;
  description: string;
}

const SEARCH_SYSTEM =
  "You answer whether a company already has a capability. Output ONLY a compact JSON object — no prose, no fences.";

const EXTRACT_SYSTEM =
  "You extract the capabilities a scope INTRODUCES (owns), for a reuse index. Output ONLY a JSON array — no prose, no fences.";

/** Company-wide semantic search over capabilityindex. Tenant-scoped via companyprojects.companyid. */
export async function searchCompanyCapabilities(
  companyId: string,
  queryText: string,
  opts: { topK?: number } = {},
): Promise<CapabilityMatch[]> {
  const topK = Math.min(Math.max(opts.topK ?? 10, 1), 50);
  const [qvec] = await embed([queryText]);
  const sql = `
    SELECT ci.owner, ci.sourceref, ci.capabilitytype, ci.name,
           cp.id AS projectid, cp.name AS projectname,
           1 - (ci.embedding <=> $1::vector) AS score
    FROM capabilityindex ci
    JOIN companyprojects cp ON cp.id = ci.projectid
    WHERE cp.companyid = $2
    ORDER BY ci.embedding <=> $1::vector
    LIMIT $3`;
  const { rows } = await pool.query(sql, [toVectorLiteral(qvec), companyId, topK]);
  type SearchRow = { owner: string; sourceref: string; capabilitytype: string; name: string; projectid: string; projectname: string; score: string };
  return (rows as SearchRow[]).map((r) => ({
    owner: r.owner,
    sourceRef: r.sourceref,
    capabilityType: r.capabilitytype,
    name: r.name,
    projectId: r.projectid,
    projectName: r.projectname,
    score: Number(r.score),
  }));
}

/** Optional one-line synthesis over the matches (fail-open → null). */
export async function synthesizeSearch(queryText: string, matches: CapabilityMatch[]): Promise<string | null> {
  if (matches.length === 0) return null;
  try {
    const list = matches.slice(0, 8).map((m) => `- ${m.name} (${m.owner} in ${m.projectName})`).join("\n");
    const raw = await generateOnce(
      `Question: ${queryText}\nMatches:\n${list}\n\nReturn JSON: {"answer":"<one sentence: does the company already have this, and where>"}`,
      { systemPrompt: SEARCH_SYSTEM, temperature: 0.2, maxTokens: 200 },
    );
    const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(json) as { answer?: string };
    return parsed.answer?.trim().slice(0, 500) ?? null;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "search synthesis failed (swallowed)");
    return null;
  }
}

/** LLM-extract the capabilities a scope introduces. Fail-open → []. */
export async function extractOwnedSurface(scopeContent: string): Promise<OwnedCapability[]> {
  try {
    const raw = await generateOnce(
      `Scope document (truncated):\n${scopeContent.slice(0, 8000)}\n\n` +
        `List the capabilities this scope INTRODUCES (creates/owns) — not ones it merely depends on. ` +
        `Return a JSON array, max 25: [{"capabilityType":"process|table|route|doctype|command|workflow","name":"<short>","description":"<one line of what it does>"}]`,
      { systemPrompt: EXTRACT_SYSTEM, temperature: 0.1, maxTokens: 1500 },
    );
    const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const arr = JSON.parse(json) as Array<Partial<OwnedCapability>>;
    return (Array.isArray(arr) ? arr : [])
      .filter((c): c is OwnedCapability => !!c && typeof c.name === "string" && typeof c.description === "string")
      .map((c) => ({
        capabilityType: typeof c.capabilityType === "string" ? c.capabilityType : "process",
        name: c.name.slice(0, 255),
        description: c.description.slice(0, 1000),
      }))
      .slice(0, 25);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "owned-surface extraction failed (swallowed)");
    return [];
  }
}

/**
 * Owned-surface producer: extract a scope's introduced capabilities and (re)index them into
 * capabilityindex (replace-by-source). Returns the count indexed. Fail-open per scope.
 */
export async function indexScopeFromContent(
  projectId: string,
  scopeNumber: number,
  scopeContent: string,
): Promise<number> {
  const caps = await extractOwnedSurface(scopeContent);
  const sourceRef = String(scopeNumber);
  const owner = `SCOPE-${String(scopeNumber).padStart(3, "0")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM capabilityindex WHERE projectid = $1 AND sourceref = $2", [projectId, sourceRef]);
    if (caps.length > 0) {
      const vectors = await embed(caps.map((c) => c.description));
      for (let i = 0; i < caps.length; i += 1) {
        const c = caps[i];
        await client.query(
          `INSERT INTO capabilityindex (projectid, sourcetype, sourceref, owner, capabilitytype, name, description, embedding)
           VALUES ($1, 'scope', $2, $3, $4, $5, $6, $7::vector)`,
          [projectId, sourceRef, owner, c.capabilityType, c.name, c.description, toVectorLiteral(vectors[i])],
        );
      }
    }
    await client.query("COMMIT");
    logger.info({ projectId, scope: scopeNumber, count: caps.length }, "owned-surface indexed");
    return caps.length;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.warn({ projectId, scope: scopeNumber, err: (err as Error).message }, "owned-surface indexing failed (swallowed)");
    return 0;
  } finally {
    client.release();
  }
}
// [SCOPE 075 / T2-4] END
