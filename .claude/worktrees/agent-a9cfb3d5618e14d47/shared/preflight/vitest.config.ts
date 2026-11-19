// [SCOPE 124 / T013] BEGIN — make this package's own tests runnable
// `shared/preflight/tests/preflight.test.ts` has existed since spec 029 and could not be run from
// anywhere: the repo-root config includes only `tests/**`, so it never picked these up, and running
// vitest inside this package inherited that config and died resolving `tests/setup.env.ts` against
// the wrong root. 29 assertions over the rules that gate every create_specs call, silently unrun.
//
// Found while sweeping preflight for FR-007. No env setup is needed here — this package is pure
// functions with no config, no database and no server.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/'],
  },
});
// [SCOPE 124 / T013] END
