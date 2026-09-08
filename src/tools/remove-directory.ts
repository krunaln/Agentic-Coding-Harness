import { realpath, rm, rmdir, stat } from 'node:fs/promises';
import z from 'zod';
import { FileMutationQueue } from './file-mutation-queue.js';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';

const schema = z.object({
    path: z.string().min(1).describe('Existing directory path relative to the workspace root.'),
    recursive: z.boolean().default(false).describe('Set true to permanently delete the directory and everything inside it. By default, only an empty directory can be removed.'),
}).strict();

export type RemoveDirectoryInput = z.infer<typeof schema>;
export type RemoveDirectoryDetails = { path: string; recursive: boolean };

export function createRemoveDirectoryTool(
    workspace: Workspace,
    queue = new FileMutationQueue(),
): ToolDefinition<RemoveDirectoryInput, RemoveDirectoryDetails> {
    return {
        name: 'remove_directory',
        label: 'Remove directory',
        description: 'Permanently remove a workspace directory. It must be empty unless recursive is explicitly true. The workspace root itself can never be removed.',
        schema,
        execute(input, context) {
            return queue.run(async () => {
                context.signal?.throwIfAborted();
                const target = await resolveWorkspacePath(input.path, workspace.root);
                const root = await realpath(workspace.root);
                if (target === root) throw new Error('Cannot remove the workspace root.');
                const info = await stat(target);
                if (!info.isDirectory()) throw new Error('Path must be a directory.');
                context.signal?.throwIfAborted();
                if (input.recursive) await rm(target, { recursive: true });
                else await rmdir(target);
                return {
                    content: `Removed directory ${input.path}${input.recursive ? ' recursively' : ''}.`,
                    details: { path: input.path, recursive: input.recursive },
                };
            });
        },
    };
}
