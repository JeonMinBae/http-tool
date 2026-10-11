import type { TestResult } from "../script/protocol";

export interface RunItem {
  path: string;
  name: string;
}

/** The parts of an execution outcome the runner needs. */
export interface RunOutcome {
  result?: { status: number; elapsedMs: number };
  error?: string;
  tests: TestResult[];
  scriptError?: string;
}

export interface RunOptions {
  items: RunItem[];
  iterations: number;
  delayMs: number;
  stopOnFailure: boolean;
  signal: AbortSignal;
  execute(item: RunItem): Promise<RunOutcome>;
}

export interface RunResult extends RunItem {
  iteration: number;
  outcome: RunOutcome;
  /** Transport/script error or at least one failed test. */
  failed: boolean;
}

export interface RunSummary {
  total: number;
  failed: number;
  testsPassed: number;
  testsFailed: number;
  stopped: boolean;
  elapsedMs: number;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

export async function runCollection(opts: RunOptions, onProgress: (r: RunResult) => void): Promise<RunSummary> {
  const started = Date.now();
  const results: RunResult[] = [];
  let stopped = false;
  outer: for (let iteration = 1; iteration <= opts.iterations; iteration++) {
    for (const [i, item] of opts.items.entries()) {
      if (opts.signal.aborted) {
        stopped = true;
        break outer;
      }
      const outcome = await opts.execute(item);
      const failed = !!outcome.error || !!outcome.scriptError || outcome.tests.some((t) => !t.passed);
      const r: RunResult = { ...item, iteration, outcome, failed };
      results.push(r);
      onProgress(r);
      if (opts.stopOnFailure && failed) {
        stopped = true;
        break outer;
      }
      const last = iteration === opts.iterations && i === opts.items.length - 1;
      if (opts.delayMs > 0 && !last) await delay(opts.delayMs, opts.signal);
    }
  }
  if (opts.signal.aborted) stopped = true;
  const tests = results.flatMap((r) => r.outcome.tests);
  return {
    total: results.length,
    failed: results.filter((r) => r.failed).length,
    testsPassed: tests.filter((t) => t.passed).length,
    testsFailed: tests.filter((t) => !t.passed).length,
    stopped,
    elapsedMs: Date.now() - started,
  };
}

export interface RunProgress {
  total: number;
  /** 0..1 */
  ratio: number;
  /** Item running now (or waiting out the delay before it); null once all are done. */
  current: { iteration: number; index: number } | null;
}

/** Progress for `done` finished results of `itemCount` items run `iterations` times, in runCollection order. */
export function runProgress(itemCount: number, iterations: number, done: number): RunProgress {
  const total = itemCount * iterations;
  if (total === 0) return { total, ratio: 0, current: null };
  return {
    total,
    ratio: Math.min(1, done / total),
    current: done < total ? { iteration: Math.floor(done / itemCount) + 1, index: done % itemCount } : null,
  };
}
