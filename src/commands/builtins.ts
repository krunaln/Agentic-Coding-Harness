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
    { name: 'clear', description: 'Clear the visible transcript', execute: (_args, context) => context.clear() },
    { name: 'quit', aliases: ['exit'], description: 'Exit MyAI', execute: (_args, context) => context.quit() },
];
