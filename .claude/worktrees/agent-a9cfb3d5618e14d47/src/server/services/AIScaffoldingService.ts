import { createLogger } from '~/server/lib/logger.js';
import { generateOnce } from '~/server/ai/llm-provider.js';
import { ProjectDocumentService } from './ProjectDocumentService.js';

const logger = createLogger('ai-scaffolding-service');

export class AIScaffoldingService {
  /**
   * Async scaffolding — never throws. Catches all errors and logs.
   * Called via setImmediate after project creation response is sent.
   *
   * Generates the project overview document ONLY. Auto-generation of draft
   * scope stubs (the old Step 2, spec 008 FR-008) was withdrawn 2026-09-22: it
   * invented three to six speculative scopes in every new project — near-always
   * Authentication, Dashboard and Landing Page — which then had to be found and
   * deleted by hand before real scopes from `buildscope` could be numbered
   * cleanly. Scopes are now created only by an explicit act: `buildscope`, the
   * web "new scope" action, or an accepted feedback seed.
   */
  static async scaffold(
    projectid: string,
    projectname: string,
    description: string | null,
    createdbyid: string
  ): Promise<void> {
    try {
      logger.info({ projectid, projectname }, 'AI scaffolding started');

      // Generate the project overview
      const overviewPrompt = `You are a technical project manager. Generate a concise project overview document for the following project.

Project Name: ${projectname}
Description: ${description ?? 'No description provided'}

Write the overview in markdown with exactly these sections:
# ${projectname} — Overview

## What We Are Building
(2-3 paragraph 10,000-foot description)

## Core Modules
(Bulleted list of major functional areas)

## Target Users
(Who uses this and how)

## Integration Points
(External systems, APIs, or data sources)

## Tech Stack
(Inferred from description, or "To be determined")

## Key Constraints
(Non-functional requirements, security notes, scale targets)

Be concise. Focus on business value, not implementation details.`;

      const overviewContent = await generateOnce(overviewPrompt);

      await ProjectDocumentService.upsertDocument(
        projectid,
        'overview',
        `${projectname} — Overview`,
        overviewContent,
        createdbyid
      );

      logger.info({ projectid }, 'AI scaffolding completed — overview generated, no scopes created');
    } catch (err) {
      logger.warn(
        { projectid, err: err instanceof Error ? err.message : String(err) },
        'AI scaffolding failed — project saved, overview will show retry option'
      );
      // Do not re-throw — scaffolding failure must not affect project creation
    }
  }
}
