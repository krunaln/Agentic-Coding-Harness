export type ProviderType = 'groq' | 'openai' | 'freellmapi' | 'ollama';
export type OpenAIAuth = 'api-key' | 'chatgpt';
export type ConfigScope = 'global' | 'project';

export type ProviderConfig = {
    type: ProviderType;
    auth?: OpenAIAuth;
    baseUrl?: string;
    apiKeyEnv?: string;
    secretRef?: string;
    enabled?: boolean;
};

export type ModelConfig = {
    provider: ProviderType;
    model: string;
    scope?: ConfigScope;
    enabled?: boolean;
};

export type MyAIConfig = {
    providers?: Record<string, ProviderConfig>;
    models?: Record<string, ModelConfig>;
    defaultModel?: string;
    taskModels?: Record<string, string>;
};

export type ModelChoice = {
    name: string;
    config: ModelConfig;
    scope: ConfigScope;
};
