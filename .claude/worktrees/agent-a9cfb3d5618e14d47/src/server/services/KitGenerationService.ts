/**
 * KitGenerationService
 * 
 * Generates AI-ready project kits with all components.
 * Part of Spec 011: New Project — AI-Ready Project Provisioning
 * Updated for 017 MCP Project Hub integration
 */

import { eq, and, isNull, inArray, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { projectkits, type NewProjectKit, type KitContent } from '../../db/schema/projectkit.js';
import { projectkitfiles } from '../../db/schema/projectkitfile.js';
import { projectdocuments } from '../../db/schema/projectdocuments.js';

import { kitEncryptionService } from './KitEncryptionService';
import { apiTokenService } from './ApiTokenService';
import { NotificationService } from './NotificationService';
import { logger } from '../lib/logger';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';

const KIT_VERSION: string = (() => {
  try {
    const pkgPath = path.resolve(process.cwd(), 'wxkanban-agent/package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();


export interface KitGenerationOptions {
  projectId: string;
  userId: string;
  companyId: string;
  primaryAi: string;
  importMode?: boolean;
}

export interface GeneratedKit {
  kitId: string;
  status: 'ready' | 'failed';
  downloadUrl?: string;
  error?: string;
}

export class KitGenerationService {
  private static instance: KitGenerationService;
  private kitTemplatesPath: string;
  private mcpServerPath: string;
  private wxAiPath: string;
  private vscodePath: string;

  private constructor() {
    this.kitTemplatesPath = path.resolve(process.cwd(), '_wxAI/commands');
    this.mcpServerPath = path.resolve(process.cwd(), 'mcp-server');
    this.wxAiPath = path.resolve(process.cwd(), '_wxAI');
    this.vscodePath = path.resolve(process.cwd(), '.vscode');
  }


  public static getInstance(): KitGenerationService {
    if (!KitGenerationService.instance) {
      KitGenerationService.instance = new KitGenerationService();
    }
    return KitGenerationService.instance;
  }

  /**
   * Generate a complete project kit
   */
  async generateKit(options: KitGenerationOptions): Promise<GeneratedKit> {
    const { projectId, userId, companyId, primaryAi, importMode = false } = options;

    try {
      logger.info({ projectId, primaryAi, importMode }, 'Starting kit generation');

      // Create or update kit record
      const kitData: NewProjectKit = {
        projectid: projectId,
        status: 'generating',
        primaryai: primaryAi,
        kitversion: KIT_VERSION,
        kitcontent: {
          files: [],
          variables: {},
          importMode,
        },
      };

      // Check for existing kit using standard query
      const [existingKit] = await db
        .select()
        .from(projectkits)
        .where(eq(projectkits.projectid, projectId))
        .limit(1);

      let kitRecord: typeof existingKit;

      if (existingKit) {
        // Update existing
        // [SCOPE 083 / T014] FR-010 — a regenerate builds the kit at KIT_VERSION, so record it;
        // this branch used to leave the install-day version in place forever. Never record the
        // '0.0.0' sentinel KIT_VERSION falls back to when package.json can't be read.
        await db
          .update(projectkits)
          .set({
            status: 'generating',
            ...(KIT_VERSION !== '0.0.0' && { kitversion: KIT_VERSION }),
            updatedat: new Date(),
          })
          .where(eq(projectkits.id, existingKit.id));
        kitRecord = existingKit;
      } else {
        // Create new
        const [newKit] = await db.insert(projectkits).values(kitData).returning();
        kitRecord = newKit;
      }

      // Generate all kit files
      const files = await this.generateKitFiles(kitRecord.id, {
        projectId,
        userId,
        companyId,
        primaryAi,
        importMode,
      });


      // Update kit content
      const kitContent: KitContent = {
        files: files.map(f => ({
          filepath: f.filepath,
          filetype: f.filetype as any,
          size: f.content.length,
          hash: this.hashContent(f.content),
        })),
        variables: {
          WXKANBAN_PROJECT_ID: projectId,
          PRIMARY_AI: primaryAi,
          IMPORT_MODE: importMode ? 'true' : 'false',
        },
        importMode,
      };

      // Mark as ready
      await db
        .update(projectkits)
        .set({
          status: 'ready',
          kitcontent: kitContent,
          generatedat: new Date(),
          updatedat: new Date(),
        })
        .where(eq(projectkits.id, kitRecord.id));

      logger.info({ kitId: kitRecord.id, fileCount: files.length }, 'Kit generation complete');

      // Send notification to user that kit is ready (non-blocking)
      try {
        await NotificationService.create({
          userid: userId,
          type: 'project_kit_ready',
          entityid: projectId,
          entitytype: 'project',
          message: `Project kit for project ${projectId} is ready for download. Includes 017 MCP Project Hub.`,
        });
      } catch (notifyError) {
        logger.warn({ notifyError, projectId }, 'Failed to send kit ready notification');
        // Don't fail kit generation if notification fails
      }

      return {
        kitId: kitRecord.id,
        status: 'ready',
      };


    } catch (error) {
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : { raw: error, type: typeof error };
      
      logger.error({ error: errorDetails, projectId }, 'Kit generation failed');

      // Update status to failed if we have a kit record
      const [existingKit] = await db
        .select()
        .from(projectkits)
        .where(eq(projectkits.projectid, projectId))
        .limit(1);

      if (existingKit) {
        await db
          .update(projectkits)
          .set({ status: 'failed', updatedat: new Date() })
          .where(eq(projectkits.id, existingKit.id));
      }

      return {
        kitId: existingKit?.id || '',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error) || 'Unknown error',
      };
    }

  }

  /**
   * Generate all kit files
   */
  private async generateKitFiles(
    kitId: string,
    options: { projectId: string; userId: string; companyId: string; primaryAi: string; importMode: boolean }
  ): Promise<Array<{ filepath: string; filetype: string; content: string }>> {

    const files: Array<{ filepath: string; filetype: string; content: string }> = [];

    // 1. AI Commands (updated for 017 MCP)
    const commandFiles = await this.loadCommandTemplates();
    for (const cmd of commandFiles) {
      files.push({
        filepath: `_wxAI/commands/${cmd.name}`,
        filetype: 'command',
        content: cmd.content,
      });
    }

    // 2. AI workspace assets (entire _wxAI/ directory)
    const wxAiFiles = await this.loadWxAiDirectory();
    for (const wxAiFile of wxAiFiles) {
      files.push({
        filepath: `_wxAI/${wxAiFile.relativePath}`,
        filetype: 'wxai',
        content: wxAiFile.content,
      });
    }

    // 3. MCP Server (017 MCP Project Hub - full directory structure)
    const mcpServerFiles = await this.loadMcpServerFiles();
    for (const mcpFile of mcpServerFiles) {
      files.push({
        filepath: `mcp-server/${mcpFile.relativePath}`,
        filetype: 'mcp',
        content: mcpFile.content,
      });
    }

    // 4. VSCode Settings (.vscode/ directory)
    const vscodeFiles = await this.loadVscodeDirectory();
    for (const vscodeFile of vscodeFiles) {
      files.push({
        filepath: `.vscode/${vscodeFile.relativePath}`,
        filetype: 'vscode',
        content: vscodeFile.content,
      });
    }

    // Ensure tasks.json always exists for MCP auto-start on project open
    const hasTasksJson = vscodeFiles.some(f => f.relativePath === 'tasks.json');
    if (!hasTasksJson) {
      files.push({
        filepath: '.vscode/tasks.json',
        filetype: 'vscode',
        content: this.generateVscodeTasksJson(),
      });
    }

    // [SPEC 028 / T050] BEGIN — Environment file with hosted-MCP token (no DATABASE_URL_ENCRYPTED)
    const envFileResult = await this.generateEnvFile(options.projectId, options.userId, options.companyId);
    const { content: envContent, apiToken: kitToken } = envFileResult;

    files.push({
      filepath: '.env',
      filetype: 'config',
      content: envContent,
    });

    // 6. AI Settings — hosted-MCP client config; no encrypted DB URL injected (spec 019 Decision #3).
    files.push({
      filepath: 'ai-settings.json',
      filetype: 'settings',
      content: this.generateAiSettings(
        options.projectId,
        options.primaryAi,
        kitToken,
        process.env.MCP_API_KEY || process.env.API_KEY || 'your_api_key_here'
      ),
    });
    // [SPEC 028 / T050] END

    // 7. Project Context (AI.md - updated for 017 MCP)
    files.push({
      filepath: 'AI.md',
      filetype: 'context',
      content: this.generateAiContext(options.projectId, options.importMode),
    });

    // 8. Project Config

    files.push({
      filepath: '.wxkanban-project.json',
      filetype: 'config',
      content: this.generateProjectConfig(options.projectId, options.importMode),
    });

    // 9. Project Overview (only for new projects, not import)
    // Per spec 024 FR-004: mirror the DB overview doc when present (proposal-sourced
    // or AI-scaffolded); fall back to the empty starter template only when no DB
    // doc exists. projectdocuments is the single source of truth.
    if (!options.importMode) {
      files.push({
        filepath: 'ProjectOverview.md',
        filetype: 'spec',
        content: await this.resolveProjectOverviewContent(options.projectId),
      });
    }

    // 10. One-command MCP setup + health validation scripts
    files.push({
      filepath: 'scripts/setup-mcp.mjs',
      filetype: 'config',
      content: this.generateSetupMcpScript(),
    });

    files.push({
      filepath: 'scripts/mcp-health-check.mjs',
      filetype: 'config',
      content: this.generateMcpHealthCheckScript(),
    });

    // 10c. Pre-commit hook for HOOK-level rule enforcement
    files.push({
      filepath: '.husky/pre-commit',
      filetype: 'config',
      content: this.generatePreCommitHook(),
    });

    // 10d. [SCOPE 058 / T020] Scope check-out/check-in git-hook trap — ship the
    // post-checkout/post-merge hooks + their helper so a consumer repo keeps the
    // DB claim in sync on manual branching (no bypass). Mirrors the pre-commit
    // hook delivery; the hooks are best-effort and non-blocking at runtime.
    const scopeHookFiles = await this.loadScopeHookFiles();
    for (const f of scopeHookFiles) {
      files.push({ filepath: f.filepath, filetype: 'config', content: f.content });
    }

    // 10e. [SCOPE 058 / T026] wxAIGit scope-branch CLI (Amendment B / FR-010) —
    // ship the cross-platform launchers + backing scripts so a consumer project
    // has a working `wxAIGit branch --create` / `merge`, making the Cockpit
    // check-out (FR-005) actually create the branch instead of the fallback.
    const wxAIGitFiles = await this.loadWxAIGitFiles();
    for (const f of wxAIGitFiles) {
      files.push({ filepath: f.filepath, filetype: 'config', content: f.content });
    }

    // [SPEC 028 / T050] EMBEDDED_DATABASE_URL injection removed — spec 019 Decision #3 retires
    // DATABASE_URL_ENCRYPTED entirely. Kit ships no DB credentials in any form. The hosted MCP
    // at https://mcp.wxperts.com authenticates via WXKANBAN_API_TOKEN (bearer) only.


    // Delete existing files for this kit (overwrite mode)
    await db.delete(projectkitfiles).where(eq(projectkitfiles.kitid, kitId));
    logger.info({ kitId, fileCount: files.length }, 'Deleted existing kit files, inserting new ones');

    // Store files in database
    for (const file of files) {
      await db.insert(projectkitfiles).values({
        kitid: kitId,
        filepath: file.filepath,
        filetype: file.filetype,
        content: file.content,
      });
    }

    return files;
  }

  /**
   * Load command templates from _wxAI/commands/
   */
  private async loadCommandTemplates(): Promise<Array<{ name: string; content: string }>> {
    const commands: Array<{ name: string; content: string }> = [];
    
    try {
      const files = await fs.readdir(this.kitTemplatesPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const content = await fs.readFile(path.join(this.kitTemplatesPath, file), 'utf-8');
        commands.push({ name: file, content });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load command templates');
      // Return minimal set if templates not found
      return [
        { name: 'task-push.md', content: '# task-push\n\nTemplate not loaded.' },
        { name: 'task-done.md', content: '# task-done\n\nTemplate not loaded.' },
        { name: 'createSpecs.md', content: '# createSpecs\n\nTemplate not loaded.' },
      ];
    }

    return commands;
  }

  /**
   * Load the entire _wxAI/ directory
   */
  // [SCOPE 058 / T020] Read the scope check-out/check-in git hooks + helper from the
  // repo (single source of truth = the dogfooded files) so they ship in the kit.
  // Best-effort: a missing file is logged and skipped, never fails kit generation.
  private async loadScopeHookFiles(): Promise<Array<{ filepath: string; content: string }>> {
    const out: Array<{ filepath: string; content: string }> = [];
    const sources = ['.husky/post-checkout', '.husky/post-merge', 'scripts/wxkanban-scope-hook.mjs'];
    for (const rel of sources) {
      try {
        const content = await fs.readFile(path.resolve(process.cwd(), rel), 'utf-8');
        out.push({ filepath: rel, content });
      } catch (error) {
        logger.warn({ error, file: rel }, 'scope-hook file not found; skipping');
      }
    }
    return out;
  }

  // [SCOPE 058 / T026] Read the wxAIGit launchers + backing scripts from the repo
  // (single source of truth = the dogfooded files) so they ship in the kit. The
  // consumer's kit-apply path is responsible for chmod +x on the POSIX launcher
  // and *.sh (same as the husky hooks). Best-effort: a missing file is skipped.
  private async loadWxAIGitFiles(): Promise<Array<{ filepath: string; content: string }>> {
    const out: Array<{ filepath: string; content: string }> = [];
    const sources = ['wxAIGit.cmd', 'wxAIGit', 'scripts/wxaigit/gitbranch.sh', 'scripts/wxaigit/gitmerge.sh'];
    for (const rel of sources) {
      try {
        const content = await fs.readFile(path.resolve(process.cwd(), rel), 'utf-8');
        out.push({ filepath: rel, content });
      } catch (error) {
        logger.warn({ error, file: rel }, 'wxAIGit file not found; skipping');
      }
    }
    return out;
  }

  private async loadWxAiDirectory(): Promise<Array<{ relativePath: string; content: string }>> {
    const files: Array<{ relativePath: string; content: string }> = [];
    
    try {
      await this.loadWxAiDirectoryRecursive('', files);
      logger.info({ fileCount: files.length }, 'Loaded _wxAI directory');
    } catch (error) {
      logger.warn({ error }, '_wxAI directory not found or empty, skipping');
    }

    return files;
  }

  /**
   * Recursively load _wxAI directory
   */
  private async loadWxAiDirectoryRecursive(
    subPath: string, 
    files: Array<{ relativePath: string; content: string }>
  ): Promise<void> {
    const fullPath = path.join(this.wxAiPath, subPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = subPath ? `${subPath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        await this.loadWxAiDirectoryRecursive(entryRelativePath, files);
      } else {
        const filePath = path.join(fullPath, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');
        files.push({
          relativePath: entryRelativePath,
          content,
        });
      }
    }
  }

  /**
   * Load VSCode settings from .vscode/ directory
   */
  private async loadVscodeDirectory(): Promise<Array<{ relativePath: string; content: string }>> {
    const files: Array<{ relativePath: string; content: string }> = [];
    
    try {
      await this.loadVscodeDirectoryRecursive('', files);
      logger.info({ fileCount: files.length }, 'Loaded VSCode settings');
    } catch (error) {
      logger.warn({ error }, '.vscode directory not found or empty, skipping');
    }

    return files;
  }

  /**
   * Recursively load VSCode directory
   */
  private async loadVscodeDirectoryRecursive(
    subPath: string, 
    files: Array<{ relativePath: string; content: string }>
  ): Promise<void> {
    const fullPath = path.join(this.vscodePath, subPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = subPath ? `${subPath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        await this.loadVscodeDirectoryRecursive(entryRelativePath, files);
      } else {
        const filePath = path.join(fullPath, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');
        files.push({
          relativePath: entryRelativePath,
          content,
        });
      }
    }
  }

  /**
   * Load all MCP server files from mcp-server/ directory
   */
  private async loadMcpServerFiles(): Promise<Array<{ relativePath: string; content: string }>> {

    const files: Array<{ relativePath: string; content: string }> = [];
    
    try {
      await this.loadMcpServerDirectoryRecursive('', files);
      logger.info({ fileCount: files.length }, 'Loaded MCP server files');
    } catch (error) {
      logger.error({ error }, 'Failed to load MCP server files');
      // Return minimal placeholder if files not found
      return [
        { 
          relativePath: 'README.md', 
          content: '# MCP Server\n\nMCP server files not found. Please ensure mcp-server/ directory exists.' 
        },
      ];
    }

    return files;
  }

  /**
   * Recursively load MCP server directory
   */
  private async loadMcpServerDirectoryRecursive(
    subPath: string, 
    files: Array<{ relativePath: string; content: string }>
  ): Promise<void> {
    const fullPath = path.join(this.mcpServerPath, subPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = subPath ? `${subPath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        // Skip node_modules but include dist for compiled MCP server
        if (entry.name === 'node_modules') {
          continue;
        }
        await this.loadMcpServerDirectoryRecursive(entryRelativePath, files);

      } else {
        // Skip certain files
        if (entry.name === '.env' || entry.name === '.env.local') {
          continue;
        }
        
        const filePath = path.join(fullPath, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');
        files.push({
          relativePath: entryRelativePath,
          content,
        });
      }
    }
  }

  /**
   * Generate AI settings for all adapters with hosted MCP configuration (spec 028).
   */
  private generateAiSettings(
    projectId: string,
    primaryAi: string,
    apiToken: string,
    apiKey: string
  ): string {
    const mcpBaseUrl = process.env.WXKANBAN_MCP_BASE_URL || 'https://mcp.wxperts.com';
    const settings = {
      _comment: "wxKanban AI Settings — Hosted MCP Project Hub (spec 028)",
      version: '3.0.0',
      primaryAI: primaryAi,
      project: {
        id: projectId,
        name: "{{project_name}}",
        wxkanban_url: "{{wxkanban_api_url}}",
      },
      mcpRuntime: {
        transport: 'https',
        baseUrl: mcpBaseUrl,
        healthEndpoint: `${mcpBaseUrl}/health`,
        validation: {
          primary: 'GET /health',
          secondary: 'POST /call using a known tool',
          note: 'Do not rely on GET /tools as the only readiness check.',
        },
      },
      mcpServers: {
        wxkanban: {
          transport: 'https',
          url: mcpBaseUrl,
          env: {
            WXKANBAN_MCP_BASE_URL: mcpBaseUrl,
            WXKANBAN_API_TOKEN: apiToken,
            WXKANBAN_PROJECT_ID: projectId,
            API_KEY: apiKey,
          },
        },
      },
      aiAdapters: {
        "claude-code": {
          settingsFile: ".claude/settings.json",
          commandsDir: ".claude/commands/",
          note: "Copy mcpServers block into .claude/settings.json. Symlink _wxAI/commands/ to .claude/commands/",
        },
        blackboxai: {
          settingsFile: "_wxAI-global/settings.json",
          commandsDir: "_wxAI-global/commands/",
          note: "Copy mcpServers block into _wxAI-global/settings.json",
        },
        cursor: {
          settingsFile: ".cursor/mcp.json",
          commandsDir: ".cursor/rules/",
          note: "Copy mcpServers block into .cursor/mcp.json. Copy _wxAI/commands/ to .cursor/rules/",
        },
        copilot: {
          settingsFile: ".github/copilot-instructions.md",
          commandsDir: ".github/",
          note: "Add MCP server config to workspace settings. Copy commands as GitHub Copilot instructions.",
        },
      },
    };

    return JSON.stringify(settings, null, 2);
  }

  /**
   * Generate AI context file with 017 MCP tool references
   */
  private generateAiContext(projectId: string, importMode: boolean): string {
    return `# AI Project Context

## Project Information
- **Project ID**: ${projectId}
- **Mode**: ${importMode ? 'Import' : 'New Project'}
- **Platform**: wxKanban
- **MCP Server**: 017 MCP Project Hub

## wxKanban Integration
This project is connected to wxKanban via the MCP Project Hub for AI-powered task management with full audit trail.

### Available Commands
All commands are in \`_wxAI/commands/\` directory:
- \`task-push\` — Push spec tasks to wxKanban (uses project.create_task)
- \`task-done\` — Mark tasks complete (uses project.update_task_status)
- \`createSpecs\` — Full spec pipeline (uses project.capture_event, project.upsert_document, project.create_task)
- \`autofix-tests\` — Autonomous test-fix pipeline (uses project.capture_event)
- \`autofix-translation\` — MSSQL → PostgreSQL translation (uses project.capture_event)
- \`sync-cpl\` — Sync CPL with database (uses project.* tools)
- \`sync-starter-kit\` — Sync with starter kit (uses project.capture_event)

### MCP Tools Available (via MCP Project Hub)
- \`project.capture_event\` — Capture any AI interaction with full audit trail
- \`project.upsert_document\` — Create/update specs, docs, and ADRs
- \`project.create_task\` — Create a new task with event linking
- \`project.update_task_status\` — Update task status (todo → in_progress → done)
- \`project.link_doc_to_task\` — Bidirectional linking between docs and tasks
- \`project.list_open_items\` — Query open tasks and documents for work queue

### MCP Server
The MCP server is located in \`mcp-server/\` directory:
- Preferred entry point: \`mcp-server/dist/index-http.js\`
- Transport: HTTP/SSE via \`node scripts/setup-mcp.mjs\`
- Health check: \`GET http://localhost:3002/health\`
- Auth: API key + role-based access control

## Getting Started
1. Ensure \`ai-settings.json\` has correct MCP server configuration
2. Run \`npm install\` in \`mcp-server/\` directory
3. Start MCP runtime: \`node scripts/setup-mcp.mjs\`
4. Validate runtime: \`node scripts/mcp-health-check.mjs\`
5. Use \`createSpecs\` to create your first spec

## Project Structure
- \`specs/\` — Specification documents
- \`_wxAI/commands/\` — AI command templates (using project.* tools)
- \`_wxAI/\` — Shared AI workspace assets (rules, commands, scripts, settings)
- \`.vscode/\` — VSCode settings including MCP configuration
- \`mcp-server/\` — 017 MCP Project Hub server

- \`AI.md\` — This file (project context)
- \`.wxkanban-project.json\` — Project configuration

## Rules
- Always use MCP tools for database operations — never raw SQL
- Capture events for all significant AI interactions
- DB is source of truth for task status
- Spec numbers are zero-padded (001, 002, ...)
`;
  }

  /**
   * Generate project config file
   */
  private generateProjectConfig(projectId: string, importMode: boolean): string {
    const config = {
      projectId,
      version: KIT_VERSION,
      createdAt: new Date().toISOString(),
      mode: importMode ? 'import' : 'new',
      kitVersion: KIT_VERSION,
      mcpServer: 'mcp-server/dist/index-http.js',
      mcpTransport: 'http',
      mcpHttpUrl: 'http://localhost:3002',
      mcpStartupScript: 'scripts/setup-mcp.mjs',
      commandsDir: '_wxAI/commands/',
      rulesDir: '_wxAI/rules/',
      vscodeDir: '.vscode/',
    };


    return JSON.stringify(config, null, 2);
  }

  /**
   * Generate .env file for hosted MCP (spec 028). No DB credentials of any kind.
   */
  private async generateEnvFile(projectId: string, userId: string, companyId: string): Promise<{ content: string; apiToken: string }> {
    // Phase 11 (spec 028 amendment 2026-05-23): getOrCreateToken signature
    // changed — projectId is now required and moved ahead of the optional name.
    const apiToken = await apiTokenService.getOrCreateToken(userId, companyId, projectId);

    const mcpBaseUrl = process.env.WXKANBAN_MCP_BASE_URL || 'https://mcp.wxperts.com';

    const content = `# wxKanban Project Kit Environment Configuration
# Project ID: ${projectId}

# ============================================
# HOSTED MCP (spec 028)
# ============================================
# The kit talks to wxKanban via HTTPS only. No database connection
# from this machine is required or permitted (spec 019 Decision #2).
WXKANBAN_MCP_BASE_URL=${mcpBaseUrl}

# Bearer token for the hosted MCP. Format: wxk_live_<64hex> or wxk_test_<64hex>.
# Issued per-project by a wxKanban admin. Sent as Authorization: Bearer.
WXKANBAN_API_TOKEN=${apiToken.token}

# Project context for hosted-MCP scoped tools.
WXKANBAN_PROJECT_ID=${projectId}

# ============================================
# NOTES
# ============================================
# - Never commit this file to git (it's in .gitignore).
# - If you lose your WXKANBAN_API_TOKEN, ask a wxKanban admin to rotate it.
# - To target staging, set WXKANBAN_MCP_BASE_URL=https://staging.mcp.wxperts.com.
`;
    
    return { content, apiToken: apiToken.token };
  }

  /**
   * Generate one-command setup script for starting MCP with env loaded from root .env
   */
  private generateSetupMcpScript(): string {
    return `#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const envPath = path.join(root, '.env');
const pidPath = path.join(root, '.mcp-server.pid');
const logsDir = path.join(root, 'logs');
const logPath = path.join(logsDir, 'mcp-server.log');
const mcpEntry = path.join(root, 'mcp-server', 'dist', 'index-http.js');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('.env not found at project root');
  }
  const env = { ...process.env };
  const lines = fs.readFileSync(filePath, 'utf8').split(/\\r?\\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function validate(env) {
  const required = ['WXKANBAN_PROJECT_ID', 'WXKANBAN_MCP_BASE_URL', 'WXKANBAN_API_TOKEN'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error('Missing required MCP parameters: ' + missing.join(', '));
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const env = loadEnv(envPath);
  validate(env);

  if (!fs.existsSync(mcpEntry)) {
    throw new Error('MCP server build missing at mcp-server/dist/index-http.js. Run: cd mcp-server && npm install && npm run build');
  }

  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    if (Number.isFinite(pid) && isRunning(pid)) {
      console.log('MCP already running with PID:', pid);
      process.exit(0);
    }
  }

  const outFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [mcpEntry], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });

  fs.writeFileSync(pidPath, String(child.pid));
  child.unref();

  console.log('MCP started. PID:', child.pid);
  console.log('Log:', logPath);
  console.log('Run health check: node scripts/mcp-health-check.mjs');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
`;
  }

  /**
   * Generate MCP health validation script for generated kits
   */
  private generateMcpHealthCheckScript(): string {
    return `#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const pidPath = path.join(root, '.mcp-server.pid');

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\\r?\\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

const env = parseEnv(envPath);
const required = ['WXKANBAN_PROJECT_ID', 'WXKANBAN_MCP_BASE_URL', 'WXKANBAN_API_TOKEN'];
const missing = required.filter((k) => !env[k]);

console.log('MCP Kit Health Check');
console.log('--------------------');
for (const key of required) {
  console.log(key + ':', env[key] ? 'OK' : 'MISSING');
}

if (missing.length > 0) {
  console.error('Missing required values:', missing.join(', '));
  process.exit(1);
}

if (!fs.existsSync(pidPath)) {
  console.error('MCP not running (.mcp-server.pid missing)');
  process.exit(1);
}

const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
try {
  process.kill(pid, 0);
  console.log('MCP process running with PID:', pid);
  console.log('Health check passed.');
} catch {
  console.error('PID file exists but process is not running:', pid);
  process.exit(1);
}
`;
  }

  /**
   * Generate pre-commit hook for HOOK-level rule enforcement
   */
  private generatePreCommitHook(): string {
    return `#!/bin/sh
# wxKanban Pre-Commit Hook — HOOK-Level Enforcement
#
# Rules enforced:
#   1. No console.log in production code (Constitution IV)
#   2. No TypeScript 'any' type in staged files (Constitution III)
#   3. No @ts-ignore in staged files (Constitution III)
#   4. No hardcoded secrets patterns (Constitution VI)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(ts|tsx)$' | grep -v 'node_modules' | grep -v '\\.test\\.' | grep -v '\\.spec\\.' | grep -v '__mocks__')

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

ERRORS=""

CONSOLE_LOG_FILES=$(echo "$STAGED_FILES" | grep -v 'scripts/' | grep -v 'logger' | grep -v 'setup-mcp')
if [ -n "$CONSOLE_LOG_FILES" ]; then
  for file in $CONSOLE_LOG_FILES; do
    MATCHES=$(git diff --cached -- "$file" | grep '^\\+' | grep -v '^\\+\\+\\+' | grep 'console\\.log' || true)
    if [ -n "$MATCHES" ]; then
      ERRORS="$ERRORS\\n  BLOCKED [Constitution IV]: console.log found in $file"
    fi
  done
fi

for file in $STAGED_FILES; do
  MATCHES=$(git diff --cached -- "$file" | grep '^\\+' | grep -v '^\\+\\+\\+' | grep -E ':\\s*any\\b|as\\s+any\\b' | grep -v 'catch' || true)
  if [ -n "$MATCHES" ]; then
    ERRORS="$ERRORS\\n  BLOCKED [Constitution III]: TypeScript 'any' found in $file"
  fi
done

for file in $STAGED_FILES; do
  MATCHES=$(git diff --cached -- "$file" | grep '^\\+' | grep -v '^\\+\\+\\+' | grep '@ts-ignore' || true)
  if [ -n "$MATCHES" ]; then
    ERRORS="$ERRORS\\n  BLOCKED [Constitution III]: @ts-ignore found in $file"
  fi
done

if [ -n "$ERRORS" ]; then
  echo ""
  echo "wxKanban Pre-Commit: COMMIT BLOCKED"
  echo ""
  printf "$ERRORS\\n"
  echo ""
  echo "Fix these issues and try again."
  exit 1
fi

exit 0
`;
  }

  /**
   * Generate .vscode/tasks.json for MCP auto-start on project open
   */
  private generateVscodeTasksJson(): string {
    const tasks = {
      version: '2.0.0',
      tasks: [
        {
          label: 'Start MCP Server',
          type: 'shell',
          command: 'node',
          args: ['scripts/setup-mcp.mjs'],
          isBackground: true,
          problemMatcher: [],
          presentation: {
            reveal: 'silent',
            panel: 'dedicated',
            showReuseMessage: false,
          },
          runOptions: {
            runOn: 'folderOpen',
          },
        },
      ],
    };
    return JSON.stringify(tasks, null, 2) + '\n';
  }

  /**
   * Generate ProjectOverview template
   */
  /**
   * Resolve the ProjectOverview.md kit-file content.
   *
   * Per spec 024 FR-004 "Kit file synchronization": prefer the DB row in
   * projectdocuments (doctype='ProjectOverview'), fall back to doctype='overview'
   * (legacy AI-scaffolding naming), then to the empty starter template.
   */
  private async resolveProjectOverviewContent(projectId: string): Promise<string> {
    const rows = await db
      .select({ doctype: projectdocuments.doctype, content: projectdocuments.content })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectId),
          isNull(projectdocuments.specid),
          inArray(projectdocuments.doctype, ['ProjectOverview', 'overview'])
        )
      )
      .orderBy(desc(projectdocuments.updatedat));

    const preferred = rows.find((r: { doctype: string; content: string }) => r.doctype === 'ProjectOverview') ?? rows[0];
    if (preferred && preferred.content.trim().length > 0) return preferred.content;
    return this.generateProjectOverviewTemplate();
  }

  private generateProjectOverviewTemplate(): string {

    return `# Project Overview


## Project Name
<!-- Fill in your project name -->

## Description
<!-- Brief description of the project -->

## Target Users
<!-- Who will use this project? -->

## Core Modules / Features
<!-- List the main features -->

## Tech Stack
<!-- List technologies used -->

## Key Constraints or Requirements
<!-- Any special requirements -->

## Out of Scope
<!-- What's explicitly NOT included -->

---
*Fill out this template to provide context for AI assistants.*
`;
  }

  /**
   * Simple content hash
   */
  private hashContent(content: string): string {
    return kitEncryptionService.hashToken(content).substring(0, 16);
  }
}

// Export singleton instance
export const kitGenerationService = KitGenerationService.getInstance();
