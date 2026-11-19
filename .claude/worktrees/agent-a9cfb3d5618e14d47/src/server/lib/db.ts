/**
 * DEPRECATED — thin alias over the single shared database client.
 *
 * New code should import `~/db/client.js` directly. This module exists only so
 * that older import sites (and the unit-test mocks that target this path) keep
 * resolving.
 *
 * History: this file used to construct a SECOND pg pool, configured with
 * `ssl: { rejectUnauthorized: true }` whenever NODE_ENV === 'production'. RDS
 * presents a certificate chain rooted at the self-signed
 * "Amazon RDS <region> Root CA", which is not in Node's default trust store,
 * and no `ca` bundle was supplied — so every connection opened by that pool
 * failed with SELF_SIGNED_CERT_IN_CHAIN and every request routed through it
 * returned a 500. That is what fired the `wxkanban-apprunner-5xx` alarm on
 * 2026-08-27, when one user's timer widget took 11 consecutive failures.
 *
 * The same fault was diagnosed once before and worked around by repointing a
 * single route (see the comment in `routes/invitations.ts`); the pool itself
 * was left in place and six more modules stayed on it. Aliasing rather than
 * re-creating the pool guarantees there is exactly one pool with one TLS
 * policy, so the trap cannot be re-entered.
 */
import { db, pool } from '~/db/client.js';
import { logger } from './logger.js';

export { db, pool };

/**
 * Verify the shared pool can reach the database.
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT NOW()');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    return false;
  }
}
