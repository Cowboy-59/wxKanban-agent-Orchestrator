// CLI-side spec verification builder (BUG-11 fix).
// Spec-gated commands require SpecVerification in DispatchOptions; without it,
// evaluateSpecFirst hard-blocks every call. The orchestrator handlers read
// spec artifacts from disk via loadSpecBundle, so disk presence is the right
// signal for the gate. See specs/019/bug-reports/2026-05-14-cli-spec-verification.md.
import * as fs from 'fs';
import * as path from 'path';
// Spec 030 — SpecVerification re-exported from the cli-adapter.
import { SpecVerification } from '../../../core/policy/adapters/cli-adapter';

const SCOPE_NUMBER = /^(\d{3})(?:[/-].*)?$/;

export function extractScopeNumber(
	command: string,
	rawOptions: Record<string, unknown>,
): string | undefined {
	if (command === 'implement') {
		const positional = (rawOptions['_'] as string[] | undefined)?.[0];
		const target = (rawOptions['target'] as string | undefined) ?? positional;
		if (target) {
			const m = target.match(SCOPE_NUMBER);
			if (m) return m[1];
		}
	}
	for (const key of ['spec', 'specNumber', 'specnumber', 'scope', 'scopeNumber']) {
		const v = rawOptions[key];
		if (typeof v === 'string') {
			const m = v.match(SCOPE_NUMBER);
			if (m) return m[1];
		}
	}
	return undefined;
}

export function findScopeDir(specsRoot: string, scopeNumber: string): string | undefined {
	if (!fs.existsSync(specsRoot)) return undefined;
	const entries = fs.readdirSync(specsRoot, { withFileTypes: true });
	const match = entries.find(
		(e) => e.isDirectory() && (e.name === scopeNumber || e.name.startsWith(`${scopeNumber}-`)),
	);
	return match ? path.resolve(specsRoot, match.name) : undefined;
}

export function buildSpecVerification(
	scopeNumber: string,
	projectRoot: string,
	specsSubdir = 'specs',
): SpecVerification {
	const specsRoot = path.resolve(projectRoot, specsSubdir);
	const scopeDir = findScopeDir(specsRoot, scopeNumber);
	if (!scopeDir) {
		return { specExists: false, tasksExist: false, documentsExist: false };
	}
	return {
		specExists: fs.existsSync(path.resolve(scopeDir, 'spec.md')),
		tasksExist: fs.existsSync(path.resolve(scopeDir, 'tasks.md')),
		documentsExist: fs.existsSync(path.resolve(scopeDir, 'plan.md')),
	};
}
