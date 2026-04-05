// Script to copy all repo memory rules into a new project's _wxAI/rules directory
import fs from 'fs-extra';
import path from 'path';

const REPO_MEMORY_DIR = path.resolve(__dirname, '../../../memories/repo');
const DEST_RULES_DIR = path.resolve(process.cwd(), '_wxAI/rules');

async function copyRepoMemoryToProject() {
  await fs.ensureDir(DEST_RULES_DIR);
  const files = await fs.readdir(REPO_MEMORY_DIR);
  for (const file of files) {
    const src = path.join(REPO_MEMORY_DIR, file);
    const dest = path.join(DEST_RULES_DIR, file);
    await fs.copyFile(src, dest);
  }
  // Index all copied files
  const indexPath = path.join(DEST_RULES_DIR, 'index.md');
  const fileLinks = files.map(f => `- [${f}](./${f})`).join('\n');
  await fs.writeFile(indexPath, `# Project Memory & Enforcement Index\n\n${fileLinks}\n`);
  console.log('All repo memory and enforcement files copied to _wxAI/rules and indexed.');
}

// To run on every update, call this script from your postinstall or update script in package.json or kit generator.
if (require.main === module) {
  copyRepoMemoryToProject().catch(console.error);
}
