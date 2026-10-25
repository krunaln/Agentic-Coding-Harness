import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import type { ModelChoice, ProviderConfig } from './types.js';

function apiKey(config: ProviderConfig) {
    const key = config.apiKeyEnv ? process.env[config.apiKeyEnv]?.trim() : undefined;
    return key;
}

export function createProviderModel(choice: ModelChoice, provider: ProviderConfig) {
    if (provider.enabled === false) throw new Error(`Provider ${choice.config.provider} is disabled.`);
    if (choice.config.provider === 'groq') {
        const key = apiKey(provider);
        if (!key) throw new Error(`Set ${provider.apiKeyEnv ?? 'GROQ_API_KEY'} to use Groq.`);
        return new ChatGroq({ apiKey: key, model: choice.config.model, temperature: 0 });
    }
    if (choice.config.provider === 'openai') {
        if (provider.auth === 'chatgpt') throw new Error('OpenAI ChatGPT sign-in is not available in this version. Use API-key mode for now.');
        const key = apiKey(provider);
        if (!key) throw new Error(`Set ${provider.apiKeyEnv ?? 'OPENAI_API_KEY'} to use OpenAI.`);
        return new ChatOpenAI({ apiKey: key, model: choice.config.model, temperature: 0 });
    }
    const key = apiKey(provider);
    const baseUrl = provider.baseUrl && (/\/v1$/i.test(provider.baseUrl) ? provider.baseUrl : `${provider.baseUrl.replace(/\/$/, '')}/v1`);
    return new ChatOpenAI({
        apiKey: key || 'local',
        model: choice.config.model,
        temperature: 0,
        configuration: { baseURL: baseUrl },
    });
}
