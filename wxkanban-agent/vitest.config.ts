import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// WorkflowEngine.dispatch runs the entitlement preflight against
		// <cwd>/.wxai/.entitlement — under vitest, the developer's real cache.
		// An expired one fails every dispatch test, and a cached token can make a
		// real network refresh. Tests that exercise the preflight pass `mode`
		// explicitly, which overrides this (SCOPE-095 FR-008).
		env: { WXKANBAN_ENTITLEMENT: 'off' },
	},
});
