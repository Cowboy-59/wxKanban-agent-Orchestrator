# MCP Project Hub

MCP (Model Context Protocol) server for wxKanban project management integration. This server exposes project-management workflows (events, docs, tasks) backed by the existing Postgres schema.

## Overview

The MCP Project Hub provides a standardized interface for AI agents and editors (VS Code, CLI, etc.) to interact with wxKanban project data through MCP tools, never with raw SQL or ad-hoc HTTP.

## Features

- **Event Capture**: Normalize and store events from any source (chat, commits, meetings)
- **Document Management**: Create and update project documents
- **Task Management**: Create tasks and update their status
- **Bidirectional Linking**: Link documents to tasks and vice versa
- **Project Overview**: List open items, timeline, and summaries

## Tools

| Tool | Short Command | Description | Required Role |
|------|---------------|-------------|---------------|
| `project.capture_event` | `--dbpush` | Capture a project event | read_only+ |
| `project.upsert_document` | `--upsert` | Create or update a document | editor+ |
| `project.create_task` | `--createtask` | Create a new task | editor+ |
| `project.update_task_status` | `--updatestatus` | Update task status | editor+ |
| `project.link_doc_to_task` | `--link` | Link document to task | editor+ |
| `project.list_open_items` | `--list` | List open tasks, docs, events | read_only+ |

### Command Alias Examples

- `project.create_specs` (`--createspecs`) - Full spec workflow with strict scope-quality preflight
- `project.buildscope` (`--buildscope`) - Guided-first scope drafting
- `project.implement` (`--implement`) - Execute implementation workflow
- `project.help` (`--help`) - Show all tools and aliases

Use `project.help` to see the complete command and alias matrix.

`project.buildscope` now defaults to guided mode: when critical scope decisions are missing, it returns clarification questions instead of writing a placeholder scope file. Use `quick: true` only when you explicitly want an immediate draft that may still fail `project.validatescope` and `project.create_specs` preflight.

## Installation

```bash
cd mcp-server
npm install
```

## Configuration

Copy `env.example` to `.env` and configure:

```bash
cp env.example .env
```

### Option 1: Encrypted DATABASE_URL (Recommended)

For secure kit distribution, use encrypted DATABASE_URL:

- `DATABASE_URL_ENCRYPTED`: AES-256-GCM encrypted database URL
- `WXKANBAN_API_TOKEN`: Your personal API token for decryption
- `API_KEY`: API key for MCP server authentication

The encrypted format is: `iv_hex:authTag_hex:ciphertext_hex`

### Option 2: Plain DATABASE_URL (Development Only)

- `DATABASE_URL`: PostgreSQL connection string (plain text)
- `API_KEY`: API key for authentication

> **Security Note**: Plain DATABASE_URL should only be used for local development. Always use encrypted mode for production kits.


## Building

```bash
npm run build
```

## Running

Development mode (with hot reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

HTTP mode:
```bash
npm run build
npm run start:http
```

## VS Code Integration

Add to your VS Code settings or `.vscode/mcp.json`:

### With Encrypted DATABASE_URL (Recommended)

```json
{
  "servers": {
    "mcp-project-hub": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL_ENCRYPTED": "your_encrypted_database_url",
        "WXKANBAN_API_TOKEN": "wxk_live_your_token",
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### With Plain DATABASE_URL (Development)

```json
{
  "servers": {
    "mcp-project-hub": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "API_KEY": "your-api-key"
      }
    }
  }
}
```


## Architecture

- **Transport**: stdio (Phase 1), HTTP/SSE (Phase 2)
- **ORM**: Drizzle ORM
- **Validation**: Zod schemas
- **Auth**: API key + role-based permissions
- **Security**: AES-256-GCM encryption for DATABASE_URL per-developer

## Security

### Encrypted DATABASE_URL

The MCP server supports per-developer encrypted DATABASE_URL to prevent credential exposure:

1. **Encryption**: DATABASE_URL is encrypted using AES-256-GCM with the developer's WXKANBAN_API_TOKEN as the key
2. **Format**: `iv:authTag:ciphertext` (hex-encoded, colon-separated)
3. **Decryption**: Happens at startup, decrypted URL held in memory only
4. **No Plain Text**: Plain DATABASE_URL never appears in any kit file

### API Token Security

- Tokens are generated per-user, per-company
- Only token hashes are stored in the database
- Full tokens are shown once on creation and included in the kit
- Revoked tokens invalidate all kits encrypted with them


## Development

### Project Structure

```
mcp-server/
├── src/
│   ├── auth/           # Authentication and authorization
│   ├── db/             # Database connection and schema
│   ├── utils/          # Utilities (logger, schemas)
│   ├── server.ts       # MCP server implementation
│   ├── config.ts       # Configuration
│   └── index.ts        # Entry point
├── .vscode/
│   └── mcp.json        # VS Code MCP configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Testing

```bash
npm test
```

## License

MIT
