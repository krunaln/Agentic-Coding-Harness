export type CommandContext = {
    clear(): void;
    newSession(): Promise<void>;
    resumeSession(reference: string): Promise<void>;
    show(text: string): void;
    sessionInfo(): string;
    permissionInfo(): string;
    providerInfo(): string;
    modelInfo(): string;
    addProvider(args: string): Promise<void>;
    startProviderMenu(): void;
    startProviderAdd(): void;
    startLoginMenu(): void;
    startLogoutMenu(): void;
    removeProvider(args: string): Promise<void>;
    addModel(args: string): Promise<void>;
    removeModel(args: string): Promise<void>;
    setDefaultModel(args: string): Promise<void>;
    setTaskModel(args: string): Promise<void>;
    startModelMenu(): void;
    quit(): void;
};

export type SlashCommand = {
    name: string;
    aliases?: string[];
    description: string;
    usage?: string;
    execute(args: string, context: CommandContext): Promise<void> | void;
};
