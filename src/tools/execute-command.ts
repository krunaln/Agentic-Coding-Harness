import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import z from 'zod';
import type { ToolDefinition } from './types.js';
import { boundedToolText, truncateTextHead, type TruncationDetails } from './truncation.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';

const schema = z.object({
    command: z.string().min(1).max(20_000).describe('Shell command to execute.'),
    cwd: z.string().default('.').describe('Working directory relative to the workspace root.'),
    shell: z.enum(['auto', 'powershell', 'bash']).default('auto'),
    timeout_ms: z.number().int().min(1_000).max(600_000).default(120_000),
}).strict();

export type ExecuteCommandInput = z.infer<typeof schema>;
export type ExecuteCommandDetails = {
    command: string;
    cwd: string;
    shell: 'powershell' | 'bash';
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
    stdoutTruncation: TruncationDetails;
    stderrTruncation: TruncationDetails;
};

const captureLimitBytes = 100_000;

function shellCommand(requested: ExecuteCommandInput['shell']) {
    const shell = requested === 'auto' ? (process.platform === 'win32' ? 'powershell' : 'bash') : requested;
    if (shell === 'powershell') {
        return {
            shell,
            executable: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
            args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
        } as const;
    }
    return { shell, executable: 'bash', args: ['-lc'] } as const;
}

type Capture = {
    text: string;
    totalBytes: number;
    totalLines: number;
    finish(): void;
    add(chunk: Buffer): void;
};

function createCapture(): Capture {
    const decoder = new StringDecoder('utf8');
    let capturedBytes = 0;
    const capture: Capture = {
        text: '', totalBytes: 0, totalLines: 0,
        add(chunk) {
            this.totalBytes += chunk.length;
            this.totalLines += chunk.reduce((count, byte) => count + (byte === 10 ? 1 : 0), 0);
            if (capturedBytes >= captureLimitBytes) return;
            const kept = chunk.subarray(0, captureLimitBytes - capturedBytes);
            capturedBytes += kept.length;
            this.text += decoder.write(kept);
        },
        finish() { this.text += decoder.end(); },
    };
    return capture;
}

export async function executeWorkspaceCommand(
    rawInput: ExecuteCommandInput,
    root: string,
    signal?: AbortSignal,
): Promise<ExecuteCommandDetails> {
    const input = schema.parse(rawInput);
    const cwd = await resolveWorkspacePath(input.cwd, root);
    if (!(await stat(cwd)).isDirectory()) throw new Error('Command cwd must be a directory.');
    const selected = shellCommand(input.shell);
    const stdoutCapture = createCapture();
    const stderrCapture = createCapture();
    const started = performance.now();
    let timedOut = false;

    const outcome = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        const child = spawn(selected.executable, [...selected.args, input.command], {
            cwd,
            windowsHide: true,
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (chunk: Buffer) => stdoutCapture.add(chunk));
        child.stderr.on('data', (chunk: Buffer) => stderrCapture.add(chunk));
        let forceTimer: NodeJS.Timeout | undefined;
        const kill = (killSignal: NodeJS.Signals) => {
            if (child.pid && process.platform !== 'win32') {
                try { process.kill(-child.pid, killSignal); } catch { /* process already exited */ }
            } else {
                child.kill(killSignal);
            }
        };
        const stop = () => {
            kill('SIGTERM');
            forceTimer ??= setTimeout(() => kill('SIGKILL'), 2_000);
            forceTimer.unref();
        };
        const timer = setTimeout(() => { timedOut = true; stop(); }, input.timeout_ms);
        timer.unref();
        const onAbort = () => stop();
        signal?.addEventListener('abort', onAbort, { once: true });
        child.once('error', error => {
            clearTimeout(timer);
            if (forceTimer) clearTimeout(forceTimer);
            signal?.removeEventListener('abort', onAbort);
            reject(error);
        });
        child.once('close', (exitCode, exitSignal) => {
            clearTimeout(timer);
            if (forceTimer) clearTimeout(forceTimer);
            signal?.removeEventListener('abort', onAbort);
            if (signal?.aborted) {
                reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
                return;
            }
            resolve({ exitCode, signal: exitSignal });
        });
    });
    stdoutCapture.finish();
    stderrCapture.finish();
    const stdout = truncateTextHead(stdoutCapture.text);
    const stderr = truncateTextHead(stderrCapture.text);
    const withTotals = (details: TruncationDetails, capture: Capture): TruncationDetails => ({
        ...details,
        truncated: details.truncated || capture.totalBytes > details.output_bytes,
        total_bytes: capture.totalBytes,
        total_lines: capture.totalBytes === 0 ? 0 : capture.totalLines + 1,
    });
    return {
        command: input.command, cwd: input.cwd, shell: selected.shell,
        exitCode: outcome.exitCode, signal: outcome.signal, timedOut,
        durationMs: Math.round(performance.now() - started),
        stdout: stdout.content, stderr: stderr.content,
        stdoutTruncation: withTotals(stdout.details, stdoutCapture),
        stderrTruncation: withTotals(stderr.details, stderrCapture),
    };
}

export function createExecuteCommandTool(workspace: Workspace): ToolDefinition<ExecuteCommandInput, ExecuteCommandDetails> {
    return {
        name: 'execute_command',
        label: 'Execute command',
        description: 'Execute a PowerShell or Bash command in a workspace directory. Captures stdout, stderr, exit code, timeout, and duration. Use for builds, tests, package commands, and other terminal operations. Default timeout is 120 seconds.',
        permission: 'command-execution',
        schema,
        async execute(input, context) {
            const result = await executeWorkspaceCommand(input, workspace.root, context.signal);
            const sections = [
                `Command: ${result.command}`,
                `Shell: ${result.shell}`,
                `Exit code: ${result.exitCode ?? 'none'}${result.timedOut ? ' (timed out)' : ''}`,
                result.stdout ? `\nstdout:\n${result.stdout}` : '',
                result.stderr ? `\nstderr:\n${result.stderr}` : '',
            ].filter(Boolean);
            return { content: boundedToolText(sections.join('\n')), details: result };
        },
    };
}
