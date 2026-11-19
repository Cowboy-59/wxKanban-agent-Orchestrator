# AI Project Context

## Project ID

test-project-123

## wxKanban Integration

This project is connected to wxKanban for AI-assisted task management.

## Quick Commands

- Use `project.list_open_items` to see available tasks
- Use `project.create_task` to create a new task
- Use `project.capture_event` to log AI interactions

## Environment Setup

1. Ensure DATABASE_URL and PROJECT_ID are set in your environment
2. Start the MCP runtime: `node scripts/setup-mcp.mjs`
3. Validate runtime health: `node scripts/mcp-health-check.mjs`

## Project Structure

- _wxAI/commands/ — AI command templates
- mcp-server/ — MCP server for wxKanban integration
