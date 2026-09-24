export type CommandContext = {
    clear(): void;
    newSession(): Promise<void>;
    resumeSession(reference: string): Promise<void>;
    show(text: string): void;
    sessionInfo(): string;
    permissionInfo(): string;
    quit(): void;
};

export type SlashCommand = {
    name: string;
    aliases?: string[];
    description: string;
    usage?: string;
    execute(args: string, context: CommandContext): Promise<void> | void;
};
