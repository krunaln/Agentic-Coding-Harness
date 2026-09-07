import { open } from 'node:fs/promises';
import { tool } from 'langchain';
import z from 'zod';
import { resolveWorkspacePath, workspaceRoot } from './workspace.js';

const maxBytes = 1024 * 1024;
const maxOutputChars = 20000;

export async function readWorkspaceFile(input: { path: string; start_line: number; end_line?: number }, root = workspaceRoot) {
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
        return JSON.stringify({ path: input.path, total_lines: lines.length,
            content: numbered.slice(0, maxOutputChars),
            truncated: end < Math.min(requestedEnd, lines.length) || numbered.length > maxOutputChars,
            has_more_lines: end < lines.length });
    } finally {
        await handle.close();
    }
}

export const readFile = tool((input) => readWorkspaceFile(input), {
    name: 'read_file',
    description: 'Read a UTF-8 workspace file with line numbers. Defaults to the first 200 lines; at most 500 lines and 20,000 characters per call. File limit: 1 MiB. Use start_line/end_line to read another range.',
    schema: z.object({
        path: z.string().describe('Path relative to the workspace root.'),
        start_line: z.number().int().min(1).default(1),
        end_line: z.number().int().min(1).optional(),
    }),
});
