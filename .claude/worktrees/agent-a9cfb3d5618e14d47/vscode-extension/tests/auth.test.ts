/**
 * Spec 042 / T013 — token bootstrap precedence.
 *
 * The cockpit seeds SecretStorage from the kit's own token locations on first
 * run. bootstrapTokenFromFiles is the pure file-reading half (no SecretStorage),
 * so its precedence is unit-testable: .wxai/project.json kit.apiToken, then
 * .env WXKANBAN_API_TOKEN, then legacy .wxkanban-project.json apiToken.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bootstrapTokenFromFiles } from '../src/services/auth';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wxk-auth-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeWxai(token: string): void {
  mkdirSync(join(root, '.wxai'), { recursive: true });
  writeFileSync(join(root, '.wxai', 'project.json'), JSON.stringify({ kit: { apiToken: token } }));
}
function writeEnv(token: string): void {
  writeFileSync(join(root, '.env'), `WXKANBAN_MCP_BASE_URL=https://mcp.wxperts.com\nWXKANBAN_API_TOKEN=${token}\n`);
}
function writeLegacy(token: string): void {
  writeFileSync(join(root, '.wxkanban-project.json'), JSON.stringify({ apiToken: token }));
}

describe('bootstrapTokenFromFiles', () => {
  it('prefers .wxai/project.json kit.apiToken above all', () => {
    writeWxai('from-wxai');
    writeEnv('from-env');
    writeLegacy('from-legacy');
    expect(bootstrapTokenFromFiles(root)).toBe('from-wxai');
  });

  it('falls back to .env WXKANBAN_API_TOKEN when no kit.apiToken', () => {
    writeEnv('from-env');
    writeLegacy('from-legacy');
    expect(bootstrapTokenFromFiles(root)).toBe('from-env');
  });

  it('strips surrounding quotes on the .env value', () => {
    writeFileSync(join(root, '.env'), `WXKANBAN_API_TOKEN="quoted-token"\n`);
    expect(bootstrapTokenFromFiles(root)).toBe('quoted-token');
  });

  it('falls back to legacy .wxkanban-project.json apiToken last', () => {
    writeLegacy('from-legacy');
    expect(bootstrapTokenFromFiles(root)).toBe('from-legacy');
  });

  it('returns null when no token source exists', () => {
    expect(bootstrapTokenFromFiles(root)).toBeNull();
  });
});
