import { createServer, Server } from "net";

export const DEFAULT_PORT_SCAN_RANGE = 50;

// [SCOPE 027 / T002] BEGIN — core/runtime/port-autoselect.ts — 50-port scan
export class PortRangeExhaustedError extends Error {
  constructor(
    public readonly preferredPort: number,
    public readonly scanRange: number,
    public readonly attempts: number[],
  ) {
    super(
      `Cannot find a free port in range ${preferredPort}–${preferredPort + scanRange - 1}. Attempted ${attempts.length} ports.`,
    );
    this.name = "PortRangeExhaustedError";
  }
}
// [SCOPE 027 / T002] END

// [SCOPE 027 / T002] BEGIN — core/runtime/port-autoselect.ts — 50-port scan
export async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "127.0.0.1");
  });
}
// [SCOPE 027 / T002] END

// [SCOPE 027 / T002] BEGIN — core/runtime/port-autoselect.ts — 50-port scan
export async function findFreePort(
  preferredPort: number,
  scanRange: number = DEFAULT_PORT_SCAN_RANGE,
): Promise<number> {
  const attempts: number[] = [];
  for (let offset = 0; offset < scanRange; offset++) {
    const candidate = preferredPort + offset;
    attempts.push(candidate);
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }
  throw new PortRangeExhaustedError(preferredPort, scanRange, attempts);
}
// [SCOPE 027 / T002] END

// [SCOPE 027 / T002] BEGIN — core/runtime/port-autoselect.ts — 50-port scan
export async function bindWithAutoselect(opts: {
  preferredPort: number;
  scanRange?: number;
  onListen: (server: Server, port: number) => void;
  buildServer: () => Server;
}): Promise<{ server: Server; port: number }> {
  const range = opts.scanRange ?? DEFAULT_PORT_SCAN_RANGE;
  const port = await findFreePort(opts.preferredPort, range);
  const server = opts.buildServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  opts.onListen(server, port);
  return { server, port };
}
// [SCOPE 027 / T002] END
