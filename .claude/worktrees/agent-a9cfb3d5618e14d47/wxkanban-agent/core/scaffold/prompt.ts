import * as readline from "readline";

export interface ConfirmOptions {
  assumeYes?: boolean;
  defaultNo?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  isTTY?: boolean;
}

// [SCOPE 036 / T004] BEGIN — core/scaffold/prompt.ts — TTY-aware confirm honoring --yes
export async function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (opts.assumeYes) return true;
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const isTTY = opts.isTTY ?? (process.stdin.isTTY === true);
  if (!isTTY) return false;

  const rl = readline.createInterface({ input, output });
  const suffix = opts.defaultNo === false ? " [Y/n] " : " [y/N] ";
  try {
    const answer: string = await new Promise((res) => {
      rl.question(message + suffix, (a) => res(a));
    });
    const norm = answer.trim().toLowerCase();
    if (opts.defaultNo === false) return norm === "" || norm === "y" || norm === "yes";
    return norm === "y" || norm === "yes";
  } finally {
    rl.close();
  }
}
// [SCOPE 036 / T004] END
