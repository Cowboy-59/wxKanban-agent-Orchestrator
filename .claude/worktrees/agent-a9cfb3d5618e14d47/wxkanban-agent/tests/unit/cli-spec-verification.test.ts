import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import {
	extractScopeNumber,
	findScopeDir,
	buildSpecVerification,
} from '../../apps/command-gateway/src/spec-verification';

describe('extractScopeNumber', () => {
	it('extracts scope from implement positional <NNN>/<Tnnn>', () => {
		expect(extractScopeNumber('implement', { _: ['028/T001'] })).toBe('028');
		expect(extractScopeNumber('implement', { _: ['026/T042'] })).toBe('026');
	});

	it('extracts scope from implement --target flag', () => {
		expect(extractScopeNumber('implement', { target: '028/T001' })).toBe('028');
	});

	it('returns undefined for implement without scope', () => {
		expect(extractScopeNumber('implement', {})).toBeUndefined();
		expect(extractScopeNumber('implement', { _: ['T001'] })).toBeUndefined();
	});

	it('extracts scope from --spec flag for any command', () => {
		expect(extractScopeNumber('createtesttasks', { spec: '028' })).toBe('028');
		expect(extractScopeNumber('runqa', { spec: '028-HostedMCPDeployment' })).toBe('028');
		expect(extractScopeNumber('runhuman', { specNumber: '019' })).toBe('019');
		expect(extractScopeNumber('prepareRelease', { scope: '028' })).toBe('028');
	});

	it('returns undefined when no scope information is provided', () => {
		expect(extractScopeNumber('runqa', {})).toBeUndefined();
		expect(extractScopeNumber('runqa', { spec: 'not-a-scope' })).toBeUndefined();
	});

	it('ignores non-string flag values', () => {
		expect(extractScopeNumber('runqa', { spec: 28 as unknown as string })).toBeUndefined();
		expect(extractScopeNumber('runqa', { spec: true as unknown as string })).toBeUndefined();
	});
});

describe('findScopeDir + buildSpecVerification', () => {
	let projectRoot: string;
	beforeEach(() => {
		projectRoot = mkdtempSync(resolve(tmpdir(), 'wxk-cli-verif-'));
		mkdirSync(resolve(projectRoot, 'specs'), { recursive: true });
	});
	afterEach(() => {
		rmSync(projectRoot, { recursive: true, force: true });
	});

	it('finds a fully-named scope directory by number prefix', () => {
		mkdirSync(resolve(projectRoot, 'specs', '028-HostedMCPDeployment'));
		const dir = findScopeDir(resolve(projectRoot, 'specs'), '028');
		expect(dir).toBe(resolve(projectRoot, 'specs', '028-HostedMCPDeployment'));
	});

	it('returns undefined when no scope directory matches', () => {
		expect(findScopeDir(resolve(projectRoot, 'specs'), '999')).toBeUndefined();
	});

	it('returns all-false verification when scope directory does not exist', () => {
		const v = buildSpecVerification('999', projectRoot);
		expect(v).toEqual({ specExists: false, tasksExist: false, documentsExist: false });
	});

	it('detects each artifact independently', () => {
		const scopeDir = resolve(projectRoot, 'specs', '028-HostedMCPDeployment');
		mkdirSync(scopeDir);
		writeFileSync(resolve(scopeDir, 'spec.md'), '# spec');
		writeFileSync(resolve(scopeDir, 'tasks.md'), '# tasks');
		// no plan.md
		const v = buildSpecVerification('028', projectRoot);
		expect(v).toEqual({ specExists: true, tasksExist: true, documentsExist: false });
	});

	it('returns all-true when all three artifacts are present', () => {
		const scopeDir = resolve(projectRoot, 'specs', '028-HostedMCPDeployment');
		mkdirSync(scopeDir);
		writeFileSync(resolve(scopeDir, 'spec.md'), '# spec');
		writeFileSync(resolve(scopeDir, 'tasks.md'), '# tasks');
		writeFileSync(resolve(scopeDir, 'plan.md'), '# plan');
		const v = buildSpecVerification('028', projectRoot);
		expect(v).toEqual({ specExists: true, tasksExist: true, documentsExist: true });
	});
});
