export type OutputLimits = {
    maxBytes: number;
    maxLines: number;
};

export type TruncationDetails = {
    truncated: boolean;
    total_bytes: number;
    output_bytes: number;
    total_lines: number;
    output_lines: number;
};

export const DEFAULT_TOOL_OUTPUT_LIMITS: OutputLimits = {
    maxBytes: 20_000,
    maxLines: 500,
};

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function decodeBytePrefix(bytes: Uint8Array, maxBytes: number) {
    let end = Math.min(bytes.length, maxBytes);
    while (end > 0) {
        try {
            return decoder.decode(bytes.slice(0, end));
        } catch {
            end--;
        }
    }
    return '';
}

function lineCount(value: string) {
    if (!value) return 0;
    return value.split('\n').length;
}

export function truncateTextHead(
    value: string,
    limits: OutputLimits = DEFAULT_TOOL_OUTPUT_LIMITS,
): { content: string; details: TruncationDetails } {
    const bytes = encoder.encode(value);
    const lines = value.split('\n');
    const lineLimited = lines.length > limits.maxLines
        ? lines.slice(0, limits.maxLines).join('\n')
        : value;
    const lineLimitedBytes = encoder.encode(lineLimited);
    const content = lineLimitedBytes.length > limits.maxBytes
        ? decodeBytePrefix(lineLimitedBytes, limits.maxBytes)
        : lineLimited;
    const outputBytes = encoder.encode(content).length;

    return {
        content,
        details: {
            truncated: outputBytes < bytes.length || lineCount(content) < lineCount(value),
            total_bytes: bytes.length,
            output_bytes: outputBytes,
            total_lines: lineCount(value),
            output_lines: lineCount(content),
        },
    };
}

export function truncateItemsHead<T>(
    items: T[],
    serialize: (item: T) => string = JSON.stringify,
    limits: OutputLimits = DEFAULT_TOOL_OUTPUT_LIMITS,
) {
    const output: T[] = [];
    let outputBytes = 0;
    let outputLines = 0;

    for (const item of items) {
        const serialized = serialize(item);
        const itemBytes = encoder.encode(serialized).length;
        const itemLines = lineCount(serialized);
        if (outputBytes + itemBytes > limits.maxBytes || outputLines + itemLines > limits.maxLines) break;
        output.push(item);
        outputBytes += itemBytes;
        outputLines += itemLines;
    }

    return {
        items: output,
        details: {
            truncated: output.length < items.length,
            total_bytes: items.reduce((total, item) => total + encoder.encode(serialize(item)).length, 0),
            output_bytes: outputBytes,
            total_lines: items.reduce((total, item) => total + lineCount(serialize(item)), 0),
            output_lines: outputLines,
        } satisfies TruncationDetails,
    };
}

export function boundedToolText(value: string) {
    const result = truncateTextHead(value);
    if (!result.details.truncated) return result.content;
    const bounded = truncateTextHead(value, {
        maxBytes: DEFAULT_TOOL_OUTPUT_LIMITS.maxBytes - 200,
        maxLines: DEFAULT_TOOL_OUTPUT_LIMITS.maxLines - 2,
    });
    return `${bounded.content}\n\n[Output truncated: ${bounded.details.output_bytes} of ${bounded.details.total_bytes} bytes, ${bounded.details.output_lines} of ${bounded.details.total_lines} lines shown.]`;
}
