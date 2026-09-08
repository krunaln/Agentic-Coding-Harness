import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import z from 'zod';
import { FileMutationQueue } from './file-mutation-queue.js';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePathForWrite, type Workspace } from './workspace.js';

const schema = z.object({
    path: z.string().min(1).describe('File path relative to the workspace root.'),
    content: z.string().max(1_000_000).describe('Complete UTF-8 content to write.'),
}).strict();

export type WriteFileInput = z.infer<typeof schema>;
export type WriteFileDetails = {
    path: string;
    created: boolean;
    bytesWritten: number;
    linesWritten: number;
};

export function createWriteFileTool(
    workspace: Workspace,
    queue = new FileMutationQueue(),
): ToolDefinition<WriteFileInput, WriteFileDetails> {
    return {
        name: 'write_file',
        label: 'Write file',
        description: 'Create or completely replace a UTF-8 file inside the workspace. Creates missing parent directories. Use edit_file for targeted changes to an existing file.',
        schema,
        execute(input, context) {
            return queue.run(async () => {
                context.signal?.throwIfAborted();
                const target = await resolveWorkspacePathForWrite(input.path, workspace.root);
                let created = false;
                try {
                    const info = await stat(target);
                    if (!info.isFile()) throw new Error('Path must be a regular file.');
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                    created = true;
                }
                await mkdir(path.dirname(target), { recursive: true });
                context.signal?.throwIfAborted();
                await writeFile(target, input.content, 'utf8');
                const bytesWritten = Buffer.byteLength(input.content);
                const linesWritten = input.content.length === 0 ? 0 : input.content.split(/\r?\n/).length;
                return {
                    content: `${created ? 'Created' : 'Wrote'} ${input.path} (${bytesWritten} bytes).`,
                    details: { path: input.path, created, bytesWritten, linesWritten },
                };
            });
        },
    };
}
