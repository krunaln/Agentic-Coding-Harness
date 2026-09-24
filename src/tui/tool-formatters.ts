function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function short(value: unknown) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined) return String(value);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export function formatToolArgs(args: unknown) {
    const values = record(args);
    if (!values) return short(args);
    const entries = Object.entries(values);
    return entries.length ? entries.map(([key, value]) => `${key}=${short(value)}`).join('  ') : 'No arguments';
}

export function summarizeToolResult(name: string, details: unknown, content?: string) {
    const value = record(details);
    if (!value) return content ? short(content.replace(/\s+/g, ' ')) : 'Completed';
    const truncated = value.truncated ? ' · truncated' : '';
    if (name === 'list_files') return `${value.entryCount ?? 0} entries in ${value.path ?? '.'}${truncated}`;
    if (name === 'read_file') {
        const more = value.hasMoreLines ? ' · more available' : '';
        return `${value.path ?? 'file'} · lines ${value.startLine ?? '?'}–${value.endLine ?? '?'} of ${value.totalLines ?? '?'}${more}${truncated}`;
    }
    if (name === 'search_code') {
        const skipped = Number(value.skippedFiles ?? 0);
        return `${value.matchCount ?? 0} matches · ${value.searchedFiles ?? 0} files searched${skipped ? ` · ${skipped} skipped` : ''}${truncated}`;
    }
    if (name === 'write_file') {
        return `${value.created ? 'Created' : 'Updated'} ${value.path ?? 'file'} · ${value.bytesWritten ?? 0} bytes · ${value.linesWritten ?? 0} lines`;
    }
    if (name === 'edit_file') {
        return `${value.path ?? 'file'} · ${value.replacements ?? 0} replacement${value.replacements === 1 ? '' : 's'} · ${value.bytesBefore ?? 0} → ${value.bytesAfter ?? 0} bytes`;
    }
    if (name === 'delete_file') {
        return `Deleted ${value.path ?? 'file'} · ${value.bytesDeleted ?? 0} bytes`;
    }
    if (name === 'remove_directory') {
        return `Removed ${value.path ?? 'directory'}${value.recursive ? ' recursively' : ''}`;
    }
    if (name === 'execute_command') {
        const exit = value.timedOut ? 'timed out' : `exit ${value.exitCode ?? 'unknown'}`;
        const stdout = record(value.stdoutTruncation);
        const stderr = record(value.stderrTruncation);
        const output = Number(stdout?.total_bytes ?? 0) + Number(stderr?.total_bytes ?? 0);
        return `${value.shell ?? 'shell'} · ${exit} · ${value.durationMs ?? 0} ms · ${output} output bytes`;
    }
    const summary = Object.entries(value)
        .filter(([key]) => key !== 'truncation')
        .slice(0, 4)
        .map(([key, item]) => `${key}=${short(item)}`)
        .join(' · ');
    return summary || 'Completed';
}
