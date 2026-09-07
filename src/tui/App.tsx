import { render, Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useRef, useState } from 'react';
import { createAgent, type AgentEvent } from '../agent/runner.js';

const version = process.env.npm_package_version ?? '1.0.0';

const App = () => {
    const [input, setInput] = useState('');
    const [entries, setEntries] = useState<{ label: string; text: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [agent] = useState(() => createAgent());
    const active = useRef<AbortController | null>(null);
    useEffect(() => () => active.current?.abort(), []);

    const append = (label: string, text: string) => {
        setEntries(current => [...current, { label, text }]);
    };

    const onEvent = (event: AgentEvent) => {
        if (event.type === 'tool-started') append('Tool', `${event.name} ${JSON.stringify(event.args)}`);
        if (event.type === 'tool-completed') append('Tool', `${event.name}: ${JSON.stringify(event.result)} (${event.durationMs} ms)`);
        if (event.type === 'tool-failed') append('Error', `${event.name}: ${event.error}`);
    };

    const handleSubmit = async (value: string) => {
        if (!value.trim() || active.current) return;
        const controller = new AbortController();
        active.current = controller;
        setBusy(true);
        append('You', value);
        setInput('');
        try {
            const answer = await agent.run(value, onEvent, controller.signal);
            append('Agent', answer);
        } catch (error) {
            append('Error', error instanceof Error ? error.message : String(error));
        } finally {
            active.current = null;
            setBusy(false);
        }
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Text bold color="#005cc5">MyAI Code Harness {version}</Text>
            {entries.map((entry, index) => (
                <Text key={index} color={entry.label === 'Error' ? 'red' : undefined}>
                    {entry.label}: {entry.text}
                </Text>
            ))}
            {busy && <Text color="yellow">Agent is working...</Text>}
            <Box marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
                <Text color="green">❯ </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    focus={!busy}
                    placeholder="Ask something..."
                />
            </Box>
            <Text dimColor>Enter to submit · Ctrl+C to quit</Text>
        </Box>
    )
};

render(<App />);
