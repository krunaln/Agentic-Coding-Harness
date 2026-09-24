import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeWorkspaceCommand, createExecuteCommandTool } from '../dist/tools/execute-command.js';
import { createToolDefinitions } from '../dist/tools/index.js';
import { createWorkspace } from '../dist/tools/workspace.js';

async function fixture(t) {
    const root = await mkdtemp(path.join(tmpdir(), 'harness-command-'));
    t.after(async () => rm(root, { recursive: true, force: true }));
    return { root, workspace: createWorkspace(root) };
}

const command = process.platform === 'win32'
    ? `Write-Output 'hello'; [Console]::Error.WriteLine('warning'); exit 3`
    : `printf 'hello\n'; printf 'warning\n' >&2; exit 3`;

test('execute_command captures stdout, stderr, exit code, and cwd', async t => {
    const { root } = await fixture(t);
    await mkdir(path.join(root, 'nested'));
    const result = await executeWorkspaceCommand({
        command, cwd: 'nested', shell: 'auto', timeout_ms: 10_000,
    }, root);
    assert.match(result.stdout, /hello/);
    assert.match(result.stderr, /warning/);
    assert.equal(result.exitCode, 3);
    assert.equal(result.cwd, 'nested');
    assert.equal(result.timedOut, false);
});

test('execute_command times out and rejects cwd outside the workspace', async t => {
    const { root } = await fixture(t);
    const slow = process.platform === 'win32' ? 'Start-Sleep -Seconds 10' : 'sleep 10';
    const started = performance.now();
    const result = await executeWorkspaceCommand({
        command: slow, cwd: '.', shell: 'auto', timeout_ms: 1_000,
    }, root);
    assert.equal(result.timedOut, true);
    assert.ok(performance.now() - started < 5_000);
    await assert.rejects(executeWorkspaceCommand({
        command: 'echo no', cwd: '..', shell: 'auto', timeout_ms: 10_000,
    }, root), /inside the workspace/);
});

test('execute_command bounds captured output and model-facing content', async t => {
    const { root, workspace } = await fixture(t);
    const noisy = process.platform === 'win32'
        ? `[Console]::Out.Write(('x' * 120000))`
        : `head -c 120000 /dev/zero | tr '\\0' x`;
    const tool = createExecuteCommandTool(workspace);
    const result = await tool.execute({
        command: noisy, cwd: '.', shell: 'auto', timeout_ms: 10_000,
    }, { workspace });
    assert.equal(result.details.stdoutTruncation.total_bytes, 120_000);
    assert.equal(result.details.stdoutTruncation.truncated, true);
    assert.ok(Buffer.byteLength(result.content) <= 20_000);
    assert.match(result.content, /Output truncated/);
});

test('registered execute_command tool requires command approval', async t => {
    const { workspace } = await fixture(t);
    const tool = createToolDefinitions(workspace).find(item => item.name === 'execute_command');
    assert.equal(tool.permission, 'command-execution');
});
