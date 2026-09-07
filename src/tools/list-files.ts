import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'langchain';
import z from 'zod';
import { resolveWorkspacePath, workspaceRoot } from './workspace.js';

const excluded = new Set(['.git', 'node_modules', 'dist']);

export async function listWorkspaceFiles(input: { path: string; recursive: boolean; limit: number }, root = workspaceRoot) {
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
    return JSON.stringify({ path: input.path, entries, truncated });
}

export const listFiles = tool((input) => listWorkspaceFiles(input), {
    name: 'list_files',
    description: 'List workspace files and directories. Paths are relative to the requested directory. Skips .git, node_modules, dist, and symlinks. Start with path ".".',
    schema: z.object({
        path: z.string().default('.'),
        recursive: z.boolean().default(false),
        limit: z.number().int().min(1).max(1000).default(200),
    }),
});
