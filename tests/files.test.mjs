import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { createListFilesTool, listWorkspaceFiles } from '../dist/tools/list-files.js';
import { readWorkspaceFile } from '../dist/tools/read-file.js';
import { createAgent } from '../dist/agent/runner.js';
import { searchWorkspaceCode } from '../dist/tools/search-code.js';
import { createWorkspace } from '../dist/tools/workspace.js';

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
    const listed = await listWorkspaceFiles({ path: '.', recursive: true, limit: 200 }, root);
    assert.ok(listed.entries.includes('src/example.ts'));
    assert.ok(!listed.entries.some(entry => entry.includes('node_modules')));
    const limited = await listWorkspaceFiles({ path: '.', recursive: true, limit: 1 }, root);
    assert.equal(limited.entries.length, 1);
    assert.equal(limited.truncated, true);
    const read = await readWorkspaceFile({ path: 'src/example.ts', start_line: 2, end_line: 2 }, root);
    assert.equal(read.content, '2: second');
    assert.equal(read.totalLines, 3);
    await assert.rejects(readWorkspaceFile({ path: '../outside', start_line: 1 }, root), /inside the workspace/);
    await assert.rejects(readWorkspaceFile({ path: 'binary', start_line: 1 }, root), /Binary/);
    await assert.rejects(readWorkspaceFile({ path: 'large', start_line: 1 }, root), /1 MiB/);
    await assert.rejects(readWorkspaceFile({ path: 'src', start_line: 1 }, root));
    const outside = path.join(fixture, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret'), 'outside');
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(readWorkspaceFile({ path: 'escape/secret', start_line: 1 }, root), /outside the workspace/);
    await writeFile(path.join(root, '.env'), 'first=secret');
    await writeFile(path.join(root, 'src', 'literal.ts'), 'A.*B\na.*b\n');
    const found = await searchWorkspaceCode({ query: 'A.*B' }, root);
    assert.deepEqual(found.matches.map(match => [match.path, match.line]), [
        ['src/literal.ts', 1], ['src/literal.ts', 2],
    ]);
    assert.equal(found.truncated, false);
    assert.equal(found.skippedFiles, 2);
    const sensitive = await searchWorkspaceCode({ query: 'A.*B', case_sensitive: true }, root);
    assert.equal(sensitive.matches.length, 1);
    const capped = await searchWorkspaceCode({ query: 'a.*b', limit: 1 }, root);
    assert.equal(capped.matches.length, 1);
    assert.equal(capped.truncated, true);
    const scoped = await searchWorkspaceCode({ query: 'second', path: 'src/example.ts' }, root);
    assert.equal(scoped.matches[0].line, 2);
    assert.deepEqual((await searchWorkspaceCode({ query: 'not present' }, root)).matches, []);
    assert.equal((await searchWorkspaceCode({ query: 'first' }, root)).matches.length, 1);
    await assert.rejects(searchWorkspaceCode({ query: '' }, root));
    await assert.rejects(searchWorkspaceCode({ query: 'x', path: '../outside' }, root), /inside the workspace/);
    await assert.rejects(searchWorkspaceCode({ query: 'x', path: 'escape' }, root), /outside the workspace/);
    await assert.rejects(searchWorkspaceCode({ query: 'x', path: '.env' }, root), /excluded/);
    await assert.rejects(searchWorkspaceCode({ query: 'x' }, root, AbortSignal.abort()), /abort/i);
    await writeFile(path.join(root, 'long.ts'), 'x'.repeat(3000) + 'needle');
    const long = await searchWorkspaceCode({ query: 'needle' }, root);
    assert.match(long.matches[0].text, /needle/);
    assert.equal(long.matches[0].text_truncated, true);
});

test('registered tools execute through the agent and return matching tool messages', async () => {
    let step = 0;
    const events = [];
    const agent = createAgent({ model: { async invoke(messages) {
        if (step++ === 0) return new AIMessage({ content: '', tool_calls: [
            { id: 'list', name: 'list_files', args: { path: 'src/tools' } },
            { id: 'read', name: 'read_file', args: { path: 'src/index.ts' } },
            { id: 'search', name: 'search_code', args: { path: 'src/index.ts', query: 'App.js' } },
        ] });
        const results = messages.filter(message => message.getType() === 'tool');
        assert.deepEqual(results.map(message => message.tool_call_id), ['list', 'read', 'search']);
        assert.match(results[0].content, /read-file.ts/);
        assert.match(results[1].content, /App.js/);
        assert.match(results[2].content, /src\/index\.ts:2:/);
        assert.doesNotMatch(results[2].content, /searchedFiles/);
        return new AIMessage('Inspected the files.');
    } } });
    assert.equal(await agent.run('Inspect the project', event => events.push(event)), 'Inspected the files.');
    const completed = events.filter(event => event.type === 'tool-completed');
    assert.equal(completed.length, 3);
    assert.equal(completed[2].details.matchCount, 1);
    assert.equal(completed[2].details.searchedFiles, 1);
    const direct = await createListFilesTool(createWorkspace()).execute(
        { path: 'src/tools', recursive: false, limit: 200 },
        { workspace: createWorkspace() },
    );
    assert.match(direct.content, /read-file.ts/);
    assert.equal(direct.details.entryCount > 0, true);
});

test('tool factories stay bound to their own workspace', async t => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'harness-bound-tools-'));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    const first = path.join(fixture, 'first');
    const second = path.join(fixture, 'second');
    await mkdir(first);
    await mkdir(second);
    await writeFile(path.join(first, 'only-first.txt'), 'first');
    await writeFile(path.join(second, 'only-second.txt'), 'second');
    const firstTool = createListFilesTool(createWorkspace(first));
    const secondTool = createListFilesTool(createWorkspace(second));
    const firstResult = await firstTool.execute(
        { path: '.', recursive: false, limit: 20 },
        { workspace: createWorkspace(first) },
    );
    const secondResult = await secondTool.execute(
        { path: '.', recursive: false, limit: 20 },
        { workspace: createWorkspace(second) },
    );
    assert.match(firstResult.content, /only-first/);
    assert.doesNotMatch(firstResult.content, /only-second/);
    assert.match(secondResult.content, /only-second/);
});
