// Minimal `vscode` stub so services that import the API can be unit-tested in
// plain Node. Aliased in vitest.config.ts. Only the surface the tests actually
// touch is implemented; anything else is left undefined on purpose so a test
// that strays outside that surface fails loudly instead of silently passing.

export interface Uri { fsPath: string }
export interface WorkspaceFolder { uri: Uri }

// Tests set this to control what findRoot() sees.
export const __state: { folders: WorkspaceFolder[] } = { folders: [] };

export const workspace = {
  get workspaceFolders(): WorkspaceFolder[] | undefined {
    return __state.folders.length ? __state.folders : undefined;
  },
  // [SCOPE 145 / T008] Only `get` with its default: tests inject config through deps instead.
  getConfiguration: () => ({ get: <T>(_key: string, fallback: T): T => fallback }),
};

// [SCOPE 145 / T008] What ProjectAgentProcess touches: messages are recorded so a test can
// assert exactly what the developer was shown; the output and status bar are inert records.
export const __messages: { info: string[]; warning: string[] } = { info: [], warning: [] };

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;

export const window = {
  createTerminal: () => ({ show: () => undefined, sendText: () => undefined }),
  showInformationMessage: (message: string) => {
    __messages.info.push(message);
    return Promise.resolve(undefined);
  },
  showWarningMessage: (message: string) => {
    __messages.warning.push(message);
    return Promise.resolve(undefined);
  },
  createOutputChannel: () => ({
    lines: [] as string[],
    append(text: string) {
      this.lines.push(text);
    },
    appendLine(text: string) {
      this.lines.push(`${text}\n`);
    },
    show: () => undefined,
    dispose: () => undefined,
  }),
  createStatusBarItem: () => ({
    text: '',
    tooltip: '' as string | undefined,
    command: undefined as string | undefined,
    show: () => undefined,
    dispose: () => undefined,
  }),
};

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: unknown) {}
}
export class ThemeColor {
  constructor(public readonly id: string) {}
}
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export class TreeItem {
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  contextValue?: string;
  command?: unknown;
  constructor(public readonly label: string, public readonly collapsibleState?: number) {}
}
export class EventEmitter<T> {
  event = (_listener: (e: T) => unknown) => ({ dispose: () => undefined });
  fire(_e?: T): void {}
  dispose(): void {}
}
export const commands = { registerCommand: () => ({ dispose: () => undefined }) };
