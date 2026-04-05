# wxKanban-agent-orchestrator - wxKanban Project Kit

## Setup Instructions

1. Extract this ZIP file to your desired location
2. Copy the API token from .env file (or use the one shown in the browser)
3. Run `node scripts/setup-mcp.mjs`
4. Validate runtime with `node scripts/mcp-health-check.mjs`
5. Edit `ProjectOverview.md` to give a general overview of the project


## Scope Editing and Creation of Features

`specs/project-scope` is where you add each feature scope you wish to generate for the application. Use a 001, 002, 003 prefix such as 001-initialization, 002-MainLandingPage, etc. to build these. That way you can use the 001, 002 to generate the documentation and tasks.

- `createspecs 001` will create a directory `001-init` (example) and fill in all documentation and update the wxKanban database with the information and tasks
- `implement 001` will create the code to build the application feature

Generated: 2026-04-05T19:27:05.229Z

