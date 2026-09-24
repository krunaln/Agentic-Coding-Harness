import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useRef, useState } from 'react';
import { createAgent, type AgentEvent } from '../agent/runner.js';
import type { BaseMessage } from '@langchain/core/messages';
import type { ApprovalRequest, PermissionMode } from '../permissions.js';
import { createWorkspace } from '../tools/workspace.js';
import { ToolCall } from './components/ToolCall.js';
import type { TranscriptEntry, ToolEntry } from './types.js';
import type { SessionStore } from '../sessions/store.js';
import { SessionStore as SessionStoreClass } from '../sessions/store.js';
import { builtinCommands } from '../commands/builtins.js';
import { CommandRegistry } from '../commands/registry.js';
import { CommandMenu } from './components/CommandMenu.js';

const version = process.env.npm_package_version ?? '1.0.0';
const workspace = createWorkspace();
const commandRegistry = new CommandRegistry(builtinCommands);

type AppProps = { permissionMode: PermissionMode; session: SessionStore };

function restoredTranscript(history: BaseMessage[]): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];
    for (const message of history) {
        const type = message.getType();
        if ((type === 'human' || type === 'ai') && message.text.trim()) {
            entries.push({ id: entries.length, kind: 'message', role: type === 'human' ? 'user' : 'assistant', text: message.text });
        }
    }
    return entries;
}

const App = ({ permissionMode, session }: AppProps) => {
    const { exit } = useApp();
    const [input, setInput] = useState('');
    const [entries, setEntries] = useState<TranscriptEntry[]>(() => restoredTranscript(session.history));
    const [busy, setBusy] = useState(false);
    const [approval, setApproval] = useState<ApprovalRequest | null>(null);
    const [activeSession, setActiveSession] = useState(session);
    const [selectedCommand, setSelectedCommand] = useState(0);
    const approvalResolver = useRef<((approved: boolean) => void) | null>(null);
    const createSessionAgent = (target: SessionStore) => createAgent({
        workspace, permissionMode, initialHistory: target.history,
        onHistoryCommitted: messages => target.appendTurn(messages),
        requestApproval: request => new Promise<boolean>(resolve => {
            approvalResolver.current = resolve;
            setApproval(request);
        }),
    });
    const [agent, setAgent] = useState(() => createSessionAgent(session));
    const active = useRef<AbortController | null>(null);
    const nextEntryId = useRef(entries.length);
    useEffect(() => () => {
        active.current?.abort();
        approvalResolver.current?.(false);
    }, []);

    const appendMessage = (role: 'user' | 'assistant' | 'error' | 'notice', text: string) => {
        setEntries(current => [...current, { id: nextEntryId.current++, kind: 'message', role, text }]);
    };

    const suggestions = commandRegistry.suggestions(input);
    useEffect(() => setSelectedCommand(0), [input]);
    useInput((_character, key) => {
        if (approval || busy || !suggestions.length) return;
        if (key.upArrow) setSelectedCommand(current => (current - 1 + suggestions.length) % suggestions.length);
        if (key.downArrow) setSelectedCommand(current => (current + 1) % suggestions.length);
        if (key.tab) {
            const selected = suggestions[Math.min(selectedCommand, suggestions.length - 1)];
            if (selected) setInput(`/${selected.name}${selected.usage ? ' ' : ''}`);
        }
    });

    const switchSession = (target: SessionStore) => {
        setActiveSession(target);
        const restored = restoredTranscript(target.history);
        setEntries(restored);
        nextEntryId.current = restored.length;
        setAgent(createSessionAgent(target));
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
        if (event.type === 'permission-requested') {
            setEntries(current => current.map(entry => entry.kind === 'tool' && entry.callId === event.callId
                ? { ...entry, status: 'awaiting-approval' as const }
                : entry));
        }
        if (event.type === 'permission-granted') {
            setEntries(current => current.map(entry => entry.kind === 'tool' && entry.callId === event.callId
                ? { ...entry, status: 'running' as const }
                : entry));
        }
        if (event.type === 'permission-denied') {
            setEntries(current => current.map(entry => entry.kind === 'tool' && entry.callId === event.callId
                ? { ...entry, status: 'denied' as const }
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
        const answer = value.trim().toLowerCase();
        if (approval) {
            if (!['y', 'yes', 'n', 'no'].includes(answer)) return;
            const approved = answer === 'y' || answer === 'yes';
            const resolve = approvalResolver.current;
            approvalResolver.current = null;
            setApproval(null);
            setInput('');
            resolve?.(approved);
            return;
        }
        if (!value.trim() || active.current) return;
        if (value.trim().startsWith('/')) {
            const selected = suggestions[Math.min(selectedCommand, Math.max(0, suggestions.length - 1))];
            const commandInput = selected && !value.trim().slice(1).includes(' ')
                ? `/${selected.name}`
                : value;
            setBusy(true);
            setInput('');
            try {
                await commandRegistry.execute(commandInput, {
                    clear: () => { setEntries([]); nextEntryId.current = 0; },
                    newSession: async () => switchSession(await SessionStoreClass.open({
                        cwd: workspace.root, persistent: activeSession.persistent,
                    })),
                    resumeSession: async reference => switchSession(await SessionStoreClass.open({
                        cwd: workspace.root, resume: reference,
                    })),
                    show: text => appendMessage('notice', text),
                    sessionInfo: () => activeSession.persistent
                        ? `Session: ${activeSession.header.id}\nCreated: ${activeSession.header.createdAt}\nFile: ${activeSession.filePath}\nMessages: ${activeSession.history.length}`
                        : `Session: ephemeral\nMessages: ${activeSession.history.length}`,
                    permissionInfo: () => `Permission mode: ${permissionMode}`,
                    quit: exit,
                });
            } catch (error) {
                appendMessage('error', error instanceof Error ? error.message : String(error));
            } finally {
                setBusy(false);
            }
            return;
        }
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
            <Text dimColor>Permissions: {permissionMode}</Text>
            <Text dimColor>Session: {activeSession.persistent ? activeSession.header.id : 'ephemeral'}</Text>
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
            {busy && !approval && <Text color="yellow">Agent is working...</Text>}
            {approval && (
                <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
                    <Text bold color="cyan">Approve {approval.toolLabel}?</Text>
                    <Text dimColor>
                        {approval.toolName === 'execute_command'
                            ? 'This call can execute a shell command. Enter yes or no.'
                            : 'This call can modify the workspace. Enter yes or no.'}
                    </Text>
                </Box>
            )}
            {!approval && !busy && <CommandMenu commands={suggestions} selected={Math.min(selectedCommand, Math.max(0, suggestions.length - 1))} />}
            <Box marginTop={1} borderStyle="round" borderColor={approval ? 'cyan' : 'green'} paddingX={1}>
                <Text color={approval ? 'cyan' : 'green'}>{approval ? '? ' : '❯ '}</Text>
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit}
                    focus={!busy || Boolean(approval)} placeholder={approval ? 'yes / no' : 'Ask something...'} />
            </Box>
            <Text dimColor>{approval ? 'Approve this call with yes · Deny with no' : 'Enter to submit · Ctrl+C to quit'}</Text>
        </Box>
    );
};

export function startApp(options: AppProps) {
    return render(<App permissionMode={options.permissionMode} session={options.session} />);
}
