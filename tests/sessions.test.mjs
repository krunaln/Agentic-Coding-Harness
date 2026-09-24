import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { parseSessionOptions } from '../dist/sessions/options.js';
import { SessionStore } from '../dist/sessions/store.js';

async function fixture(t) {
    const root = await mkdtemp(path.join(tmpdir(), 'harness-sessions-'));
    t.after(async () => rm(root, { recursive: true, force: true }));
    const workspace = path.join(root, 'workspace');
    const sessions = path.join(root, 'sessions');
    await mkdir(workspace);
    return { workspace, sessions };
}

test('sessions preserve complete LangChain history across resume', async t => {
    const { workspace, sessions } = await fixture(t);
    const store = await SessionStore.open({ cwd: workspace, baseDir: sessions });
    await store.appendTurn([
        new HumanMessage('inspect'),
        new AIMessage({ content: '', tool_calls: [{ id: 'read-1', name: 'read_file', args: { path: 'a.ts' } }] }),
        new ToolMessage({ content: '1: hello', tool_call_id: 'read-1', name: 'read_file' }),
        new AIMessage('The file says hello.'),
    ]);
    const resumed = await SessionStore.open({ cwd: workspace, baseDir: sessions, resume: store.header.id });
    assert.equal(resumed.header.id, store.header.id);
    assert.deepEqual(resumed.history.map(message => message.getType()), ['human', 'ai', 'tool', 'ai']);
    assert.equal(resumed.history[1].tool_calls[0].id, 'read-1');
    assert.equal(resumed.history[2].tool_call_id, 'read-1');
    assert.equal(resumed.history[3].text, 'The file says hello.');
});

test('continue opens the latest workspace session and sessions cannot cross workspaces', async t => {
    const { workspace, sessions } = await fixture(t);
    const first = await SessionStore.open({ cwd: workspace, baseDir: sessions });
    await first.appendTurn([new HumanMessage('first'), new AIMessage('one')]);
    const continued = await SessionStore.open({ cwd: workspace, baseDir: sessions, continue: true });
    assert.equal(continued.header.id, first.header.id);
    const other = path.join(path.dirname(workspace), 'other');
    await mkdir(other);
    await assert.rejects(SessionStore.open({ cwd: other, baseDir: sessions, resume: first.filePath }), /different workspace/);
});

test('ephemeral sessions do not create a session file', async t => {
    const { workspace, sessions } = await fixture(t);
    const store = await SessionStore.open({ cwd: workspace, baseDir: sessions, persistent: false });
    await store.appendTurn([new HumanMessage('temporary')]);
    assert.equal(store.persistent, false);
    assert.equal(store.filePath, '');
    await assert.rejects(access(sessions));
});

test('session CLI options validate conflicting modes', () => {
    assert.deepEqual(parseSessionOptions([]), { continue: false, resume: undefined, persistent: true });
    assert.equal(parseSessionOptions(['-c']).continue, true);
    assert.equal(parseSessionOptions(['--resume', 'abc']).resume, 'abc');
    assert.equal(parseSessionOptions(['--no-session']).persistent, false);
    assert.throws(() => parseSessionOptions(['--resume']), /requires/);
    assert.throws(() => parseSessionOptions(['--continue', '--resume', 'abc']), /either/);
    assert.throws(() => parseSessionOptions(['--no-session', '--continue']), /cannot be combined/);
});
