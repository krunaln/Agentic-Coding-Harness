import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import z from 'zod';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';
import { truncateItemsHead } from './truncation.js';

const excluded = new Set(['.git', 'node_modules', 'dist']);
const listFilesSchema = z.object({
    path: z.string().default('.'),
    recursive: z.boolean().default(false),
    limit: z.number().int().min(1).max(1000).default(200),
}).strict();

export type ListFilesInput = z.infer<typeof listFilesSchema>;
export type ListFilesDetails = {
    path: string;
    entryCount: number;
    truncated: boolean;
    truncation: ReturnType<typeof truncateItemsHead<string>>['details'];
};

export async function listWorkspaceFiles(input: ListFilesInput, root: string) {
    const directory = await resolveWorkspacePath(input.path, root);
    if (!(await stat(directory)).isDirectory()) throw new Error('Path must be a directory.');
    const entries: string[] = [];
    let truncated = false;
    async function visit(current: string, prefix: string) {
        const children = await readdir(current, { withFileTypes: true });
        children.sort((a, b) => a.name.localeCompare(b.name));
        for (const child of children) {
            if (excluded.has(child.name) || child.isSymbolicLink()) continue;
            if (entries.length >= input.limit) { truncated = true; return; }
            const relative = prefix ? `${prefix}/${child.name}` : child.name;
            entries.push(relative + (child.isDirectory() ? '/' : ''));
            if (input.recursive && child.isDirectory()) {
                const safeChild = await resolveWorkspacePath(path.join(current, child.name), root);
                await visit(safeChild, relative);
                if (truncated) return;
            }
        }
    }
    await visit(directory, '');
    const bounded = truncateItemsHead(entries, JSON.stringify, { maxBytes: 18_000, maxLines: 500 });
    return { entries: bounded.items, truncated: truncated || bounded.details.truncated,
        truncation: bounded.details };
}

export function createListFilesTool(workspace: Workspace): ToolDefinition<ListFilesInput, ListFilesDetails> {
    return {
        name: 'list_files',
        label: 'List files',
        description: 'List workspace files and directories. Paths are relative to the requested directory. Skips .git, node_modules, dist, and symlinks. Start with path ".".',
        schema: listFilesSchema,
        async execute(input) {
            const result = await listWorkspaceFiles(input, workspace.root);
            const notice = result.truncated ? '\n\n[Results truncated. Narrow the path or disable recursive listing.]' : '';
            return {
                content: (result.entries.join('\n') || '(empty directory)') + notice,
                details: {
                    path: input.path,
                    entryCount: result.entries.length,
                    truncated: result.truncated,
                    truncation: result.truncation,
                },
            };
        },
    };
}
