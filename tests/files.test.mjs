import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { listWorkspaceFiles, listFiles } from '../dist/tools/list-files.js';
import { readWorkspaceFile } from '../dist/tools/read-file.js';
import { createAgent } from '../dist/agent/runner.js';

test('workspace tools handle ranges, limits, excluded folders and escaped paths', async t => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'harness-tools-'));
    t.after(async () => {
        assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
        assert.ok(path.basename(fixture).startsWith('harness-tools-'));
        await rm(fixture, { recursive: true, force: true });
    });
    const root = path.join(fixture, 'workspace');
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'src', 'example.ts'), 'first\nsecond\nthird\n');
    await writeFile(path.join(root, 'node_modules', 'ignored.js'), 'ignored');
    await writeFile(path.join(root, 'binary'), Buffer.from([0, 1, 2]));
    await writeFile(path.join(root, 'large'), Buffer.alloc(1024 * 1024 + 1));
    const listed = JSON.parse(await listWorkspaceFiles({ path: '.', recursive: true, limit: 200 }, root));
    assert.ok(listed.entries.includes('src/example.ts'));
    assert.ok(!listed.entries.some(entry => entry.includes('node_modules')));
    const limited = JSON.parse(await listWorkspaceFiles({ path: '.', recursive: true, limit: 1 }, root));
    assert.equal(limited.entries.length, 1);
    assert.equal(limited.truncated, true);
    const read = JSON.parse(await readWorkspaceFile({ path: 'src/example.ts', start_line: 2, end_line: 2 }, root));
    assert.equal(read.content, '2: second');
    assert.equal(read.total_lines, 3);
    await assert.rejects(readWorkspaceFile({ path: '../outside', start_line: 1 }, root), /inside the workspace/);
    await assert.rejects(readWorkspaceFile({ path: 'binary', start_line: 1 }, root), /Binary/);
    await assert.rejects(readWorkspaceFile({ path: 'large', start_line: 1 }, root), /1 MiB/);
    await assert.rejects(readWorkspaceFile({ path: 'src', start_line: 1 }, root));
    const outside = path.join(fixture, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret'), 'outside');
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(readWorkspaceFile({ path: 'escape/secret', start_line: 1 }, root), /outside the workspace/);
});

test('registered tools execute through the agent and return matching tool messages', async () => {
    let step = 0;
    const agent = createAgent({ async invoke(messages) {
        if (step++ === 0) return new AIMessage({ content: '', tool_calls: [
            { id: 'list', name: 'list_files', args: { path: 'src/tools' } },
            { id: 'read', name: 'read_file', args: { path: 'src/index.ts' } },
        ] });
        const results = messages.filter(message => message.getType() === 'tool');
        assert.deepEqual(results.map(message => message.tool_call_id), ['list', 'read']);
        assert.match(results[0].content, /read-file.ts/);
        assert.match(results[1].content, /App.js/);
        return new AIMessage('Inspected the files.');
    } });
    assert.equal(await agent.run('Inspect the project'), 'Inspected the files.');
    const direct = JSON.parse(await listFiles.invoke({ path: 'src/tools' }));
    assert.ok(direct.entries.includes('read-file.ts'));
});
