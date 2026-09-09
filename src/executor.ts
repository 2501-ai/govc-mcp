import type { GovcToolDef } from './commands';
import { sanitize } from './sanitizer';

export interface GovcResult {
  success: boolean;
  exitCode: number;
  data?: unknown;
  raw?: string;
  error?: string;
}

const GOVC_BIN = process.env.GOVC_BIN || 'govc';

/**
 * Bun.spawn snapshots the environment at process start, so a child never sees a
 * variable assigned to process.env at runtime - which is how the VMWARE_ prefix
 * is unwrapped in index.ts. Pass the live object explicitly or govc launches
 * without credentials and reports an empty URL.
 */
const spawnEnv = (): Record<string, string | undefined> => process.env;
const EXEC_TIMEOUT_MS = parseInt(process.env.GOVC_TIMEOUT_MS || '120000', 10);

/**
 * Build CLI args from flags + positional args.
 * - boolean true  → `-flag=true`
 * - boolean false → `-flag=false`
 * - string/number → `-flag value`
 */
const buildArgs = (flags: Record<string, unknown>, positional: string[], json: boolean): string[] => {
  const args: string[] = [];

  if (json) args.push('-json');

  for (const [key, val] of Object.entries(flags)) {
    if (val === undefined || val === null || val === '') continue;
    if (typeof val === 'boolean') {
      args.push(`-${key}=${val}`);
    } else {
      args.push(`-${key}`, String(val));
    }
  }

  args.push(...positional);
  return args;
};

/**
 * Split a string into args, respecting simple quoting.
 */
export const splitArgs = (input: string): string[] => {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const ch of input) {
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current) args.push(current);
  return args;
};

/**
 * Execute a govc command via Bun subprocess.
 */
export const execGovc = async (
  command: string,
  flags: Record<string, unknown> = {},
  positional: string[] = [],
  json = true,
): Promise<GovcResult> => {
  const args = [GOVC_BIN, command, ...buildArgs(flags, positional, json)];

  console.error(`[govc] ${args.join(' ')}`);

  let timer: Timer | undefined;

  try {
    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: spawnEnv(),
    });

    // Race against timeout — timer is cleaned up in `finally`
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`govc timed out after ${EXEC_TIMEOUT_MS}ms`));
      }, EXEC_TIMEOUT_MS);
    });

    const [exitCode, stdoutText, stderrText] = await Promise.race([
      Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]),
      timeout,
    ]);

    if (exitCode !== 0) {
      return {
        success: false,
        exitCode,
        error: stderrText.trim() || `govc exited with code ${exitCode}`,
        raw: stdoutText.trim() || undefined,
      };
    }

    const raw = stdoutText.trim();

    if (json && raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        const data = sanitize(parsed) ?? parsed;
        return { success: true, exitCode: 0, data };
      } catch {
        // Not valid JSON – some commands don't support -json, return raw
      }
    }

    return { success: true, exitCode: 0, raw: raw || undefined };
  } catch (err) {
    return {
      success: false,
      exitCode: -1,
      error: err instanceof Error ? err.message : 'Unknown error spawning govc',
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Get help text for a govc command (`govc <cmd> -h`).
 * Uses the same timeout as `execGovc` to avoid hanging indefinitely.
 */
export const execGovcHelp = async (command: string): Promise<string> => {
  let timer: Timer | undefined;

  try {
    const proc = Bun.spawn([GOVC_BIN, command, '-h'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: spawnEnv(),
    });

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`govc help timed out after ${EXEC_TIMEOUT_MS}ms`));
      }, EXEC_TIMEOUT_MS);
    });

    const [stdout, stderr] = await Promise.race([
      Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]),
      timeout,
    ]);

    // govc prints help to stderr
    return (stderr + stdout).trim() || `No help available for '${command}'`;
  } catch {
    return `Failed to get help for '${command}'`;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Build an MCP tool handler for a given GovcToolDef.
 */
export const makeHandler = (def: GovcToolDef) => async (args: Record<string, unknown>) => {
  const flags: Record<string, unknown> = {};
  const positional: string[] = [];

  for (const [key, val] of Object.entries(args)) {
    if (key === '_args') {
      const raw = String(val).trim();
      if (raw) positional.push(...splitArgs(raw));
    } else if (key in def.flags) {
      flags[key] = val;
    }
  }

  return execGovc(def.command, flags, positional);
};
