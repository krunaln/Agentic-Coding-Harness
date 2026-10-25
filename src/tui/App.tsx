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
import { SettingsStore } from '../providers/settings.js';
import { createProviderModel } from '../providers/factory.js';
import { saveProviderSecret } from '../providers/secrets.js';

const version = process.env.npm_package_version ?? '1.0.0';
const workspace = createWorkspace();
const commandRegistry = new CommandRegistry(builtinCommands);
const providerChoices = ['groq', 'openai', 'freellmapi', 'ollama'] as const;
const authChoices = ['api-key', 'chatgpt'] as const;
const providerActions = ['list', 'add', 'remove', 'change'] as const;
const modelActions = ['list', 'add', 'remove', 'default', 'task'] as const;
const loginActions = ['use subscription', 'use api key'] as const;
type ProviderWizard = { step: 'action' | 'provider' | 'auth' | 'config'; provider?: string; action?: 'add' | 'remove' | 'change'; field?: 'url' | 'apiKey'; url?: string };

type AppProps = { permissionMode: PermissionMode; session: SessionStore; settings: SettingsStore; providerOverride?: string; modelOverride?: string };

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

export const App = ({ permissionMode, session, settings, providerOverride, modelOverride }: AppProps) => {
    const { exit } = useApp();
    const [input, setInput] = useState('');
    const [entries, setEntries] = useState<TranscriptEntry[]>(() => restoredTranscript(session.history));
    const [busy, setBusy] = useState(false);
    const [approval, setApproval] = useState<ApprovalRequest | null>(null);
    const [activeSession, setActiveSession] = useState(session);
    const [selectedCommand, setSelectedCommand] = useState(0);
    const [providerWizard, setProviderWizard] = useState<ProviderWizard | null>(null);
    const [wizardChoice, setWizardChoice] = useState(0);
    const [modelMenu, setModelMenu] = useState(false);
    const [modelChoice, setModelChoice] = useState(0);
    const [loginMenu, setLoginMenu] = useState<'login' | 'logout' | null>(null);
    const [loginChoice, setLoginChoice] = useState(0);
    const [modelPicker, setModelPicker] = useState(false);
    const [modelLoading, setModelLoading] = useState(false);
    const [, refreshSettings] = useState(0);
    const approvalResolver = useRef<((approved: boolean) => void) | null>(null);
    const createSessionAgent = (target: SessionStore) => createAgent({
        workspace, permissionMode, initialHistory: target.history,
        modelFactory: tools => {
            const choice = settings.resolveModel('core', modelOverride, providerOverride);
            if (!choice) {
                const connected = settings.providers().some(item => item.global || item.project);
                throw new Error(connected
                    ? 'No model is available for the connected logins. Use /model to choose a model.'
                    : 'No login is connected. Use /login to connect an AI service first.');
            }
            const provider = settings.provider(choice.config.provider);
            if (!provider) throw new Error(`Provider ${choice.config.provider} is not configured.`);
            return createProviderModel(choice, provider).bindTools(tools);
        },
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

    const providerConfig = (name: string, auth: 'api-key' | 'chatgpt' = 'api-key', url?: string, secretRef?: string) => name === 'groq'
        ? { type: 'groq' as const, apiKeyEnv: secretRef ?? 'GROQ_API_KEY', secretRef }
        : name === 'openai'
            ? { type: 'openai' as const, auth, apiKeyEnv: secretRef ?? 'OPENAI_API_KEY', secretRef }
            : { type: name as 'freellmapi' | 'ollama', baseUrl: url || (name === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:8000/v1'), apiKeyEnv: name === 'freellmapi' ? (secretRef || 'FREELLMAPI_API_KEY') : undefined, secretRef };

    const addProviderFromWizard = async (name: string, auth: 'api-key' | 'chatgpt' = 'api-key', url?: string, apiKey?: string) => {
        const secretRef = apiKey ? `provider:${name}` : undefined;
        if (secretRef) {
            await saveProviderSecret(secretRef, apiKey!);
            process.env[secretRef] = apiKey;
        }
        await settings.addProvider(name, providerConfig(name, auth, url, secretRef), 'global');
        refreshSettings(value => value + 1);
        appendMessage('notice', `Added ${name} provider globally.`);
        setProviderWizard(null);
        setWizardChoice(0);
        setInput('');
    };

    const appendMessage = (role: 'user' | 'assistant' | 'error' | 'notice', text: string) => {
        setEntries(current => [...current, { id: nextEntryId.current++, kind: 'message', role, text }]);
    };

    const providerListText = () => {
        const items = settings.providers();
        const line = (item: typeof items[number]) => `  ${item.name} · ${item.config.auth ?? 'local'}${item.config.baseUrl ? ` · ${item.config.baseUrl}` : ''}`;
        const global = items.filter(item => item.global);
        const project = items.filter(item => item.project);
        const available = items.filter(item => !item.global && !item.project && item.config.enabled !== false);
        return [
            'Providers',
            '',
            'Global connections (all projects):',
            ...(global.length ? global.map(line) : ['  None']),
            '',
            `Project connections (${workspace.root}):`,
            ...(project.length ? project.map(line) : ['  None']),
            '',
            'Available providers:',
            ...(available.length ? available.map(line) : ['  None']),
        ].join('\n');
    };

    const modelListText = () => {
        const core = settings.resolveModel('core')?.name ?? 'not configured';
        const models = settings.models();
        return [
            'Models',
            `Active core model: ${core}`,
            '',
            ...models.map(model => `  ${model.name} · provider ${model.config.provider} · ${model.scope}${model.name === core ? ' · active' : ''}`),
        ].join('\n');
    };

    const suggestions = commandRegistry.suggestions(input);
    useEffect(() => setSelectedCommand(0), [input]);
    useInput((_character, key) => {
        if (loginMenu) {
            const choices = loginMenu === 'login' ? loginActions : settings.providers().filter(item => item.global).map(item => item.name);
            if (key.escape) { setLoginMenu(null); setLoginChoice(0); setInput(''); return; }
            if (key.upArrow) setLoginChoice(current => (current - 1 + Math.max(choices.length, 1)) % Math.max(choices.length, 1));
            if (key.downArrow) setLoginChoice(current => (current + 1) % Math.max(choices.length, 1));
            return;
        }
        if (modelPicker) {
            const choices = settings.models();
            if (key.escape) { setModelPicker(false); setModelChoice(0); return; }
            if (key.upArrow) setModelChoice(current => (current - 1 + Math.max(choices.length, 1)) % Math.max(choices.length, 1));
            if (key.downArrow) setModelChoice(current => (current + 1) % Math.max(choices.length, 1));
            return;
        }
        if (modelMenu) {
            if (key.escape) { setModelMenu(false); setModelChoice(0); setInput(''); return; }
            if (key.upArrow) setModelChoice(current => (current - 1 + modelActions.length) % modelActions.length);
            if (key.downArrow) setModelChoice(current => (current + 1) % modelActions.length);
            return;
        }
        if (providerWizard) {
            if (key.escape) {
                setProviderWizard(null);
                setWizardChoice(0);
                setInput('');
                return;
            }
            const choices = providerWizard.step === 'action' ? providerActions : providerWizard.step === 'provider' ? providerChoices : authChoices;
            if (key.upArrow) setWizardChoice(current => (current - 1 + choices.length) % choices.length);
            if (key.downArrow) setWizardChoice(current => (current + 1) % choices.length);
            return;
        }
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
                appendMessage('notice', 'The tool request was not understood. Trying once more.');
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
        if (providerWizard) {
            if (providerWizard.step === 'config') {
                const entered = value.trim();
                if (!entered) return;
                if (providerWizard.field === 'url' && providerWizard.provider === 'freellmapi') {
                    setProviderWizard({ ...providerWizard, field: 'apiKey', url: entered });
                    setInput('');
                    return;
                }
                await addProviderFromWizard(providerWizard.provider!, 'api-key', providerWizard.url ?? entered, providerWizard.field === 'apiKey' ? entered : undefined);
                return;
            }
            const choices = providerWizard.step === 'action' ? providerActions : providerWizard.step === 'provider' ? providerChoices : authChoices;
            const selected = choices[wizardChoice];
            if (!selected) return;
            if (providerWizard.step === 'action') {
                if (selected === 'list') {
                    appendMessage('notice', providerListText());
                    setProviderWizard(null); setWizardChoice(0); setInput('');
                    return;
                }
                setProviderWizard({ step: 'provider', action: selected as 'add' | 'remove' | 'change' });
                setWizardChoice(0); setInput('');
                return;
            }
            if (providerWizard.step === 'provider' && selected === 'openai') {
                if (providerWizard.action === 'remove') {
                    await settings.removeProvider(selected, 'global');
                    refreshSettings(value => value + 1); appendMessage('notice', `Removed ${selected} provider.`);
                    setProviderWizard(null); setWizardChoice(0); setInput('');
                    return;
                }
                setProviderWizard({ step: 'auth', provider: selected as string });
                setWizardChoice(0);
                setInput('');
                return;
            }
            if (providerWizard.step === 'provider' && providerWizard.action === 'remove') {
                await settings.removeProvider(selected as string, 'global');
                refreshSettings(value => value + 1); appendMessage('notice', `Removed ${selected} provider.`);
                setProviderWizard(null); setWizardChoice(0); setInput('');
                return;
            }
            if (providerWizard.step === 'provider' && (selected === 'ollama' || selected === 'freellmapi')) {
                setProviderWizard({ step: 'config', provider: selected, action: providerWizard.action, field: 'url' });
                setWizardChoice(0); setInput('');
                return;
            }
            if (providerWizard.step === 'provider' && selected === 'groq') {
                setProviderWizard({ step: 'config', provider: selected, action: providerWizard.action, field: 'apiKey' });
                setWizardChoice(0); setInput('');
                return;
            }
            if (providerWizard.step === 'auth' && selected === 'api-key') {
                setProviderWizard({ step: 'config', provider: providerWizard.provider, action: providerWizard.action, field: 'apiKey' });
                setWizardChoice(0); setInput('');
                return;
            }
            if (providerWizard.step === 'provider' && providerWizard.action === 'remove') {
                await settings.removeProvider(selected, 'global');
                refreshSettings(value => value + 1); appendMessage('notice', `Removed ${selected} provider.`);
                setProviderWizard(null); setWizardChoice(0); setInput('');
                return;
            }
            await addProviderFromWizard(providerWizard.provider ?? selected, providerWizard.step === 'auth' ? selected as 'api-key' | 'chatgpt' : 'api-key');
            return;
        }
        if (loginMenu) {
            const providers = settings.providers().filter(item => item.global);
            if (loginMenu === 'login') {
                if (loginActions[loginChoice] === 'use subscription') {
                    await settings.addProvider('openai', { type: 'openai', auth: 'chatgpt' }, 'global');
                    refreshSettings(value => value + 1);
                    appendMessage('notice', 'ChatGPT subscription login is saved. Official sign-in will be added next.');
                } else {
                    setLoginMenu(null); setLoginChoice(0); setProviderWizard({ step: 'provider', action: 'add' }); setWizardChoice(0); setInput('');
                    return;
                }
            } else {
                const selected = providers[loginChoice];
                if (selected) { await settings.disconnectProvider(selected.name, 'global'); appendMessage('notice', `Logged out of ${selected.name}.`); refreshSettings(value => value + 1); }
            }
            setLoginMenu(null); setLoginChoice(0); setInput('');
            return;
        }
        if (modelPicker) {
            const selected = settings.models()[modelChoice];
            if (selected) { await settings.setDefaultModel(selected.name, 'global'); appendMessage('notice', `Current model: ${selected.name}`); refreshSettings(value => value + 1); }
            setModelPicker(false); setModelChoice(0); setInput('');
            return;
        }
        if (modelMenu) {
            const action = modelActions[modelChoice];
            if (action === 'list') { setModelMenu(false); setModelPicker(true); setModelChoice(0); setInput(''); return; }
            else appendMessage('notice', `Use /model ${action} ... to continue.`);
            setModelMenu(false); setModelChoice(0); setInput('');
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
                    startLoginMenu: () => { setLoginMenu('login'); setLoginChoice(0); setInput(''); },
                    startLogoutMenu: () => { setLoginMenu('logout'); setLoginChoice(0); setInput(''); },
                    modelInfo: modelListText,
                    addModel: async args => {
                        const tokens = args.split(/\s+/).filter(Boolean); const scope = tokens.includes('--global') ? 'global' as const : 'project' as const; const name = tokens.find(token => !token.startsWith('--'));
                        if (!name || !name.includes(':')) throw new Error('Usage: /model add [--global] <provider:model>');
                        const [provider, ...modelParts] = name.split(':'); const model = modelParts.join(':');
                        await settings.addModel(name, { provider: provider as any, model }, scope); refreshSettings(value => value + 1); appendMessage('notice', `Added ${name} (${scope}).`);
                    },
                    removeModel: async args => { if (!args) throw new Error('Usage: /model remove <name>'); const name = args.trim(); const choice = settings.models().find(item => item.name === name); if (!choice) throw new Error(`Unknown model: ${name}`); await settings.removeModel(name, choice.scope); refreshSettings(value => value + 1); appendMessage('notice', `Removed ${name}.`); },
                    setDefaultModel: async args => { if (!args) throw new Error('Usage: /model default <name>'); await settings.setDefaultModel(args.trim(), 'project'); refreshSettings(value => value + 1); appendMessage('notice', `Default model set to ${args.trim()}.`); },
                    setTaskModel: async args => { const [task, name] = args.split(/\s+/).filter(Boolean); if (!task || !name) throw new Error('Usage: /model task <task> <name>'); await settings.setTaskModel(task, name, 'project'); refreshSettings(value => value + 1); appendMessage('notice', `${task} now uses ${name}.`); },
                    startModelMenu: () => {
                        setModelMenu(false); setModelPicker(true); setModelChoice(0); setInput(''); setModelLoading(true);
                        void settings.discoverModels().finally(() => { setModelLoading(false); refreshSettings(value => value + 1); });
                    },
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
            <Text dimColor>Model: {settings.resolveModel('core', modelOverride, providerOverride)?.name ?? 'not configured'}</Text>
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
            {providerWizard && (
                <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
                    <Text bold color="cyan">{providerWizard.step === 'action' ? 'Provider' : providerWizard.step === 'provider' ? `${providerWizard.action} provider` : providerWizard.step === 'config' ? `${providerWizard.provider} setup` : 'OpenAI connection method'}</Text>
                    {providerWizard.step === 'config' ? <Text>Enter {providerWizard.field === 'url' ? 'base URL' : 'API key'}:</Text> : (providerWizard.step === 'action' ? providerActions : providerWizard.step === 'provider' ? providerChoices : authChoices).map((choice, index) => (
                        <Text key={choice} color={index === wizardChoice ? 'cyan' : undefined}>
                            {index === wizardChoice ? '❯ ' : '  '}{choice}
                        </Text>
                    ))}
                    <Text dimColor>Use arrow keys and Enter. Escape cancels.</Text>
                </Box>
            )}
            {loginMenu && (
                <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
                    <Text bold color="cyan">{loginMenu === 'login' ? 'Login' : 'Logout'}</Text>
                    {loginMenu === 'login' && <Text dimColor>Connected logins: {settings.providers().filter(item => item.global).map(item => item.name).join(', ') || 'none'}</Text>}
                    {(loginMenu === 'login' ? loginActions : settings.providers().filter(item => item.global).map(item => item.name)).map((choice, index) => (
                        <Text key={choice} color={index === loginChoice ? 'cyan' : undefined}>{index === loginChoice ? '❯ ' : '  '}{choice}</Text>
                    ))}
                    <Text dimColor>Use arrow keys and Enter. Escape cancels.</Text>
                </Box>
            )}
            {modelPicker && (
                <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1}>
                    <Text bold color="magenta">Choose model (current: {settings.resolveModel('core')?.name ?? 'none'})</Text>
                    {modelLoading && <Text dimColor>Loading models from connected logins...</Text>}
                    {!modelLoading && !settings.models().length && <Text dimColor>No models found.</Text>}
                    {!modelLoading && settings.models().map((model, index) => <Text key={model.name} color={index === modelChoice ? 'magenta' : undefined}>{index === modelChoice ? '❯ ' : '  '}{model.name} [{model.config.provider}]</Text>)}
                    <Text dimColor>Use arrow keys and Enter. Escape cancels.</Text>
                </Box>
            )}
            {modelMenu && (
                <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1}>
                    <Text bold color="magenta">Model</Text>
                    {modelActions.map((choice, index) => (
                        <Text key={choice} color={index === modelChoice ? 'magenta' : undefined}>
                            {index === modelChoice ? '❯ ' : '  '}{choice}
                        </Text>
                    ))}
                    <Text dimColor>Use arrow keys and Enter. Escape cancels.</Text>
                </Box>
            )}
            {!approval && !busy && <CommandMenu commands={suggestions} selected={Math.min(selectedCommand, Math.max(0, suggestions.length - 1))} />}
            <Box marginTop={1} borderStyle="round" borderColor={approval ? 'cyan' : 'green'} paddingX={1}>
                <Text color={approval ? 'cyan' : 'green'}>{approval ? '? ' : '❯ '}</Text>
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit}
                    focus={!busy || Boolean(approval)} placeholder={approval ? 'yes / no' : providerWizard?.step === 'config' ? `Enter ${providerWizard.field === 'url' ? 'base URL' : 'API key'}...` : 'Ask something...'} />
            </Box>
            <Text dimColor>{approval ? 'Approve this call with yes · Deny with no' : 'Enter to submit · Ctrl+C to quit'}</Text>
        </Box>
    );
};

export function startApp(options: AppProps) {
    return render(<App permissionMode={options.permissionMode} session={options.session} settings={options.settings} providerOverride={options.providerOverride} modelOverride={options.modelOverride} />);
}
