import { describe, expect, it } from 'vitest';
import { MCP_HELP_TEXT, AVAILABLE_COMMANDS, renderAvailableCommandsLines, renderHelpText } from '../src/utils/help-context.js';

describe('help context', () => {
  it('renders every command with both alias and full name', () => {
    for (const command of AVAILABLE_COMMANDS) {
      expect(MCP_HELP_TEXT).toContain(`\`${command.alias}\``);
      expect(MCP_HELP_TEXT).toContain(`\`${command.fullName}\``);
    }
  });

  it('keeps command catalog entries for full names and aliases', () => {
    const createSpecs = AVAILABLE_COMMANDS.find(c => c.fullName === 'project.create_specs');
    const buildScope = AVAILABLE_COMMANDS.find(c => c.fullName === 'project.buildscope');
    const implement = AVAILABLE_COMMANDS.find(c => c.fullName === 'project.implement');
    const gitCommit = AVAILABLE_COMMANDS.find(c => c.fullName === 'wxAIGit.commit');

    expect(createSpecs?.alias).toBe('createspecs');
    expect(buildScope?.alias).toBe('buildscope');
    expect(implement?.alias).toBe('implement');
    expect(gitCommit?.alias).toBe('gitcommit');
  });

  it('builds the shared command table from the registry', () => {
    const lines = renderAvailableCommandsLines();

    expect(lines[0]).toContain('Alias');

    for (const command of AVAILABLE_COMMANDS) {
      const matchingRow = lines.find((line) =>
        line.includes(`\`${command.alias}\``) && line.includes(`\`${command.fullName}\``)
      );

      expect(matchingRow).toBeTruthy();
    }
  });

  it('renders git-only help mode', () => {
    const gitHelp = renderHelpText('git');

    expect(gitHelp).toContain('help --git');
    expect(gitHelp).toContain('`gitcommit`');
    expect(gitHelp).toContain('`wxAIGit.commit`');
    expect(gitHelp).not.toContain('`createspecs`');
  });

  it('renders docs-only help mode', () => {
    const docsHelp = renderHelpText('docs');

    expect(docsHelp).toContain('help --docs');
    expect(docsHelp).toContain('`createspecs`');
    expect(docsHelp).toContain('`project.create_specs`');
    expect(docsHelp).not.toContain('`gitcommit`');
  });

  it('describes the guided-first scope workflow', () => {
    const buildScope = AVAILABLE_COMMANDS.find(c => c.fullName === 'project.buildscope');
    const validateScope = AVAILABLE_COMMANDS.find(c => c.fullName === 'project.validatescope');
    const docsHelp = renderHelpText('all');

    expect(buildScope?.description).toContain('Guided-first');
    expect(validateScope?.description).toContain('placeholders');
    expect(docsHelp).toContain('Use project.buildscope first');
    expect(docsHelp).toContain('Use project.validatescope to clear blockers');
  });
});
