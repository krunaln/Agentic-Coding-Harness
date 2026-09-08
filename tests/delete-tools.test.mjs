import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDeleteFileTool } from '../dist/tools/delete-file.js';
import { FileMutationQueue } from '../dist/tools/file-mutation-queue.js';
import { createRemoveDirectoryTool } from '../dist/tools/remove-directory.js';
import { createWorkspace } from '../dist/tools/workspace.js';

async function fixture(t) {
    const parent = await mkdtemp(path.join(tmpdir(), 'harness-delete-tools-'));
    t.after(async () => rm(parent, { recursive: true, force: true }));
    const root = path.join(parent, 'workspace');
    await mkdir(root);
    const workspace = createWorkspace(root);
    const queue = new FileMutationQueue();
    return {
        parent, root, workspace,
        deleteFile: createDeleteFileTool(workspace, queue),
        removeDirectory: createRemoveDirectoryTool(workspace, queue),
    };
}

test('delete_file removes only regular files and reports their size', async t => {
    const { root, workspace, deleteFile } = await fixture(t);
    await writeFile(path.join(root, 'obsolete.txt'), 'remove me');
    const result = await deleteFile.execute({ path: 'obsolete.txt' }, { workspace });
    assert.deepEqual(result.details, { path: 'obsolete.txt', bytesDeleted: 9 });
    await assert.rejects(access(path.join(root, 'obsolete.txt')));
    await mkdir(path.join(root, 'folder'));
    await assert.rejects(deleteFile.execute({ path: 'folder' }, { workspace }), /regular file/);
});

test('remove_directory requires an explicit recursive request for content', async t => {
    const { root, workspace, removeDirectory } = await fixture(t);
    await mkdir(path.join(root, 'empty'));
    await removeDirectory.execute({ path: 'empty', recursive: false }, { workspace });
    await assert.rejects(access(path.join(root, 'empty')));

    await mkdir(path.join(root, 'tree', 'nested'), { recursive: true });
    await writeFile(path.join(root, 'tree', 'nested', 'file.txt'), 'keep until explicit');
    await assert.rejects(removeDirectory.execute({ path: 'tree', recursive: false }, { workspace }));
    assert.equal(await readFile(path.join(root, 'tree', 'nested', 'file.txt'), 'utf8'), 'keep until explicit');
    const result = await removeDirectory.execute({ path: 'tree', recursive: true }, { workspace });
    assert.deepEqual(result.details, { path: 'tree', recursive: true });
    await assert.rejects(access(path.join(root, 'tree')));
});

test('delete tools reject the workspace root, outside paths, and escaping symlinks', async t => {
    const { parent, root, workspace, deleteFile, removeDirectory } = await fixture(t);
    await assert.rejects(removeDirectory.execute({ path: '.', recursive: true }, { workspace }), /workspace root/);
    await assert.rejects(deleteFile.execute({ path: '../outside.txt' }, { workspace }), /inside the workspace/);
    const outside = path.join(parent, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'safe');
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(deleteFile.execute({ path: 'escape/secret.txt' }, { workspace }), /outside the workspace/);
    await assert.rejects(removeDirectory.execute({ path: 'escape', recursive: true }, { workspace }), /outside the workspace/);
    assert.equal(await readFile(path.join(outside, 'secret.txt'), 'utf8'), 'safe');
});
