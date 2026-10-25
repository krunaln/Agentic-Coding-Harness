import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseProviderOptions } from '../dist/providers/options.js';
import { SettingsStore } from '../dist/providers/settings.js';
import { createProviderModel } from '../dist/providers/factory.js';

test('provider CLI options parse temporary overrides', () => {
    assert.deepEqual(parseProviderOptions(['--provider', 'ollama', '--model', 'ollama:qwen']), {
        provider: 'ollama', model: 'ollama:qwen',
    });
    assert.throws(() => parseProviderOptions(['--model']), /needs a model/);
});

test('project models override global defaults and task models fall back to core', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'myai-settings-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    await settings.addProvider('ollama', { type: 'ollama', baseUrl: 'http://localhost:11434/v1' }, 'global');
    await settings.addProvider('freellmapi', { type: 'freellmapi', baseUrl: 'http://localhost:8000/v1' }, 'project');
    await settings.addModel('ollama:qwen', { provider: 'ollama', model: 'qwen' }, 'global');
    await settings.setDefaultModel('ollama:qwen', 'global');
    await settings.addModel('freellmapi:small', { provider: 'freellmapi', model: 'small' }, 'project');
    await settings.setDefaultModel('freellmapi:small', 'project');
    assert.equal(settings.resolveModel('core').name, 'freellmapi:small');
    assert.equal(settings.resolveModel('review').name, 'freellmapi:small');
    await settings.setTaskModel('review', 'ollama:qwen', 'project');
    assert.equal(settings.resolveModel('review').name, 'ollama:qwen');
    await settings.removeModel('ollama:qwen', 'project');
    assert.equal(settings.resolveModel('review').name, 'freellmapi:small');
});

test('local provider adapters create OpenAI-compatible clients', () => {
    const model = createProviderModel({ name: 'ollama:qwen', config: { provider: 'ollama', model: 'qwen' }, scope: 'global' }, {
        type: 'ollama', baseUrl: 'http://localhost:11434/v1',
    });
    assert.equal(typeof model.bindTools, 'function');
});

test('ChatGPT auth gives a clear setup error until official standalone access exists', () => {
    assert.throws(() => createProviderModel({ name: 'openai:gpt', config: { provider: 'openai', model: 'gpt' }, scope: 'global' }, {
        type: 'openai', auth: 'chatgpt',
    }), /ChatGPT sign-in/);
});
