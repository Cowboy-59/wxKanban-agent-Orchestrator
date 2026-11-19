// Load .env for the test run, exactly as src/server/index.ts does.
//
// Without this, any test that imports a module which imports src/server/config.ts
// dies before its first assertion: config.ts calls process.exit(1) on missing
// DATABASE_URL / JWT_SECRET / ENCRYPTION_KEY, and vitest reports the whole file
// as "Failed Suite — process.exit unexpectedly called with 1" with no test names.
//
// That is why tests/integration/companyInvariants.test.ts and
// engagementPermissionIsolation.test.ts had been failing: not broken assertions,
// just no environment. Endpoint-level tests are impossible without this.
import "dotenv/config";
