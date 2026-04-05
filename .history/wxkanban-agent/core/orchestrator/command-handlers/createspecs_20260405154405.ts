// createspecs command handler with integrated test plan logic
import * as fs from 'fs-extra';
import * as path from 'path';

// Simulate a prompt/response loop (replace with real UI or CLI integration as needed)
async function promptUser(question: string, defaultValue?: string): Promise<string> {
  // Placeholder: Replace with actual prompt logic
  console.log(question + (defaultValue ? ` [default: ${defaultValue}]` : ''));
  return defaultValue || '';
}

function shouldRecommendTestPlan(specContent: string): { needed: boolean, reason: string } {
  // Simple heuristic: recommend if spec mentions user, UI, API, acceptance, or test
  const lower = specContent.toLowerCase();
  if (lower.includes('user') || lower.includes('ui') || lower.includes('api') || lower.includes('acceptance') || lower.includes('test')) {
    return { needed: true, reason: 'Spec includes user-facing, API, or acceptance criteria.' };
  }
  return { needed: false, reason: 'Spec appears trivial or not testable.' };
}

export async function handleCreateSpecs({
  nnn,
  specFilename,
  specContent,
  user = 'unknown',
}: {
  nnn: string;
  specFilename: string;
  specContent: string;
  user?: string;
}): Promise<{ result: any; audit: any }> {
  const start = new Date();
  const log: string[] = [];

  // Write or update the spec file
  const specDir = path.join('specs');
  await fs.ensureDir(specDir);
  const specFilePath = path.join(specDir, `${nnn}-${specFilename}.md`);
  await fs.writeFile(specFilePath, specContent);
  log.push(`Wrote spec file: ${specFilePath}`);

  // Test plan logic
  const { needed, reason } = shouldRecommendTestPlan(specContent);
  let testPlanDecision = 'skipped';
  let testPlanReason = reason;
  if (needed) {
    const userWantsTestPlan = await promptUser(
      `A test plan is recommended: ${reason}. Generate test plan? (yes/no)`, 'yes'
    );
    if (userWantsTestPlan.toLowerCase() === 'yes') {
      // Prompt for test plan content
      const testPlanContent = await promptUser('Describe the test plan (acceptance criteria, test cases, automation strategy):');
      const testPlanFilePath = path.join(specDir, `${nnn}-testplan.md`);
      await fs.writeFile(testPlanFilePath, testPlanContent);
      log.push(`Wrote test plan file: ${testPlanFilePath}`);
      testPlanDecision = 'created';
      testPlanReason = 'User accepted recommendation.';
    } else {
      const overrideReason = await promptUser(
        'Are you sure you want to proceed without a test plan? Please provide a reason:'
      );
      log.push(`Test plan skipped by user. Reason: ${overrideReason}`);
      testPlanDecision = 'skipped-by-user';
      testPlanReason = overrideReason;
    }
  } else {
    log.push('Test plan not recommended by heuristic.');
  }

  // Log everything
  const audit = {
    timestamp: start.toISOString(),
    command: 'createspecs',
    input: { nnn, specFilename, specContent },
    result: { specFilePath, testPlanDecision, testPlanReason },
    user,
  };
  await fs.appendFile('createspecs-audit.log', log.join('\n') + '\n');

  return { result: { specFilePath, testPlanDecision, testPlanReason }, audit };
}
