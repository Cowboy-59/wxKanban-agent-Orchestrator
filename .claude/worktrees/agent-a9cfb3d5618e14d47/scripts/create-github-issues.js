#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read tasks.md
const tasksPath = path.join(__dirname, '..', 'specs', '005-opensource-mapping', 'tasks.md');
const content = fs.readFileSync(tasksPath, 'utf-8');

// Extract tasks
const taskRegex = /^- \[(.)\] (T\d{3})(?: \[P\])?(?: \[(US\d+)\])? (.+)$/gm;
const tasks = [];
let match;

while ((match = taskRegex.exec(content)) !== null) {
  tasks.push({
    status: match[1] === 'X' ? 'completed' : (match[1] === 'S' ? 'skipped' : 'pending'),
    id: match[2],
    userStory: match[3] || null,
    description: match[4].trim(),
    isParallel: match[0].includes('[P]')
  });
}

console.log(`Found ${tasks.length} tasks to create as issues`);

// Determine phase for each task
function getPhase(taskId) {
  const num = parseInt(taskId.substring(1));
  if (num <= 7) return { phase: 'setup', label: 'phase:setup' };
  if (num <= 30) return { phase: 'foundation', label: 'phase:foundation' };
  if (num <= 44) return { phase: 'US1', label: 'user-story:US1' };
  if (num <= 56) return { phase: 'US2', label: 'user-story:US2' };
  if (num <= 80) return { phase: 'US3', label: 'user-story:US3' };
  if (num <= 95) return { phase: 'US4', label: 'user-story:US4' };
  if (num <= 112) return { phase: 'US5', label: 'user-story:US5' };
  if (num <= 131) return { phase: 'US6', label: 'user-story:US6' };
  if (num <= 150) return { phase: 'US7', label: 'user-story:US7' };
  if (num <= 159) return { phase: 'US8', label: 'user-story:US8' };
  return { phase: 'polish', label: 'phase:polish' };
}

// Create issues
let created = 0;
let errors = 0;

for (const task of tasks) {
  const phaseInfo = getPhase(task.id);
  const labels = ['feature:mapping', phaseInfo.label];
  if (task.isParallel) labels.push('parallelizable');

  const title = `[${task.id}] ${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}`;

  const body = `## Task Details

**Task ID**: ${task.id}
**Phase**: ${phaseInfo.phase}
**Status**: ${task.status}
${task.userStory ? `**User Story**: ${task.userStory}` : ''}
${task.isParallel ? '**Parallelizable**: Yes' : ''}

## Description

${task.description}

---
*Auto-generated from specs/005-opensource-mapping/tasks.md*
*Feature: Open-Source Mapping Integration*`;

  const labelArgs = labels.map(l => `--label "${l}"`).join(' ');

  try {
    const cmd = `gh issue create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" ${labelArgs}`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    created++;
    console.log(`✓ ${task.id}: ${result.trim()}`);
  } catch (err) {
    errors++;
    console.error(`✗ ${task.id}: ${err.message}`);
  }

  // Rate limiting - small delay between requests
  if (created % 10 === 0) {
    console.log(`Progress: ${created}/${tasks.length} issues created`);
  }
}

console.log(`\nComplete: ${created} issues created, ${errors} errors`);
