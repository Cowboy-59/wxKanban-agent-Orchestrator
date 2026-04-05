---
paths: **/*.tsx, **/*.css, **/tailwind.config.*, **/components.json
---

## shadcn-ui MCP Server Usage rules

### Usage Rule

If project is using shadcn always use shadcn components when possible
When using shadcn components, use the shadcn-ui MCP server.

### Planning Rule

When asked to plan using anything related to shadcn:
Use the MCP server during planning
Apply components whenever components are applicable
Use whole blocks where possible (e.g. login page, calendar)

### Implementation Rule

When implementing:

first call the demo tool to see how it is used
Then implement it so that it is implemented correctly

# Notes to assist user with MCP installation

the shadcn mcp server supports frameworks and you should install the appropriate version on a per project basis using one of the commands below from the project root folder. Note this names it shadcn-ui in both instances so the above commands will work for both frameworks.

- React

```bash
claude mcp add shadcn-ui -- npx @jpisnice/shadcn-ui-mcp-server
```

- React Native variant:

```bash
claude mcp add shadcn-ui -- npx @jpisnice/shadcn-ui-mcp-server --framework react-native
```
