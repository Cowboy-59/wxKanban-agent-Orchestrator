// [SCOPE 095 / T006] Unit tests for the Claude Code .mcp.json registration builder
// that KitProxyService injects into every kit download (FR-001). Covers the hardened
// shape, trailing-slash normalization, and merge-safety against an existing file.
import { describe, it, expect } from 'vitest';
import { buildMcpJsonDoc } from '../../src/server/services/mcpRegistration';

const BASE = 'https://mcp.wxperts.com';
const TOKEN = '9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0';

describe('buildMcpJsonDoc', () => {
  it('emits the hardened Streamable-HTTP entry with a literal bearer token', () => {
    const doc = buildMcpJsonDoc(BASE, TOKEN);
    const entry = doc.mcpServers.wxkanban as {
      type: string;
      url: string;
      headers: { Authorization: string };
    };
    expect(entry.type).toBe('http');
    expect(entry.url).toBe('https://mcp.wxperts.com/mcp');
    expect(entry.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('normalizes a trailing slash on the base URL (no double slash before /mcp)', () => {
    const doc = buildMcpJsonDoc('https://mcp.wxperts.com/', TOKEN);
    const entry = doc.mcpServers.wxkanban as { url: string };
    expect(entry.url).toBe('https://mcp.wxperts.com/mcp');
  });

  it('writes the token literally (no ${VAR} expansion placeholder)', () => {
    const doc = buildMcpJsonDoc(BASE, TOKEN);
    const serialized = JSON.stringify(doc);
    expect(serialized).toContain(TOKEN);
    expect(serialized).not.toContain('${');
  });

  it('is merge-safe: preserves other mcpServers entries and top-level keys', () => {
    const existing = {
      $schema: 'https://example.com/schema.json',
      mcpServers: { other: { type: 'stdio', command: 'foo' } },
    };
    const doc = buildMcpJsonDoc(BASE, TOKEN, existing) as typeof existing & {
      mcpServers: Record<string, unknown>;
    };
    expect(doc.$schema).toBe('https://example.com/schema.json');
    expect(doc.mcpServers.other).toEqual({ type: 'stdio', command: 'foo' });
    expect(doc.mcpServers.wxkanban).toBeDefined();
  });

  it('overwrites a stale wxkanban entry with the fresh one', () => {
    const existing = {
      mcpServers: { wxkanban: { type: 'sse', url: 'https://old/sse', headers: { Authorization: 'Bearer OLD' } } },
    };
    const doc = buildMcpJsonDoc(BASE, TOKEN, existing);
    const entry = doc.mcpServers.wxkanban as { type: string; url: string; headers: { Authorization: string } };
    expect(entry.type).toBe('http');
    expect(entry.url).toBe('https://mcp.wxperts.com/mcp');
    expect(entry.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('tolerates a non-object existing value (treats it as empty)', () => {
    const doc = buildMcpJsonDoc(BASE, TOKEN, 'garbage');
    expect(doc.mcpServers.wxkanban).toBeDefined();
  });
});
