import { opendir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import z from 'zod';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';
import { truncateItemsHead, type TruncationDetails } from './truncation.js';

const schema = z.object({
    query: z.string().min(1).max(1000).describe('Literal text to find (not a regular expression).'),
    path: z.string().default('.').describe('Workspace-relative file or directory to search.'),
    case_sensitive: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
}).strict();
const excluded = new Set(['.git', 'node_modules', 'dist']);
const maxBytes = 1024 * 1024;
export type SearchCodeInput = z.infer<typeof schema>;
export type SearchCodeMatch = { path: string; line: number; text: string; text_truncated: boolean };
export type SearchCodeDetails = {
    query: string;
    matchCount: number;
    searchedFiles: number;
    skippedFiles: number;
    truncated: boolean;
    truncation: TruncationDetails;
};

export async function searchWorkspaceCode(rawInput: z.input<typeof schema>, root: string, signal?: AbortSignal) {
    const input = schema.parse(rawInput);
    const realRoot = await resolveWorkspacePath('.', root);
    const target = await resolveWorkspacePath(input.path, root);
    const matches: SearchCodeMatch[] = [];
    let truncated = false;
    let visited = 0;
    let searchedFiles = 0;
    let skippedFiles = 0;
    const query = input.case_sensitive ? input.query : input.query.toLowerCase();
    const skip = (name: string) => excluded.has(name) || name === '.env' || (name.startsWith('.env.') && name !== '.env.example');

    async function searchFile(file: string) {
        const safe = await resolveWorkspacePath(file, root);
        const handle = await open(safe, 'r');
        let text: string;
        try {
            const info = await handle.stat();
            if (!info.isFile() || info.size > maxBytes) { skippedFiles++; return; }
            const buffer = Buffer.alloc(maxBytes + 1);
            let size = 0;
            while (size < buffer.length) {
                signal?.throwIfAborted();
                const result = await handle.read(buffer, size, buffer.length - size, null);
                if (!result.bytesRead) break;
                size += result.bytesRead;
            }
            const bytes = buffer.subarray(0, size);
            if (size > maxBytes || bytes.includes(0)) { skippedFiles++; return; }
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { skippedFiles++; return; }
        } finally { await handle.close(); }
        searchedFiles++;
        const relative = path.relative(realRoot, safe).split(path.sep).join('/');
        const lines = text.split(/\r?\n/);
        for (const [index, line] of lines.entries()) {
            signal?.throwIfAborted();
            const position = (input.case_sensitive ? line : line.toLowerCase()).indexOf(query);
            if (position === -1) continue;
            const start = Math.max(0, position - 100);
            const snippet = line.slice(start, start + 1200);
            if (matches.length >= input.limit) {
                truncated = true;
                return;
            }
            matches.push({ path: relative, line: index + 1, text: snippet,
                text_truncated: start > 0 || start + snippet.length < line.length });
        }
    }

    async function visit(directory: string) {
        const entries = await opendir(directory);
        for await (const entry of entries) {
            signal?.throwIfAborted();
            if (++visited > 10000) { truncated = true; return; }
            if (skip(entry.name) || entry.isSymbolicLink()) continue;
            const child = await resolveWorkspacePath(path.join(directory, entry.name), root);
            if (entry.isDirectory()) await visit(child);
            else if (entry.isFile()) await searchFile(child);
            if (truncated) return;
        }
    }

    signal?.throwIfAborted();
    if (path.relative(realRoot, target).split(path.sep).some(skip)) {
        throw new Error('Search path is excluded (.git, node_modules, dist, or .env files).');
    }
    const info = await stat(target);
    if (info.isDirectory()) await visit(target);
    else if (info.isFile()) await searchFile(target);
    else throw new Error('Path must be a file or directory.');
    const bounded = truncateItemsHead(matches, JSON.stringify, { maxBytes: 18_000, maxLines: 500 });
    return { query: input.query, matches: bounded.items,
        truncated: truncated || bounded.details.truncated, truncation: bounded.details,
        searchedFiles, skippedFiles };
}

export function createSearchCodeTool(workspace: Workspace): ToolDefinition<SearchCodeInput, SearchCodeDetails> {
    return {
        name: 'search_code',
        label: 'Search code',
        description: 'Search literal text recursively in workspace UTF-8 files. Returns workspace-relative paths, 1-based line numbers, and matching snippets. Case-insensitive by default. Skips generated folders, .env files, nested symlinks, binary files, and files over 1 MiB. Narrow the path or query if results are truncated.',
        schema,
        async execute(input, context) {
            const result = await searchWorkspaceCode(input, workspace.root, context.signal);
            const lines = result.matches.map(match => `${match.path}:${match.line}: ${match.text}`);
            const notice = result.truncated ? '\n\n[Results truncated. Narrow the query or search path.]' : '';
            return {
                content: (lines.join('\n') || 'No matches found.') + notice,
                details: {
                    query: result.query,
                    matchCount: result.matches.length,
                    searchedFiles: result.searchedFiles,
                    skippedFiles: result.skippedFiles,
                    truncated: result.truncated,
                    truncation: result.truncation,
                },
            };
        },
    };
}
