import { isPidAlive } from "./state-file";

export const DEFAULT_WATCHER_INTERVAL_MS = 2000;
export const MISS_THRESHOLD_FOR_FIRE = 2;

export interface ParentWatcher {
  stop(): void;
}

export interface ParentWatcherOptions {
  intervalMs?: number;
  missThreshold?: number;
}

// [SCOPE 027 / T003] BEGIN — core/runtime/parent-watcher.ts — 2-miss hysteresis
export function startParentWatcher(
  parentpid: number,
  onParentGone: () => void,
  opts: ParentWatcherOptions = {},
): ParentWatcher {
  // Container/server deployments (App Runner, ECS, Fargate, etc.) run the Node
  // process as PID 1, which makes process.ppid return 0. The watcher would fire
  // immediately and kill the production service. Skip when MCP_SKIP_PARENT_WATCHER
  // is set, or when running as PID 1 with no real parent.
  const skipEnv = process.env["MCP_SKIP_PARENT_WATCHER"];
  if (skipEnv === "true" || skipEnv === "1") {
    return { stop(): void { /* no-op */ } };
  }
  if (process.pid === 1 && (parentpid === 0 || parentpid === 1)) {
    return { stop(): void { /* no-op */ } };
  }
  const intervalMs = opts.intervalMs ?? DEFAULT_WATCHER_INTERVAL_MS;
  const missThreshold = opts.missThreshold ?? MISS_THRESHOLD_FOR_FIRE;
  let misses = 0;
  let stopped = false;

  const handle = setInterval(() => {
    if (stopped) return;
    if (isPidAlive(parentpid)) {
      misses = 0;
      return;
    }
    misses += 1;
    if (misses >= missThreshold) {
      stopped = true;
      clearInterval(handle);
      try {
        onParentGone();
      } catch {
        // swallow — watcher must not crash the host process
      }
    }
  }, intervalMs);

  if (typeof handle.unref === "function") {
    handle.unref();
  }

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearInterval(handle);
    },
  };
}
// [SCOPE 027 / T003] END

// [SCOPE 027 / T003] BEGIN — core/runtime/parent-watcher.ts — 2-miss hysteresis
export function resolveParentPid(): number {
  const env = process.env["KIT_PARENT_PID"];
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return process.ppid;
}
// [SCOPE 027 / T003] END
