import type { CommandContext, SlashCommand } from './types.js';

export function parseSlashCommand(input: string) {
    const value = input.trim();
    if (!value.startsWith('/')) return undefined;
    const [rawName = '', ...rest] = value.slice(1).split(/\s+/);
    return { name: rawName.toLowerCase(), args: rest.join(' ') };
}

export class CommandRegistry {
    constructor(readonly commands: SlashCommand[]) {}

    suggestions(input: string) {
        if (!input.startsWith('/') || input.slice(1).includes(' ')) return [];
        const query = input.slice(1).toLowerCase();
        return this.commands.filter(command => command.name.startsWith(query)
            || command.aliases?.some(alias => alias.startsWith(query)));
    }

    async execute(input: string, context: CommandContext) {
        const parsed = parseSlashCommand(input);
        if (!parsed) return false;
        const command = this.commands.find(candidate => candidate.name === parsed.name
            || candidate.aliases?.includes(parsed.name));
        if (!command) throw new Error(`Unknown command: /${parsed.name}. Type /help to see available commands.`);
        await command.execute(parsed.args, context);
        return true;
    }
}
