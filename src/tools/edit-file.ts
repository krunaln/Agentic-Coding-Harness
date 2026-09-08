import { readFile, stat, writeFile } from 'node:fs/promises';
import z from 'zod';
import { FileMutationQueue } from './file-mutation-queue.js';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';

const maxBytes = 1024 * 1024;
const schema = z.object({
    path: z.string().min(1).describe('Existing file path relative to the workspace root.'),
    old_text: z.string().min(1).describe('Exact text to replace, including whitespace.'),
    new_text: z.string().describe('Replacement text.'),
    replace_all: z.boolean().default(false).describe('Replace every occurrence. Defaults to false and requires exactly one match.'),
}).strict();

export type EditFileInput = z.infer<typeof schema>;
export type EditFileDetails = {
    path: string;
    replacements: number;
    bytesBefore: number;
    bytesAfter: number;
};

function countOccurrences(content: string, query: string) {
    let count = 0;
    let offset = 0;
    while ((offset = content.indexOf(query, offset)) !== -1) {
        count++;
        offset += query.length;
    }
    return count;
}

export function createEditFileTool(
    workspace: Workspace,
    queue = new FileMutationQueue(),
): ToolDefinition<EditFileInput, EditFileDetails> {
    return {
        name: 'edit_file',
        label: 'Edit file',
        description: 'Replace exact text in an existing UTF-8 workspace file. The old_text must match exactly once unless replace_all is true. Read the file first to obtain exact content.',
        schema,
        execute(input, context) {
            return queue.run(async () => {
                context.signal?.throwIfAborted();
                const target = await resolveWorkspacePath(input.path, workspace.root);
                const info = await stat(target);
                if (!info.isFile()) throw new Error('Path must be a regular file.');
                if (info.size > maxBytes) throw new Error('File exceeds the 1 MiB edit limit.');
                const bytes = await readFile(target);
                if (bytes.includes(0)) throw new Error('Binary files are not supported.');
                let content: string;
                try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
                catch { throw new Error('File is not valid UTF-8.'); }
                const replacements = countOccurrences(content, input.old_text);
                if (replacements === 0) throw new Error('old_text was not found. Read the file and use an exact match.');
                if (!input.replace_all && replacements > 1) {
                    throw new Error(`old_text matched ${replacements} times. Include more context or set replace_all to true.`);
                }
                const updated = input.replace_all
                    ? content.split(input.old_text).join(input.new_text)
                    : content.replace(input.old_text, input.new_text);
                context.signal?.throwIfAborted();
                await writeFile(target, updated, 'utf8');
                const bytesBefore = Buffer.byteLength(content);
                const bytesAfter = Buffer.byteLength(updated);
                return {
                    content: `Edited ${input.path}: ${input.replace_all ? replacements : 1} replacement${(input.replace_all ? replacements : 1) === 1 ? '' : 's'}.`,
                    details: { path: input.path, replacements: input.replace_all ? replacements : 1, bytesBefore, bytesAfter },
                };
            });
        },
    };
}
