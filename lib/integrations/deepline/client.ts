import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEEPLINE_CLI = process.env.DEEPLINE_CLI_PATH || 'deepline';
const TIMEOUT_MS = 30_000;

// Whitelist of allowed Deepline subcommands
const ALLOWED_COMMANDS = ['enrich', 'sync', 'export', 'status'] as const;
type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

export interface DeeplineResult {
  success: boolean;
  output?: string;
  error?: string;
}

function validateCommand(command: string): command is AllowedCommand {
  return (ALLOWED_COMMANDS as readonly string[]).includes(command);
}

function sanitizeArg(arg: string): string {
  // Only allow alphanumeric, hyphens, underscores, dots, and colons
  if (!/^[\w\-.:/]+$/.test(arg)) {
    throw new Error(`Invalid argument: ${arg}`);
  }
  return arg;
}

export async function runDeeplineCommand(
  command: string,
  args: string[] = []
): Promise<DeeplineResult> {
  if (!validateCommand(command)) {
    return { success: false, error: `Command '${command}' is not allowed` };
  }

  let sanitizedArgs: string[];
  try {
    sanitizedArgs = args.map(sanitizeArg);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      DEEPLINE_CLI,
      [command, ...sanitizedArgs],
      { timeout: TIMEOUT_MS }
    );

    return {
      success: true,
      output: stdout || stderr,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.stderr || err.message || 'Deepline CLI error',
    };
  }
}

export async function deeplineStatus(): Promise<DeeplineResult> {
  return runDeeplineCommand('status');
}

export async function deeplineEnrich(domain: string): Promise<DeeplineResult> {
  return runDeeplineCommand('enrich', [`--domain=${domain}`]);
}
