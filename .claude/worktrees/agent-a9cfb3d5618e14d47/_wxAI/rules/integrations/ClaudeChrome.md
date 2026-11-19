### Browser Access Via Claude in Chrome Extension

**Claude in Chrome MCP Server Configuration:**
The project includes the Claude in Chrome MCP server which enables browser automation for all Claude Code instances working on this project.

**Usage Guidelines:**

- The user is always testing the site via the browser. This means you have access to the browser and can test directly
- DO NOT ask the user to test, view console logs, or interact with the browser if you can do so yourself. ALWAYS test and iterate until you have a correct result
- DO NOT close browser tabs unless explicitly instructed - the user is using them for testing!
- Use Claude in Chrome for all browser testing, form interaction, and UI validation
- **Authentication for Testing**: If testing requires login, check the `.env` file for test credentials (typically `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_CLIENT_EMAIL`, `TEST_CLIENT_PASSWORD`)

**Connection & Reconnection:**

- **Extension runs in background** - Once installed in a Chromium browser (Chrome, Comet, Edge, Brave, etc.), it's always active
- **Automatic reconnection** - Call `tabs_context_mcp` with `createIfEmpty: true` to establish/re-establish connection
- **No manual intervention needed** - The extension handles MCP connections automatically
- **Tab groups are ephemeral** - They get destroyed when closed, but can be recreated on demand
- **Browser compatibility** - Works with any Chromium-based browser with the extension installed

**Connection Workflow:**

```typescript
// Check if connected, create tab group if needed
tabs_context_mcp({ createIfEmpty: true });

// If connection lost (tab group closed), simply reconnect
tabs_context_mcp({ createIfEmpty: true });
```

**Troubleshooting "Browser extension is not connected" Errors:**

If `tabs_context_mcp` returns "Browser extension is not connected", follow these steps:

1. **Kill stale native host process:**

```bash
ps aux | grep chrome-native-host | grep -v grep
# Kill any stale processes found
kill <PID>
```

2. **Kill stale Claude sessions** that may be holding the connection:

```bash
ps aux | grep claude | grep -v grep
# Look for old sessions (check timestamps) and kill them
kill <PID>
```

3. **User runs `/chrome` command** - This reinitializes the MCP connection. Ask the user to run `/chrome` in Claude Code.

4. **Retry connection:**

```typescript
tabs_context_mcp({ createIfEmpty: true });
```

**Root Cause:** The native messaging host or stale Claude sessions can hold onto the extension connection, preventing new sessions from connecting.

**Core Capabilities:**

_Page Management & Navigation:_

- Create new tabs in the MCP tab group
- Navigate to URLs, go back/forward in history
- Resize viewport/window for responsive testing
- Switch between tabs (but only within the MCP tab group)

_Interactive Testing:_

- Read page structure via accessibility tree (preferred over screenshots for AI analysis)
- Find elements using natural language queries (e.g., "search bar", "login button", "add to cart")
- Click, double-click, hover, scroll, drag-and-drop
- Fill form inputs (individual fields via `form_input`)
- Type text and press keyboard keys (including shortcuts like "cmd+a", "ctrl+c")
- Upload images/files to forms or drag-drop areas
- Take screenshots (full page, viewport, or specific elements/regions)

_Advanced Capabilities:_

- **GIF Recording**: Record browser interactions and export as animated GIF with visual overlays (click indicators, action labels, progress bar)
- **JavaScript Execution**: Run JavaScript in page context with full access to DOM, window object, and page variables
- **Natural Language Finding**: Search for elements by purpose or content without needing exact selectors
- **Computer-Style Interaction**: More natural mouse/keyboard control patterns

_Network & Console Analysis:_

- Read console messages (errors, warnings, logs) with regex pattern filtering
- Monitor network requests (XHR, Fetch, documents, images)
- Filter network requests by URL pattern
- Clear console/network logs to avoid duplicate readings

_Workflow Automation:_

- List available shortcuts/workflows
- Execute predefined workflows via shortcuts

**Critical Limitations:**

_OAuth & Extension Security:_

- **CANNOT click OAuth buttons** (Google, Facebook, etc.) due to Chrome cross-extension security
- OAuth flows use `chrome-extension://` URLs that are blocked between extensions
- Error: `Cannot access a chrome-extension:// URL of different extension`
- **Workaround**: User must handle OAuth login manually, then you can continue automation
- **Session persistence**: OAuth cookies persist across browser restarts, so one-time manual login is sufficient

_Tab Group Isolation:_

- Can only interact with tabs in the MCP tab group
- Cannot access user's regular browsing tabs (security feature)
- Must create/navigate tabs explicitly within the automation context

**Best Practices:**

_Element Interaction:_

- Use `read_page` with `filter: "interactive"` to find interactive elements efficiently
- Use `find` tool for natural language element searching when structure is unknown
- Use element `ref` IDs from `read_page` or `find` results for clicking/filling
- Take fresh snapshots after interactions - page structure changes after clicks/navigation

_Testing Workflow:_

- **Start each session**: Call `tabs_context_mcp` with `createIfEmpty: true`
- **Navigate first**: Go to the page you need to test
- **Read before action**: Use `read_page` to understand page structure
- **Iterate**: Test, read console logs, check results, fix issues, repeat
- **Check console proactively**: Use `read_console_messages` with pattern filtering for debugging

_Authentication Testing:_

- For email/password login: Fill forms and submit normally
- For OAuth login: User must complete manually (one-time), then session persists
- Always verify login success by checking for authenticated page elements

_Performance & Efficiency:_

- Use `read_page` with `filter: "interactive"` instead of `filter: "all"` when you only need interactive elements (reduces output)
- Use `find` tool for targeted element searches (more efficient than reading entire page)
- Clear console/network logs after reading to prevent duplicate results
- Use GIF recording for documenting complex workflows or bug reports

_Responsive Testing:_

- Resize viewport to common breakpoints:
  - Mobile: 375x667 (iPhone SE)
  - Tablet: 768x1024 (iPad)
  - Desktop: 1920x1080 (standard monitor)
  - Large desktop: 2560x1440 (common developer setup)

**Session Persistence Behavior:**

- **Auth cookies persist** across browser restarts
- **Sessions remain active** even after closing browser completely
- **Auto-redirect to authenticated pages** when navigating to root URL
- **One-time manual OAuth login** is sufficient for ongoing automated testing

**Debugging Protocol:**

When encountering issues:

1. **Read console messages** with pattern filtering: `read_console_messages({ pattern: "error|warning", tabId })`
2. **Check network requests** for failed API calls: `read_network_requests({ urlPattern: "/api/", tabId })`
3. **Take screenshot** to verify visual state: `computer({ action: "screenshot", tabId })`
4. **Execute JavaScript** to inspect state: `javascript_tool({ text: "return window.myData", tabId })`
5. **Iterate and fix** until tests pass

**Example Testing Pattern:**

```typescript
// 1. Establish connection and create tab
const context = await tabs_context_mcp({ createIfEmpty: true });
const tabId = context.availableTabs[0].tabId;

// 2. Navigate to page
await navigate({ url: "http://localhost:3001", tabId });

// 3. Read page structure
const page = await read_page({ tabId, filter: "interactive", depth: 10 });

// 4. Find and interact with elements
await form_input({ ref: "ref_1", value: "test@example.com", tabId });
await computer({ action: "left_click", ref: "ref_2", tabId });

// 5. Check console for errors
const console = await read_console_messages({
  pattern: "error",
  tabId,
  clear: true,
});

// 6. Verify results
const results = await read_page({ tabId, filter: "all", depth: 8 });
```
