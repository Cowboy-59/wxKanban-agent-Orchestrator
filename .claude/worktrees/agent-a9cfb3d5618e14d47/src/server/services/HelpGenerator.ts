// [SCOPE 084 / T005 · SCOPE 052/T012] Help generator + projectdocuments upsert
//
// Renders the subscription-aware Help catalog to Markdown and upserts it as a
// doctype='help' row on a project — now per-locale. The interactive in-app page
// reads the live catalog directly; this stored document is the persisted artifact
// (FR-006) and a plain-text reference. English keeps title 'Help'; other locales
// get 'Help (<locale>)' so all six coexist as distinct rows.

import { stampMarkdown } from '@wxkanban/watermark';
import { APP_VERSION } from '~/client/version.js';
import { availabilityFor, type HelpFeature } from '~/shared/help/catalog.js';
import {
  getLocalizedHelp,
  HELP_UI,
  HELP_LOCALES,
  type HelpLocale,
} from '~/shared/help/i18n.js';
import { ProjectDocumentService } from '~/server/services/ProjectDocumentService.js';
import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('help-generator');

export const HELP_DOCTYPE = 'help';
export const HELP_TITLE = 'Help';

/** Stored-doc title for a locale (English stays 'Help'; others suffix the locale). */
export function helpTitleFor(locale: HelpLocale): string {
  return locale === 'en-US' ? HELP_TITLE : `${HELP_TITLE} (${locale})`;
}

// upsertDocument matches on (projectid, doctype, specid IS NULL) and ignores title, so
// each locale needs its OWN doctype to coexist as a distinct row. English keeps the
// canonical 'help' doctype (the only one any reader/doc-status/drift check looks for);
// other locales become 'help-<locale>' (e.g. 'help-fr-FR').
export function helpDoctypeFor(locale: HelpLocale): string {
  return locale === 'en-US' ? HELP_DOCTYPE : `${HELP_DOCTYPE}-${locale}`;
}

function availabilityCell(feature: HelpFeature, planId: string): string {
  const a = availabilityFor(feature, planId as HelpFeature['minPlan']);
  if (a.status === 'included') return a.note ? `✓ ${a.note}` : '✓';
  return '—';
}

/** Render the whole catalog to a readable Markdown reference in the given locale. */
export function generateHelpMarkdown(locale: HelpLocale = 'en-US'): string {
  const { plans, categories, categoryLabel, features } = getLocalizedHelp(locale);
  const U = HELP_UI[locale];

  const planCols = plans.map((p) => p.label).join(' | ');
  const planSep = plans.map(() => '---').join(' | ');

  const lines: string[] = [];
  lines.push(`# ${U.footer}`);
  lines.push('');
  lines.push(U.mdIntro);
  lines.push('');

  // Plans overview
  lines.push(`## ${U.mdPlansHeading}`);
  lines.push('');
  lines.push(`| ${U.mdPlansHeading} | ${U.mdColUsers} | ${U.mdColPrice} | ${U.mdColBestFor} |`);
  lines.push('| --- | --- | --- | --- |');
  for (const p of plans) {
    lines.push(`| **${p.label}** | ${p.userLimit} | ${p.price} | ${p.tagline} |`);
  }
  lines.push('');

  // Feature matrix per category
  for (const category of categories) {
    const groupFeatures = features.filter((f) => f.category === category);
    if (!groupFeatures.length) continue;
    lines.push(`## ${categoryLabel(category)}`);
    lines.push('');
    lines.push(`| ${U.mdColFeature} | ${planCols} |`);
    lines.push(`| --- | ${planSep} |`);
    for (const f of groupFeatures) {
      const cells = plans.map((p) => availabilityCell(f, p.id)).join(' | ');
      const admin = f.adminOnly ? ` _${U.mdAdminTag}_` : '';
      lines.push(`| **${f.title}**${admin} — ${f.description} | ${cells} |`);
    }
    lines.push('');
    for (const f of groupFeatures) {
      lines.push(`- **${f.title}** — ${f.howTo}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Regenerate and upsert the doctype='help' row on the given project for one locale. */
export async function regenerateHelpDoc(
  projectId: string,
  createdbyid: string | null,
  locale: HelpLocale = 'en-US',
): Promise<{ projectId: string; locale: HelpLocale; chars: number }> {
  const markdown = stampMarkdown(generateHelpMarkdown(locale), {
    kind: 'generated',
    version: APP_VERSION,
    generator: 'help',
  });

  await ProjectDocumentService.upsertDocument(
    projectId,
    helpDoctypeFor(locale),
    helpTitleFor(locale),
    markdown,
    createdbyid,
    true, // generated doc
  );

  logger.info({ projectId, locale, chars: markdown.length }, 'Help document regenerated');
  return { projectId, locale, chars: markdown.length };
}

/** Regenerate the doctype='help' row for ALL six locales on the given project. */
export async function regenerateAllHelpDocs(
  projectId: string,
  createdbyid: string | null,
): Promise<Array<{ projectId: string; locale: HelpLocale; chars: number }>> {
  const results = [];
  for (const locale of HELP_LOCALES) {
    results.push(await regenerateHelpDoc(projectId, createdbyid, locale));
  }
  return results;
}
// [SCOPE 084 / T005] END
