export interface AvailableCommand {
  alias: string;
  fullName: string;
  description: string;
  category: 'mcp' | 'git';
  usage?: string;
}

export type HelpMode = 'all' | 'git' | 'docs';

export const AVAILABLE_COMMANDS: AvailableCommand[] = [
  { alias: 'help', fullName: 'project.help', description: 'Display this help message with all available commands', category: 'mcp' },
  { alias: 'mcphealth', fullName: 'project.mcp_health', description: 'Show MCP health status and active project context', category: 'mcp' },
  { alias: 'dbpush', fullName: 'project.capture_event', description: 'Push/capture project events to database (chat, commits, meeting notes, manual notes)', category: 'mcp' },
  { alias: 'upsert', fullName: 'project.upsert_document', description: 'Create or update project documents and specs', category: 'mcp' },
  { alias: 'createtask', fullName: 'project.create_task', description: 'Create new project tasks with priority and status', category: 'mcp' },
  { alias: 'updatestatus', fullName: 'project.update_task_status', description: 'Update task status (todo -> in_progress -> blocked -> done)', category: 'mcp' },
  { alias: 'link', fullName: 'project.link_doc_to_task', description: 'Link documents to tasks bidirectionally', category: 'mcp' },
  { alias: 'list', fullName: 'project.list_open_items', description: 'List open tasks, recent documents, and events', category: 'mcp' },
  { alias: 'createspecs', fullName: 'project.create_specs', description: 'Execute complete wxKanban spec workflow with strict scope-quality preflight', category: 'mcp' },
  { alias: 'checkupdates', fullName: 'project.check_for_updates', description: 'Check for MCP server updates from GitHub releases', category: 'mcp' },
  { alias: 'upgrade', fullName: 'project.upgrade_mcp', description: 'Download and install latest MCP server version', category: 'mcp' },
  { alias: 'kitstatus', fullName: 'project.kit_status', description: 'Get project kit status and metadata', category: 'mcp' },
  { alias: 'downloadkit', fullName: 'project.download_kit', description: 'Generate download URL for project kit', category: 'mcp' },
  { alias: 'regeneratekit', fullName: 'project.regenerate_kit', description: 'Trigger kit regeneration with latest project state', category: 'mcp' },
  { alias: 'importproject', fullName: 'project.import_project', description: 'Import existing project into wxKanban', category: 'mcp' },
  { alias: 'createtoken', fullName: 'project.create_api_token', description: 'Create new API token for programmatic access', category: 'mcp' },
  { alias: 'listtokens', fullName: 'project.list_api_tokens', description: 'List all active API tokens', category: 'mcp' },
  { alias: 'revoketoken', fullName: 'project.revoke_api_token', description: 'Revoke an API token by ID', category: 'mcp' },
  { alias: 'implement', fullName: 'project.implement', description: 'Execute wxAI-implement: Run implementation plan from tasks.md with scope-first enforcement', category: 'mcp' },
  { alias: 'analyze', fullName: 'project.analyze', description: 'Execute wxAI-analyze: Cross-artifact consistency analysis across spec.md, plan.md, and tasks.md', category: 'mcp' },
  { alias: 'sessionstart', fullName: 'project.session_start', description: 'Execute wxAI-session-start: Initialize AI session with governance checks and scope context', category: 'mcp' },
  { alias: 'buildscope', fullName: 'project.buildscope', description: 'Guided-first scope drafting that asks clarifying questions unless quick mode is enabled', category: 'mcp' },
  { alias: 'validatescope', fullName: 'project.validatescope', description: 'Validate a scope document for completeness, placeholders, and minimum quality gates', category: 'mcp' },
  { alias: 'gitcheckpoint', fullName: 'wxAIGit.checkpoint', description: 'Quick timestamped git commit', category: 'git', usage: '.\\wxAIGit.cmd checkpoint "WIP: auth module"' },
  { alias: 'gitcommit', fullName: 'wxAIGit.commit', description: 'Full conventional commit with changelog', category: 'git', usage: '.\\wxAIGit.cmd commit' },
  { alias: 'gitmerge', fullName: 'wxAIGit.merge', description: 'Merge to main with version bump', category: 'git', usage: '.\\wxAIGit.cmd merge' },
  { alias: 'gitsync', fullName: 'wxAIGit.sync', description: 'Safe fast-forward from remote', category: 'git', usage: '.\\wxAIGit.cmd sync' },
  { alias: 'gitbranch', fullName: 'wxAIGit.branch', description: 'Branch management operations', category: 'git', usage: '.\\wxAIGit.cmd branch --list' },
  { alias: 'gitpush', fullName: 'wxAIGit.push', description: 'Push current branch to remote', category: 'git', usage: '.\\wxAIGit.cmd push' },
  { alias: 'gitpull', fullName: 'wxAIGit.pull', description: 'Pull with rebase', category: 'git', usage: '.\\wxAIGit.cmd pull' },
  { alias: 'gitstash', fullName: 'wxAIGit.stash', description: 'Stash current changes', category: 'git', usage: '.\\wxAIGit.cmd stash' },
  { alias: 'gitunstash', fullName: 'wxAIGit.unstash', description: 'Apply stashed changes', category: 'git', usage: '.\\wxAIGit.cmd unstash' },
  { alias: 'gitstatus', fullName: 'wxAIGit.status', description: 'Enhanced git status', category: 'git', usage: '.\\wxAIGit.cmd status' },
];

function renderCommandTable(commands: AvailableCommand[]): string[] {
  const sortedCommands = [...commands].sort((a, b) =>
    a.alias.localeCompare(b.alias)
  );
  const hasUsage = commands.some((command) => command.usage);
  const header = hasUsage
    ? ['| Alias | Full Command | Description | Usage |', '|-------|--------------|-------------|-------|']
    : ['| Alias | Full Command | Description |', '|-------|--------------|-------------|'];

  const rows = sortedCommands.map((command) => {
    if (hasUsage) {
      return `| \`${command.alias}\` | \`${command.fullName}\` | ${command.description} | ${command.usage ?? ''} |`;
    }

    return `| \`${command.alias}\` | \`${command.fullName}\` | ${command.description} |`;
  });

  return [...header, ...rows];
}

function getCommandsByCategory(category: AvailableCommand['category']): AvailableCommand[] {
  return AVAILABLE_COMMANDS.filter((command) => command.category === category);
}

function getCommandsForHelpMode(mode: HelpMode): AvailableCommand[] {
  if (mode === 'git') {
    return getCommandsByCategory('git');
  }

  if (mode === 'docs') {
    return getCommandsByCategory('mcp');
  }

  return AVAILABLE_COMMANDS;
}

function getHelpModeSubtitle(mode: HelpMode): string {
  if (mode === 'git') {
    return 'Showing git workflow aliases only (`help --git`).';
  }

  if (mode === 'docs') {
    return 'Showing document/development aliases only (`help --docs`).';
  }

  return 'Showing all aliases (`help --all`).';
}

export function renderAvailableCommandsLines(): string[] {
  return renderCommandTable(AVAILABLE_COMMANDS);
}

const mcpRows = renderCommandTable(getCommandsByCategory('mcp'));
const wxAiGitRows = renderCommandTable(getCommandsByCategory('git'));

const branchRows = [
  '| Operation | Description | Example |',
  '|-----------|-------------|---------|',
  '| --list | List all branches | wxAIGit branch --list |',
  '| --create <name> | Create new branch | wxAIGit branch --create feature-auth |',
  '| --switch <name> | Switch to branch | wxAIGit branch --switch main |',
  '| --rename <old> <new> | Rename branch | wxAIGit branch --rename wt-user feature-auth |',
  '| --delete <name> | Delete branch | wxAIGit branch --delete old-branch |',
  '| --work | Create work branch (wt-{username}) | wxAIGit branch --work |',
];

const commitRows = [
  '| Emoji | Type | Use For |',
  '|-------|------|---------|',
  '| feat | feat | New feature |',
  '| fix | fix | Bug fix |',
  '| docs | docs | Documentation |',
  '| style | style | Formatting |',
  '| refactor | refactor | Refactoring |',
  '| perf | perf | Performance |',
  '| test | test | Testing |',
  '| chore | chore | Maintenance |',
  '| version | chore | Version bump (auto) |',
];

function renderAllHelpText(): string {
  return [
  '## Available MCP Tools',
  '',
  ...mcpRows,
  '',
  '---',
  '',
  '## wxAIGit Commands (Git Workflow Automation)',
  '',
  'wxAIGit provides enhanced git workflow automation with conventional commits, changelog updates, and semantic versioning.',
  '',
  ...wxAiGitRows,
  '',
  '### wxAIGit Branch Operations',
  '',
  ...branchRows,
  '',
  '### Commit Types Reference',
  '',
  ...commitRows,
  '',
  '---',
  '',
  '### Quick Usage:',
  '- Use project.buildscope first to gather missing scope decisions in guided mode',
  '- Use project.validatescope to clear blockers before running project.create_specs',
  '- Use project.create_specs only after the scope passes the preflight quality gate',
  '- Use project.capture_event to log all AI interactions',
  '- Use project.list_open_items to get work queue',
  '- Use project.help anytime to see all available commands',
  '- Use help --all for full command list',
  '- Use help --git for git-only commands',
  '- Use help --docs for document/development commands',
  '',
  'Server status: online and ready for requests',
  ].join('\n');
}

export function renderHelpText(mode: HelpMode = 'all'): string {
  if (mode === 'all') {
    return renderAllHelpText();
  }

  const commands = getCommandsForHelpMode(mode);
  const title = mode === 'git'
    ? '## Git Commands'
    : '## Document and Development Commands';

  return [
    title,
    '',
    getHelpModeSubtitle(mode),
    '',
    ...renderCommandTable(commands),
    '',
    '---',
    '',
    'Tip: Use `help --all`, `help --git`, or `help --docs` to switch views.',
  ].join('\n');
}

export const MCP_HELP_TEXT = renderHelpText('all');