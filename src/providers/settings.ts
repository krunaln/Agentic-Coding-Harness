import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ConfigScope, ModelChoice, ModelConfig, MyAIConfig, ProviderConfig, ProviderType } from './types.js';

const defaultModel = 'groq:openai/gpt-oss-20b';
const defaultProviders: Record<string, ProviderConfig> = {
    groq: { type: 'groq', apiKeyEnv: 'GROQ_API_KEY' },
    openai: { type: 'openai', auth: 'api-key', apiKeyEnv: 'OPENAI_API_KEY' },
    freellmapi: { type: 'freellmapi', baseUrl: 'http://localhost:8000/v1', apiKeyEnv: 'FREELLMAPI_API_KEY' },
    ollama: { type: 'ollama', baseUrl: 'http://localhost:11434/v1' },
};

async function readConfig(filePath: string): Promise<MyAIConfig> {
    try {
        const raw = await readFile(filePath, 'utf8');
        const value = JSON.parse(raw) as MyAIConfig;
        return value && typeof value === 'object' ? value : {};
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
        throw new Error(`Could not read MyAI settings: ${filePath}`);
    }
}

async function writeConfig(filePath: string, config: MyAIConfig) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export class SettingsStore {
    readonly globalPath = path.join(os.homedir(), '.myai', 'config.json');
    readonly projectPath: string;
    global: MyAIConfig;
    project: MyAIConfig;

    private constructor(projectRoot: string, global: MyAIConfig, project: MyAIConfig) {
        this.projectPath = path.join(projectRoot, '.myai', 'config.json');
        this.global = global;
        this.project = project;
    }

    static async open(projectRoot: string) {
        const globalPath = path.join(os.homedir(), '.myai', 'config.json');
        const projectPath = path.join(path.resolve(projectRoot), '.myai', 'config.json');
        return new SettingsStore(projectRoot, await readConfig(globalPath), await readConfig(projectPath));
    }

    private config(scope: ConfigScope) { return scope === 'global' ? this.global : this.project; }

    provider(name: string) {
        return this.project.providers?.[name] ?? this.global.providers?.[name] ?? defaultProviders[name];
    }

    providers() {
        return Object.keys({ ...defaultProviders, ...(this.global.providers ?? {}), ...(this.project.providers ?? {}) })
            .map(name => ({ name, config: this.provider(name)! }));
    }

    models(): ModelChoice[] {
        const merged = new Map<string, ModelChoice>();
        for (const [name, config] of Object.entries(this.global.models ?? {})) {
            merged.set(name, { name, config, scope: 'global' });
        }
        for (const [name, config] of Object.entries(this.project.models ?? {})) {
            merged.set(name, { name, config, scope: 'project' });
        }
        if (!merged.has(defaultModel)) merged.set(defaultModel, {
            name: defaultModel, config: { provider: 'groq', model: 'openai/gpt-oss-20b' }, scope: 'global',
        });
        return [...merged.values()];
    }

    resolveModel(task = 'core', overrideModel?: string, overrideProvider?: string) {
        if (overrideModel) return this.models().find(model => model.name === overrideModel);
        if (overrideProvider) return this.models().find(model => model.config.provider === overrideProvider);
        const taskModel = this.project.taskModels?.[task] ?? this.global.taskModels?.[task];
        const name = taskModel ?? this.project.defaultModel ?? this.global.defaultModel ?? defaultModel;
        return this.models().find(model => model.name === name) ?? this.models()[0];
    }

    async addProvider(name: string, config: ProviderConfig, scope: ConfigScope) {
        const target = this.config(scope);
        target.providers = { ...target.providers, [name]: config };
        await this.save(scope);
    }

    async removeProvider(name: string, scope: ConfigScope) {
        const target = this.config(scope);
        const models = Object.values(target.models ?? {});
        if (models.some(model => model.provider === name)) throw new Error(`Provider ${name} is used by a model. Remove those models first.`);
        target.providers = { ...(target.providers ?? {}), [name]: { type: name as ProviderType, enabled: false } };
        await this.save(scope);
    }

    async addModel(name: string, config: Omit<ModelConfig, 'scope'>, scope: ConfigScope) {
        if (!this.provider(config.provider)) throw new Error(`Unknown provider: ${config.provider}`);
        const target = this.config(scope);
        target.models = { ...target.models, [name]: { ...config, scope } };
        await this.save(scope);
    }

    async removeModel(name: string, scope: ConfigScope) {
        const target = this.config(scope);
        if (target.defaultModel === name) throw new Error(`Model ${name} is the default model. Choose another model first.`);
        const models = { ...(target.models ?? {}) };
        delete models[name];
        target.models = models;
        target.taskModels = Object.fromEntries(Object.entries(target.taskModels ?? {}).filter(([, model]) => model !== name));
        await this.save(scope);
    }

    async setDefaultModel(name: string, scope: ConfigScope) {
        if (!this.models().some(model => model.name === name)) throw new Error(`Unknown model: ${name}`);
        this.config(scope).defaultModel = name;
        await this.save(scope);
    }

    async setTaskModel(task: string, name: string, scope: ConfigScope) {
        if (!this.models().some(model => model.name === name)) throw new Error(`Unknown model: ${name}`);
        const target = this.config(scope);
        target.taskModels = { ...target.taskModels, [task]: name };
        await this.save(scope);
    }

    info() {
        const core = this.resolveModel('core');
        return `Core model: ${core?.name ?? 'not set'}\nGlobal settings: ${this.globalPath}\nProject settings: ${this.projectPath}\nModels: ${this.models().map(model => `${model.name} (${model.scope})`).join(', ')}`;
    }

    private async save(scope: ConfigScope) {
        await writeConfig(scope === 'global' ? this.globalPath : this.projectPath, this.config(scope));
    }
}

export { defaultModel };
