// SCOPE-123 T014 — structural regression guards.
//
// These assert on SOURCE, not behaviour, on purpose. The project-level gate was
// the original design and the coupling is subtle: a later edit that re-imports
// resolveCurrentPhase into a gate would pass every behavioural test that does
// not happen to exercise that path. Reading the files closes that door.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const KIT = resolve(__dirname, '../../..');

function read(rel: string): string {
	return readFileSync(join(KIT, rel), 'utf-8');
}

// Strip line and block comments so a comment that MENTIONS a name is not a use.
function code(rel: string): string {
	return read(rel)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const GATE_PATHS = [
	'core/policy/policy.ts',
	'core/policy/capabilities.ts',
	'core/policy/adapters/cli-adapter.ts',
	'core/policy/adapters/mcp-adapter.ts',
	'core/orchestrator/workflow-engine.ts',
	'apps/command-gateway/src/cli.ts',
	'apps/command-gateway/src/http.ts',
];

describe('SCOPE-123 FR-001 / FR-006 — no gate path reads a project stage', () => {
	for (const rel of GATE_PATHS) {
		it(`${rel} never calls resolveCurrentPhase`, () => {
			expect(code(rel)).not.toMatch(/\bresolveCurrentPhase\b/);
		});
		it(`${rel} never queries projectphases`, () => {
			expect(code(rel)).not.toMatch(/\bprojectphases\b/);
		});
	}

	it('the workflow engine gates on context.scope, never context.lifecycleStage', () => {
		const engine = code('core/orchestrator/workflow-engine.ts');
		expect(engine).not.toMatch(/context\.lifecycleStage/);
		expect(engine).toMatch(/context\.scope/);
	});

	it('the CLI never falls back to .wxai/project.json for a scoped command', () => {
		const cli = code('apps/command-gateway/src/cli.ts');
		const block = cli.slice(cli.indexOf("getCommandScoping(command) === 'scoped'"));
		expect(block.slice(0, 1500)).not.toMatch(/lifecycleStage/);
	});
});

describe('SCOPE-123 FR-003 / T006 — canTransition is never dead code again', () => {
	it('has runtime callers outside its own module and tests', () => {
		const callers: string[] = [];
		const walk = (dir: string): void => {
			for (const entry of readdirSync(join(KIT, dir), { withFileTypes: true })) {
				const rel = `${dir}/${entry.name}`;
				if (entry.isDirectory()) {
					if (entry.name === 'node_modules' || entry.name === 'dist') continue;
					walk(rel);
				} else if (entry.name.endsWith('.ts') && rel !== 'core/orchestrator/transitions.ts') {
					if (/\bcanTransition\s*\(/.test(code(rel))) callers.push(rel);
				}
			}
		};
		walk('core');
		expect(callers).toEqual(expect.arrayContaining(['core/stage/store.ts', 'core/stage/advance.ts']));
	});
});

describe('SCOPE-123 FR-005 — the byte-identical unknown-command rejection is gone', () => {
	it('no adapter phrases an unknown command as a stage violation', () => {
		const adapter = code('core/policy/adapters/cli-adapter.ts');
		expect(adapter).not.toMatch(/is not permitted in the/);
	});
});
