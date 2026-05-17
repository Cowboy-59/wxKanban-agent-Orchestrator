// buildscope handler — Spec 019 R6a.
//
// All CLI / MCP dispatch for `buildscope` routes through
// `workers/ai/buildscope-worker.ts` → HTTP call to the MCP tool
// `project.buildscope`. The user's editor AI drives the BA interview in
// their VS Code chat; the MCP tool writes specs/Project-Scope/NNN-<slug>.md
// with validation, audit, and the section-by-section approval contract.
//
// An earlier in-process `handleBuildScopeInteractive` lived in this file
// with a stub `promptUser` and templated draft generation. It had zero
// callers and produced misleading-looking output (stub defaults masquerading
// as real BA-interview content). It was removed on 2026-05-15 alongside
// the wider Spec 019 R6a refactor so that no developer ever stumbles into
// the dead path again.
//
// If you need to extend buildscope's behaviour, edit:
//   - the MCP tool implementation in `mcp-server/src/server.ts`
//     (the `project.buildscope` case), or
//   - the worker shim in `wxkanban-agent/workers/ai/buildscope-worker.ts`
//     (request shaping, error handling, response mapping).

export {}; // keep this a module
