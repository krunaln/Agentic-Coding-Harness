import { Box, Text } from 'ink';
import { formatToolArgs, summarizeToolResult } from '../tool-formatters.js';
import type { ToolEntry } from '../types.js';

const appearance = {
    running: { icon: '◌', color: 'yellow', text: 'Running' },
    repairing: { icon: '↻', color: 'yellow', text: 'Repairing call' },
    completed: { icon: '✓', color: 'green', text: 'Completed' },
    failed: { icon: '✗', color: 'red', text: 'Failed' },
} as const;

export function ToolCall({ tool }: { tool: ToolEntry }) {
    const state = appearance[tool.status];
    const result = tool.status === 'failed'
        ? tool.error
        : tool.status === 'completed'
            ? summarizeToolResult(tool.name, tool.details, tool.content)
            : undefined;
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={state.color} paddingX={1} marginTop={1}>
            <Box>
                <Text color={state.color} bold>{state.icon} {tool.label}</Text>
                <Text dimColor>  {state.text}</Text>
                {tool.durationMs !== undefined && <Text dimColor> · {tool.durationMs} ms</Text>}
            </Box>
            <Text dimColor>{formatToolArgs(tool.args)}</Text>
            {result && <Text color={tool.status === 'failed' ? 'red' : undefined}>{result}</Text>}
        </Box>
    );
}
