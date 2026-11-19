// Vitest global setup. Pure-function unit tests import modules that transitively
// pull in src/db/connection.ts, whose config validates DATABASE_URL + API_KEY at
// import time. postgres-js connects lazily, so dummy values satisfy the import
// without ever opening a socket — the pure tests never run a query. Real env
// (set by the runner) is preserved via ??=, so integration tests are unaffected.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.API_KEY ??= 'test-key';
