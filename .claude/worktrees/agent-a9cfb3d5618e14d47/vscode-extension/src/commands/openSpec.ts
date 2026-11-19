import * as vscode from 'vscode';

// [SCOPE 042 / T018] BEGIN — openRelatedSpec (open the scope's spec/Project-Scope file)
export async function openRelatedSpec(specNumber: string): Promise<void> {
  // Prefer the detailed spec; fall back to the Project-Scope charter.
  const detailed = await vscode.workspace.findFiles(`specs/${specNumber}-*/spec.md`, '**/node_modules/**', 1);
  const charter = detailed.length
    ? []
    : await vscode.workspace.findFiles(`specs/Project-Scope/${specNumber}-*.md`, '**/node_modules/**', 1);
  const target = detailed[0] ?? charter[0];

  if (!target) {
    void vscode.window.showWarningMessage(`wxKanban: no spec file found for scope ${specNumber}.`);
    return;
  }
  await vscode.window.showTextDocument(target, { preview: true });
}
// [SCOPE 042 / T018] END
