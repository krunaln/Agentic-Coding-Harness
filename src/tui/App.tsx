import { render, Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useRef, useState } from 'react';
import { createAgent, type AgentEvent } from '../agent/runner.js';
import { createWorkspace } from '../tools/workspace.js';
import { ToolCall } from './components/ToolCall.js';
import type { TranscriptEntry, ToolEntry } from './types.js';

const version = process.env.npm_package_version ?? '1.0.0';
const workspace = createWorkspace();

const App = () => {
    const [input, setInput] = useState('');
    const [entries, setEntries] = useState<TranscriptEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const [agent] = useState(() => createAgent({ workspace }));
    const active = useRef<AbortController | null>(null);
    const nextEntryId = useRef(0);
    useEffect(() => () => active.current?.abort(), []);

    const appendMessage = (role: 'user' | 'assistant' | 'error' | 'notice', text: string) => {
        setEntries(current => [...current, { id: nextEntryId.current++, kind: 'message', role, text }]);
    };

    const onEvent = (event: AgentEvent) => {
        if (event.type === 'tool-started') {
            setEntries(current => {
                let repairIndex = -1;
                for (let index = current.length - 1; index >= 0; index--) {
                    const entry = current[index];
                    if (entry?.kind === 'tool' && entry.status === 'repairing' && entry.name === event.name) {
                        repairIndex = index;
                        break;
                    }
                }
                if (repairIndex >= 0) {
                    return current.map((entry, index) => index === repairIndex && entry.kind === 'tool'
                        ? { ...entry, callId: event.callId, args: event.args, status: 'running', error: undefined }
                        : entry);
                }
                const tool: ToolEntry = {
                    id: nextEntryId.current++, kind: 'tool', callId: event.callId,
                    name: event.name, label: event.label, args: event.args, status: 'running',
                };
                return [...current, tool];
            });
        }
        if (event.type === 'tool-repairing') {
            if (!event.callId) {
                appendMessage('notice', 'Tool arguments were rejected. Retrying once with the tool schema.');
                return;
            }
            setEntries(current => current.map(entry => entry.kind === 'tool' && entry.callId === event.callId
                ? { ...entry, status: 'repairing' as const, error: event.error }
                : entry));
        }
        if (event.type === 'tool-completed') {
            setEntries(current => current.map(entry => entry.kind === 'tool' && entry.callId === event.callId
                ? { ...entry, status: 'completed' as const, content: event.content,
                    details: event.details, durationMs: event.durationMs }
                : entry));
        }
        if (event.type === 'tool-failed') {
            setEntries(current => current.map(entry => entry.kind === 'tool' && entry.callId === event.callId
                ? { ...entry, status: 'failed' as const, error: event.error, durationMs: event.durationMs }
                : entry));
        }
    };

    const handleSubmit = async (value: string) => {
        if (!value.trim() || active.current) return;
        const controller = new AbortController();
        active.current = controller;
        setBusy(true);
        appendMessage('user', value);
        setInput('');
        try {
            const answer = await agent.run(value, onEvent, controller.signal);
            appendMessage('assistant', answer);
        } catch (error) {
            appendMessage('error', error instanceof Error ? error.message : String(error));
        } finally {
            active.current = null;
            setBusy(false);
        }
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Text bold color="#005cc5">MyAI Code Harness {version}</Text>
            <Text dimColor>Workspace: {workspace.root}</Text>
            {entries.map(entry => entry.kind === 'tool'
                ? <ToolCall key={entry.id} tool={entry} />
                : (
                    <Box key={entry.id} marginTop={1}>
                        <Text bold color={entry.role === 'error' ? 'red' : entry.role === 'user' ? 'cyan' : undefined}>
                            {entry.role === 'user' ? 'You' : entry.role === 'assistant' ? 'Agent' : entry.role === 'notice' ? 'Notice' : 'Error'}:{' '}
                        </Text>
                        <Text color={entry.role === 'error' ? 'red' : undefined}>{entry.text}</Text>
                    </Box>
                ))}
            {busy && <Text color="yellow">Agent is working...</Text>}
            <Box marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
                <Text color="green">❯ </Text>
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit}
                    focus={!busy} placeholder="Ask something..." />
            </Box>
            <Text dimColor>Enter to submit · Ctrl+C to quit</Text>
        </Box>
    );
};

render(<App />);
