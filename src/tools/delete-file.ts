import { rm, stat } from 'node:fs/promises';
import z from 'zod';
import { FileMutationQueue } from './file-mutation-queue.js';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';

const schema = z.object({
    path: z.string().min(1).describe('Existing file path relative to the workspace root.'),
}).strict();

export type DeleteFileInput = z.infer<typeof schema>;
export type DeleteFileDetails = { path: string; bytesDeleted: number };

export function createDeleteFileTool(
    workspace: Workspace,
    queue = new FileMutationQueue(),
): ToolDefinition<DeleteFileInput, DeleteFileDetails> {
    return {
        name: 'delete_file',
        label: 'Delete file',
        description: 'Permanently delete one existing regular file inside the workspace. This cannot delete directories. Read or inspect the target first when its contents matter.',
        schema,
        execute(input, context) {
            return queue.run(async () => {
                context.signal?.throwIfAborted();
                const target = await resolveWorkspacePath(input.path, workspace.root);
                const info = await stat(target);
                if (!info.isFile()) throw new Error('Path must be a regular file.');
                context.signal?.throwIfAborted();
                await rm(target);
                return {
                    content: `Deleted file ${input.path}.`,
                    details: { path: input.path, bytesDeleted: info.size },
                };
            });
        },
    };
}
