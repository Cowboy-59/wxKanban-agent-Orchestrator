type BridgeHandler<TArgs = Record<string, unknown>, TResult = unknown> = (args: TArgs) => Promise<TResult>;

interface BridgeRoute {
  canonical: string;
  aliases: string[];
  handler: BridgeHandler;
}

export class CLIBridgeRouter {
  private readonly routes = new Map<string, BridgeRoute>();
  private readonly aliasmap = new Map<string, string>();

  register(command: string, handler: BridgeHandler, aliases: string[] = []): void {
    this.routes.set(command, { canonical: command, aliases, handler });
    for (const alias of aliases) {
      this.aliasmap.set(alias, command);
    }
  }

  resolve(command: string): string | null {
    if (this.routes.has(command)) {
      return command;
    }
    return this.aliasmap.get(command) ?? null;
  }

  validateSurface(expected: Array<{ canonical: string; aliases: string[] }>): string[] {
    const mismatches: string[] = [];
    for (const item of expected) {
      const route = this.routes.get(item.canonical);
      if (!route) {
        mismatches.push(`Missing canonical command: ${item.canonical}`);
        continue;
      }

      for (const alias of item.aliases) {
        if (this.aliasmap.get(alias) !== item.canonical) {
          mismatches.push(`Alias ${alias} does not resolve to ${item.canonical}`);
        }
      }
    }
    return mismatches;
  }

  async route(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const resolved = this.resolve(command);
    if (!resolved) {
      throw new Error(`Unknown bridge command: ${command}`);
    }

    const route = this.routes.get(resolved);
    if (!route) {
      throw new Error(`Unregistered bridge command: ${resolved}`);
    }

    return route.handler(args);
  }
}
