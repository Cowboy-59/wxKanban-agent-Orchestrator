// Spec 029 / T013 — stdin stub for testing interactive prompts.
//
// Lets a test feed pre-canned answers to code that reads from
// `process.stdin` via the node:readline module (or anything that uses
// stdin's `data` events). Returns a `restore()` to swap stdin back.
//
// Usage:
//   const stub = stubStdin(['y', 'n']);
//   // ...code that prompts twice...
//   stub.restore();

import { Readable } from 'stream';

export interface StdinStubHandle {
  restore: () => void;
}

// [SCOPE 029 / T013] BEGIN — stubStdin (feed pre-canned answers to readline)
//
// Each entry in `responses` is emitted as a single line (newline appended)
// before the stream ends. readline's `question(prompt, cb)` resolves the
// next callback with the next pre-canned line.
export function stubStdin(responses: string[]): StdinStubHandle {
  const original = process.stdin;
  const lines = responses.map((line) => `${line}\n`);
  const buffer = lines.join('');
  const replacement = Readable.from([buffer], { objectMode: false });
  // Force TTY-ness to match what FR-018 expects; consumers gating on
  // `process.stdin.isTTY` see a true value.
  (replacement as unknown as { isTTY?: boolean }).isTTY = true;
  Object.defineProperty(process, 'stdin', {
    value: replacement,
    configurable: true,
    writable: false,
  });
  return {
    restore: () => {
      Object.defineProperty(process, 'stdin', {
        value: original,
        configurable: true,
        writable: false,
      });
    },
  };
}
// [SCOPE 029 / T013] END
