import { open } from 'node:fs/promises';
import z from 'zod';
import type { ToolDefinition } from './types.js';
import { resolveWorkspacePath, type Workspace } from './workspace.js';
import { truncateTextHead, type TruncationDetails } from './truncation.js';

const maxBytes = 1024 * 1024;
const readFileSchema = z.object({
    path: z.string().describe('Path relative to the workspace root.'),
    start_line: z.number().int().min(1).default(1),
    end_line: z.number().int().min(1).optional(),
}).strict();

export type ReadFileInput = z.infer<typeof readFileSchema>;
export type ReadFileDetails = {
    path: string;
    totalLines: number;
    startLine: number;
    endLine: number;
    hasMoreLines: boolean;
    truncated: boolean;
    truncation: TruncationDetails;
};

export async function readWorkspaceFile(input: ReadFileInput, root: string) {
    const target = await resolveWorkspacePath(input.path, root);
    const handle = await open(target, 'r');
    try {
        const info = await handle.stat();
        if (!info.isFile()) throw new Error('Path must be a regular file.');
        if (info.size > maxBytes) throw new Error('File exceeds the 1 MiB read limit.');
        const buffer = Buffer.alloc(maxBytes + 1);
        let size = 0;
        while (size < buffer.length) {
            const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
            if (!bytesRead) break;
            size += bytesRead;
        }
        if (size > maxBytes) throw new Error('File exceeds the 1 MiB read limit.');
        const bytes = buffer.subarray(0, size);
        if (bytes.includes(0)) throw new Error('Binary files are not supported.');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const lines = text ? text.split(/\r?\n/) : [];
        if (text.endsWith('\n')) lines.pop();
        if (input.start_line > Math.max(1, lines.length)) throw new Error(`start_line exceeds file length (${lines.length} lines).`);
        const requestedEnd = input.end_line ?? input.start_line + 199;
        if (requestedEnd < input.start_line) throw new Error('end_line must be at least start_line.');
        const end = Math.min(requestedEnd, input.start_line + 499, lines.length);
        const numbered = lines.slice(input.start_line - 1, end)
            .map((line, index) => `${input.start_line + index}: ${line}`).join('\n');
        const bounded = truncateTextHead(numbered, { maxBytes: 18_000, maxLines: 500 });
        const outputEnd = bounded.details.output_lines > 0
            ? input.start_line + bounded.details.output_lines - 1
            : input.start_line - 1;
        return { path: input.path, totalLines: lines.length,
            content: bounded.content,
            truncated: end < Math.min(requestedEnd, lines.length) || bounded.details.truncated,
            truncation: bounded.details,
            startLine: input.start_line, endLine: outputEnd, hasMoreLines: outputEnd < lines.length };
    } finally {
        await handle.close();
    }
}

export function createReadFileTool(workspace: Workspace): ToolDefinition<ReadFileInput, ReadFileDetails> {
    return {
        name: 'read_file',
        label: 'Read file',
        description: 'Read a UTF-8 workspace file with line numbers. Defaults to the first 200 lines; at most 500 lines and 20,000 bytes per call. File limit: 1 MiB. Use start_line/end_line to continue reading.',
        schema: readFileSchema,
        async execute(input) {
            const result = await readWorkspaceFile(input, workspace.root);
            const nextLine = result.endLine + 1;
            const notice = result.truncated || result.hasMoreLines
                ? `\n\n[More content available. Continue with start_line=${nextLine}.]`
                : '';
            return {
                content: result.content + notice,
                details: {
                    path: result.path,
                    totalLines: result.totalLines,
                    startLine: result.startLine,
                    endLine: result.endLine,
                    hasMoreLines: result.hasMoreLines,
                    truncated: result.truncated,
                    truncation: result.truncation,
                },
            };
        },
    };
}
