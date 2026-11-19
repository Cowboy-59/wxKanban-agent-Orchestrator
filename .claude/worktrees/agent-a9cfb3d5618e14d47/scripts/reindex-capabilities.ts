/**
 * [SCOPE 099 / T007] Re-index capabilityindex onto the configured embeddings model.
 *
 *   npx tsx scripts/reindex-capabilities.ts            # DRY RUN (default, writes nothing)
 *   npx tsx scripts/reindex-capabilities.ts --apply    # writes, in ONE transaction
 *
 * WHY THIS IS MANDATORY, NOT HOUSEKEEPING
 * Vectors from different embedding models are not comparable — even at identical
 * width. `capabilityindex` is vector(768) and both gemini-embedding-001 and
 * BAAI/bge-base-en-v1.5 produce 768 numbers, so nothing errors: the rows insert, the
 * HNSW index builds, and every similarity search silently returns confident nonsense.
 * There is no failure signal. That is why a PARTIAL re-index is the one truly bad
 * outcome, and why this runs as a single transaction: all 3,893 rows move to the new
 * space, or none do and you stay consistently on the old one.
 *
 * BEFORE --apply, THE HOSTED MCP MUST BE SWITCHED TOO
 * mcp-server writes this same table (project.index_capabilities) using its OWN env
 * from the App Runner console. If it is still on gemini, it re-poisons the table with
 * old-space vectors the moment anyone indexes a scope. Set EMBEDDINGS_PROVIDER /
 * _BASE_URL / _MODEL / _API_KEY there first (SCOPE-099 T009). The deployed MCP already
 * understands `selfhosted` (SCOPE-074) and does not send `dimensions`, which is what
 * bge-base needs — so the env change alone is sufficient for correctness.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { embed, resolveAppEmbeddingsConfig, toVectorLiteral } from '../src/server/ai/embeddings.js';

const BATCH = 64;

interface Row {
  id: string;
  name: string;
  description: string;
}

// [SCOPE 099 / T007] BEGIN — Re-index the capability index onto a new embedding model
export async function reindexCapabilities(apply: boolean): Promise<void> {
  const cfg = resolveAppEmbeddingsConfig();
  // pg v8 treats sslmode=require as verify-full, which rejects RDS's chain; strip it
  // and set TLS explicitly (same approach as src/db/client.ts).
  const url = (process.env['DATABASE_URL'] ?? '').replace(/[?&]sslmode=[^&]*/g, '');
  if (!url) throw new Error('DATABASE_URL not configured');

  console.log(`mode      : ${apply ? 'APPLY (writes)' : 'DRY RUN (writes nothing)'}`);
  console.log(`provider  : ${cfg.provider} / ${cfg.model}`);
  console.log(`expecting : ${cfg.dimensions}-dim vectors\n`);

  if (cfg.provider === 'gemini') {
    throw new Error(
      'EMBEDDINGS_PROVIDER is still gemini — re-indexing onto the SAME model is a no-op. ' +
        'Point it at the new endpoint first.',
    );
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows } = await client.query<Row>(
      `SELECT id, name, description FROM capabilityindex ORDER BY createdat`,
    );
    console.log(`rows to re-embed: ${rows.length}`);
    if (rows.length === 0) return;

    // Prove the endpoint and width BEFORE opening a transaction — a config error
    // should cost nothing, not an aborted write.
    const probe = await embed([`${rows[0]!.name}. ${rows[0]!.description}`.slice(0, 8000)], cfg);
    const width = probe[0]?.length ?? 0;
    console.log(`probe     : ${width}-dim from ${cfg.model}`);
    if (width !== cfg.dimensions) {
      throw new Error(
        `Model returns ${width}-dim but capabilityindex is vector(${cfg.dimensions}). ` +
          `Choose a ${cfg.dimensions}-native model or migrate the column width.`,
      );
    }

    if (!apply) {
      const chars = rows.reduce((n, r) => n + r.name.length + r.description.length, 0);
      console.log(`\nDRY RUN — would re-embed ${rows.length} rows (~${Math.ceil(chars / 4)} tokens)`);
      console.log(`          in ${Math.ceil(rows.length / BATCH)} batches of ${BATCH}, one transaction.`);
      console.log('\nRe-run with --apply to write. Nothing was changed.');
      return;
    }

    await client.query('BEGIN');
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      // Same text shape the indexer embeds: name + description.
      const vectors = await embed(
        slice.map((r) => `${r.name}. ${r.description}`.slice(0, 8000)),
        cfg,
      );
      for (let j = 0; j < slice.length; j++) {
        await client.query(
          `UPDATE capabilityindex SET embedding = $1::vector, updatedat = now() WHERE id = $2`,
          [toVectorLiteral(vectors[j]!), slice[j]!.id],
        );
      }
      done += slice.length;
      process.stdout.write(`\r  re-embedded ${done}/${rows.length}`);
    }
    await client.query('COMMIT');
    console.log(`\n\nCOMMITTED — ${done} rows now in the ${cfg.model} vector space.`);
    console.log('Verify: run a project.search_capabilities for a capability you know exists.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('\nROLLED BACK — no rows changed. The index is still consistent.');
    throw err;
  } finally {
    await client.end();
  }
}
// [SCOPE 099 / T007] END

reindexCapabilities(process.argv.includes('--apply')).catch((e: unknown) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
