// Script to copy all repo memory rules into a new project's _wxAI/rules directory
import fs from 'fs-extra';
import path from 'path';

const REPO_MEMORY_DIR = path.resolve(__dirname, '../../../memories/repo');
const DEST_RULES_DIR = path.resolve(process.cwd(), '_wxAI/rules');

async function copyRepoRulesToProject() {
  await fs.ensureDir(DEST_RULES_DIR);
  const files = await fs.readdir(REPO_MEMORY_DIR);
  for (const file of files) {
    if (file.endsWith('.md')) {
      await fs.copyFile(
        path.join(REPO_MEMORY_DIR, file),
        path.join(DEST_RULES_DIR, file)
      );
    }
  }
  // Optionally, update or create an index file
  const indexPath = path.join(DEST_RULES_DIR, 'index.md');
  const ruleLinks = files.filter(f => f.endsWith('.md')).map(f => `- [${f}](./${f})`).join('\n');
  await fs.writeFile(indexPath, `# Project Rules Index\n\n${ruleLinks}\n`);
  console.log('Repo memory rules copied to _wxAI/rules and indexed.');
}

copyRepoRulesToProject().catch(console.error);
