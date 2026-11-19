// [SCOPE 080 / T006] Health-check gateway-port resolution (FR-004).
// Regression guard for the dogfooding defect (YappChat): the health check
// hardcoded :3003 instead of reading the per-project port the gateway records
// in .wxai/kit-runtime.json, producing a false failure (hard failure once
// gatewayRequired). These tests pin the resolve order:
//   explicit GATEWAY_HTTP_URL override -> kit-runtime.json port -> null.
// SCOPE-068 FR-009 replaced the legacy :3003 fallback with null ("no gateway
// running"): :3003 belongs to whichever project bound it (feedback ecacc0c6).
import { afterEach, describe, expect, it } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Import the kit health-check script directly. The script guards its probe
// behind an isMainModule check, so importing it here does NOT fire a network
// call — only the pure resolver helpers are exercised.
import {
  resolveGatewayUrl,
  readGatewayPort,
} from '../../scripts/orchestrator-health-check.mjs';

const tmpDirs: string[] = [];

async function makeRuntimeDir(contents: string | null): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wxk-gw-'));
  tmpDirs.push(dir);
  if (contents !== null) {
    await fsp.mkdir(path.join(dir, '.wxai'), { recursive: true });
    await fsp.writeFile(path.join(dir, '.wxai', 'kit-runtime.json'), contents, 'utf8');
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    await fsp.rm(d, { recursive: true, force: true });
  }
});

describe('resolveGatewayUrl (FR-004 resolve order)', () => {
  it('uses an explicit GATEWAY_HTTP_URL override over everything', () => {
    expect(resolveGatewayUrl('http://localhost:9999', 3865)).toBe('http://localhost:9999');
    // override wins even when no runtime port is known
    expect(resolveGatewayUrl('http://gw.internal:8080', null)).toBe('http://gw.internal:8080');
  });

  it('uses the live runtime port when there is no override', () => {
    expect(resolveGatewayUrl(undefined, 3865)).toBe('http://localhost:3865');
    expect(resolveGatewayUrl('', 4100)).toBe('http://localhost:4100');
  });

  it('returns null, never :3003, when neither is present (SCOPE-068 FR-009)', () => {
    expect(resolveGatewayUrl(undefined, null)).toBeNull();
    expect(resolveGatewayUrl('', undefined)).toBeNull();
  });
});

describe('readGatewayPort (kit-runtime.json contract)', () => {
  it('reads services.gateway.port from a non-3003 runtime file', async () => {
    const dir = await makeRuntimeDir(
      JSON.stringify({ services: { gateway: { port: 3865, pid: 1234 } } }),
    );
    expect(readGatewayPort(dir)).toBe(3865);
  });

  it('returns null when no runtime file is present (no gateway running)', async () => {
    const dir = await makeRuntimeDir(null);
    expect(readGatewayPort(dir)).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', async () => {
    const dir = await makeRuntimeDir('{ not valid json');
    expect(readGatewayPort(dir)).toBeNull();
  });

  it('returns null when the gateway port key is absent', async () => {
    const dir = await makeRuntimeDir(JSON.stringify({ services: {} }));
    expect(readGatewayPort(dir)).toBeNull();
  });

  it('end-to-end: a non-3003 runtime port resolves to that gateway URL', async () => {
    const dir = await makeRuntimeDir(
      JSON.stringify({ services: { gateway: { port: 3865 } } }),
    );
    expect(resolveGatewayUrl(undefined, readGatewayPort(dir))).toBe('http://localhost:3865');
  });
});
