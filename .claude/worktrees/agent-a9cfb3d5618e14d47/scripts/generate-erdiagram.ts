/**
 * CLI: regenerate the global Database ER Diagram document (SPEC-021 Amendment A, FR-015).
 *   npx tsx scripts/generate-erdiagram.ts          # introspect + render PDF + store
 *   npx tsx scripts/generate-erdiagram.ts --dry     # print markdown only (no PDF, no DB)
 */
import { ErDiagramGenerator } from '~/server/services/ErDiagramGenerator.js';

async function main() {
  const dry = process.argv.includes('--dry');
  if (dry) {
    const md = await ErDiagramGenerator.generateMarkdown();
    process.stdout.write(md + '\n');
    return;
  }
  const { id, bytes } = await ErDiagramGenerator.generateAndStore();
  console.log(`ER diagram stored. doc id=${id}, pdf bytes=${bytes}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('generate-erdiagram failed:', err);
    process.exit(1);
  });
