import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEditFileTool } from '../dist/tools/edit-file.js';
import { FileMutationQueue } from '../dist/tools/file-mutation-queue.js';
import { createWriteFileTool } from '../dist/tools/write-file.js';
import { createWorkspace } from '../dist/tools/workspace.js';

async function fixture(t) {
    const parent = await mkdtemp(path.join(tmpdir(), 'harness-write-tools-'));
    t.after(async () => rm(parent, { recursive: true, force: true }));
    const root = path.join(parent, 'workspace');
    await mkdir(root);
    return { parent, root, workspace: createWorkspace(root) };
}

test('write_file creates nested files and replaces existing files', async t => {
    const { root, workspace } = await fixture(t);
    const tool = createWriteFileTool(workspace);
    const created = await tool.execute({ path: 'src/new.ts', content: 'one\ntwo' }, { workspace });
    assert.deepEqual(created.details, {
        path: 'src/new.ts', created: true, bytesWritten: 7, linesWritten: 2,
    });
    assert.equal(await readFile(path.join(root, 'src/new.ts'), 'utf8'), 'one\ntwo');
    const replaced = await tool.execute({ path: 'src/new.ts', content: 'updated' }, { workspace });
    assert.equal(replaced.details.created, false);
    assert.equal(await readFile(path.join(root, 'src/new.ts'), 'utf8'), 'updated');
});

test('write_file rejects paths outside the workspace, including symlink ancestors', async t => {
    const { parent, root, workspace } = await fixture(t);
    const tool = createWriteFileTool(workspace);
    await assert.rejects(tool.execute({ path: '../outside.txt', content: 'no' }, { workspace }), /inside the workspace/);
    const outside = path.join(parent, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(tool.execute({ path: 'escape/new.txt', content: 'no' }, { workspace }), /outside the workspace/);
});

test('edit_file requires an unambiguous match and supports explicit replace_all', async t => {
    const { root, workspace } = await fixture(t);
    await writeFile(path.join(root, 'sample.txt'), 'hello world\nhello world\n');
    const tool = createEditFileTool(workspace);
    await assert.rejects(tool.execute({
        path: 'sample.txt', old_text: 'hello', new_text: 'hi', replace_all: false,
    }, { workspace }), /matched 2 times/);
    assert.equal(await readFile(path.join(root, 'sample.txt'), 'utf8'), 'hello world\nhello world\n');
    const result = await tool.execute({
        path: 'sample.txt', old_text: 'hello', new_text: 'hi', replace_all: true,
    }, { workspace });
    assert.equal(result.details.replacements, 2);
    assert.equal(await readFile(path.join(root, 'sample.txt'), 'utf8'), 'hi world\nhi world\n');
    await assert.rejects(tool.execute({
        path: 'sample.txt', old_text: 'missing', new_text: 'x', replace_all: false,
    }, { workspace }), /not found/);
});

test('the shared mutation queue executes mutations in submission order', async () => {
    const queue = new FileMutationQueue();
    const order = [];
    const first = queue.run(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push('first');
    });
    const second = queue.run(async () => { order.push('second'); });
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first', 'second']);
});
