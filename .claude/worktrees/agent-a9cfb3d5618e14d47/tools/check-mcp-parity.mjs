import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const workspaceRoot = process.cwd();
const leftRoot = resolve(workspaceRoot, 'mcp-server');
const rightRoot = resolve(workspaceRoot, 'Project-Init-kit', 'mcp-server');
const reportPathArgIndex = process.argv.indexOf('--report');
const reportPath = reportPathArgIndex >= 0
  ? resolve(workspaceRoot, process.argv[reportPathArgIndex + 1])
  : resolve(workspaceRoot, 'parity-report.json');
const gateMode = (process.env.PARITY_GATE_MODE || 'advisory').toLowerCase();

const includeRoots = ['src', 'scripts', 'tests', 'package.json', 'tsconfig.json', 'README.md'];
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md']);
const transportExceptions = new Set([
  // Root package.json always differs: HTTP transport deps (express/cors/eventsource)
  // and HTTP-specific scripts (build:http, start:http, dev:http) are main-only.
  // Shared package versions are kept in sync manually.
  'package.json',
  // Legacy named exceptions
  'start-http.mjs',
  '.env.example',
  '.env',
  'env.example',
  'decrypted-url.txt',
  'restore-db-url.mjs',
  'decrypt-url.mjs',
  'fix-db-url.mjs',
  'init-project.mjs',
  'verify-output.txt',
  'verify-output2.txt'
]);

function shouldInclude(relativePath) {
  return includeRoots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`));
}

function listFiles(baseDir) {
  const files = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir)) {
      const absolutePath = join(currentDir, entry);
      const relativePath = relative(baseDir, absolutePath).replace(/\\/g, '/');
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) {
        if (['node_modules', 'dist', '.git'].includes(entry)) {
          continue;
        }
        walk(absolutePath);
        continue;
      }

      if (!shouldInclude(relativePath)) {
        continue;
      }

      if (!allowedExtensions.has(extname(relativePath)) && !['package.json', 'tsconfig.json', 'README.md'].includes(relativePath)) {
        continue;
      }

      files.push(relativePath);
    }
  }

  walk(baseDir);
  return files.sort();
}

function hashFile(baseDir, relativePath) {
  return createHash('sha256').update(readFileSync(join(baseDir, relativePath))).digest('hex');
}

const leftFiles = listFiles(leftRoot);
const rightFiles = listFiles(rightRoot);
const allFiles = [...new Set([...leftFiles, ...rightFiles])].sort();

const findings = [];
const exceptions = [];

for (const file of allFiles) {
  const leftHas = leftFiles.includes(file);
  const rightHas = rightFiles.includes(file);

  if (transportExceptions.has(file) || transportExceptions.has(file.split('/').pop() || '')) {
    exceptions.push({ path: file, reason: 'transport-exception' });
    continue;
  }

  if (!leftHas || !rightHas) {
    findings.push({
      severity: 'critical',
      path: file,
      type: 'missing-file',
      message: leftHas ? 'File missing from kit MCP tree' : 'File missing from main MCP tree'
    });
    continue;
  }

  const leftHash = hashFile(leftRoot, file);
  const rightHash = hashFile(rightRoot, file);
  if (leftHash !== rightHash) {
    findings.push({
      severity: file.startsWith('src/') ? 'high' : 'medium',
      path: file,
      type: 'content-mismatch',
      message: 'File contents differ between MCP trees'
    });
  }
}

const summary = findings.reduce((acc, finding) => {
  acc.total += 1;
  acc.bySeverity[finding.severity] = (acc.bySeverity[finding.severity] || 0) + 1;
  return acc;
}, { total: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } });

const blocking = gateMode === 'mandatory' && findings.some((finding) => finding.severity === 'critical' || finding.severity === 'high');

const report = {
  generatedAt: new Date().toISOString(),
  gateMode,
  source: 'tools/check-mcp-parity.mjs',
  checkedRoots: {
    main: relative(workspaceRoot, leftRoot).replace(/\\/g, '/'),
    kit: relative(workspaceRoot, rightRoot).replace(/\\/g, '/'),
  },
  summary,
  blocking,
  findings,
  exceptions,
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Parity report written to ${reportPath}`);
console.log(JSON.stringify(summary));

if (blocking) {
  console.error('Parity gate blocking: critical/high drift detected in mandatory mode.');
  process.exit(1);
}
