import type { SlashCommand } from './types.js';

export const builtinCommands: SlashCommand[] = [
    {
        name: 'help', description: 'Show available commands',
        execute(_args, context) {
            context.show(builtinCommands.map(command => `/${command.name}${command.usage ? ` ${command.usage}` : ''} — ${command.description}`).join('\n'));
        },
    },
    { name: 'new', description: 'Start a new session', execute: (_args, context) => context.newSession() },
    {
        name: 'resume', description: 'Resume a session by ID or file path', usage: '<id|path>',
        execute(args, context) {
            if (!args) throw new Error('Usage: /resume <session-id-or-file-path>');
            return context.resumeSession(args);
        },
    },
    { name: 'session', description: 'Show current session information', execute: (_args, context) => context.show(context.sessionInfo()) },
    { name: 'permissions', aliases: ['permission'], description: 'Show the active permission mode', execute: (_args, context) => context.show(context.permissionInfo()) },
    { name: 'providers', description: 'Show available providers', execute: (_args, context) => context.show(context.providerInfo()) },
    { name: 'provider', description: 'Add or remove a provider', usage: '<add|remove> <name>', execute: async (args, context) => {
        const [action, ...rest] = args.split(/\s+/).filter(Boolean);
        if (action === 'add') return rest.length ? context.addProvider(rest.join(' ')) : context.startProviderAdd();
        if (action === 'remove') return context.removeProvider(rest.join(' '));
        throw new Error('Usage: /provider <add|remove> <name>');
    } },
    { name: 'models', description: 'Show available models', execute: (_args, context) => context.show(context.modelInfo()) },
    { name: 'model', description: 'Add, remove, or choose a model', usage: '<add|remove|default|task> ...', execute: async (args, context) => {
        const [action, ...rest] = args.split(/\s+/).filter(Boolean);
        if (action === 'add') return context.addModel(rest.join(' '));
        if (action === 'remove') return context.removeModel(rest.join(' '));
        if (action === 'default') return context.setDefaultModel(rest.join(' '));
        if (action === 'task') return context.setTaskModel(rest.join(' '));
        throw new Error('Usage: /model <add|remove|default|task> ...');
    } },
    { name: 'config', description: 'Show MyAI settings', execute: (_args, context) => context.show(context.modelInfo()) },
    { name: 'clear', description: 'Clear the visible transcript', execute: (_args, context) => context.clear() },
    { name: 'quit', aliases: ['exit'], description: 'Exit MyAI', execute: (_args, context) => context.quit() },
];
