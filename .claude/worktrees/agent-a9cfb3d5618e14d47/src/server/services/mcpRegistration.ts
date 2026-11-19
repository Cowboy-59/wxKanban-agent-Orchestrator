// [SCOPE 095 / T001] BEGIN — Claude Code .mcp.json registration builder.
// Pure and DB-free so KitProxyService can use it at download time AND it can be
// unit-tested without the database/filesystem. Emits the hardened Streamable-HTTP
// form with a LITERAL bearer token: Claude Code reads project MCP servers from
// `.mcp.json` at the workspace root and does NOT expand `${VAR}` from `.env`, so a
// literal token is required (and no `.claude/settings.local.json` duplication is
// needed). Mirrors the orchestrator's scripts/init.mjs::writeClaudeMcpRegistration.

export interface McpServerEntry {
  type: 'http';
  url: string;
  headers: { Authorization: string };
}

export interface McpJsonDoc {
  mcpServers: Record<string, unknown>;
}

/**
 * Build the `.mcp.json` document that registers the hosted wxKanban MCP with
 * Claude Code. Merge-safe: preserves any other top-level keys and any other
 * `mcpServers` entries already present in `existing`.
 *
 * @param mcpBaseUrl hosted MCP base URL (trailing slashes tolerated)
 * @param apiToken   the project API token, written literally into the header
 * @param existing   a previously-parsed `.mcp.json` (or undefined for a fresh file)
 */
export function buildMcpJsonDoc(
  mcpBaseUrl: string,
  apiToken: string,
  existing?: unknown
): McpJsonDoc {
  const doc: Record<string, unknown> =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
  const servers =
    doc.mcpServers && typeof doc.mcpServers === 'object'
      ? { ...(doc.mcpServers as Record<string, unknown>) }
      : {};
  const entry: McpServerEntry = {
    type: 'http',
    url: `${mcpBaseUrl.replace(/\/+$/, '')}/mcp`,
    headers: { Authorization: `Bearer ${apiToken}` },
  };
  servers.wxkanban = entry;
  return { ...doc, mcpServers: servers };
}
// [SCOPE 095 / T001] END
