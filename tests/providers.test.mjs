import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
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

test('model discovery reads connected OpenAI-compatible services without changing the default', async t => {
    let requests = 0;
    const server = createServer((request, response) => {
        if (request.url === '/v1/models?available=true' || request.url === '/v1/models') {
            requests += 1;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ data: [{ id: 'qwen', execution_status: 'ready' }, { id: 'llama3', execution_status: 'exhausted' }] }));
            return;
        }
        response.statusCode = 404;
        response.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const root = await mkdtemp(path.join(tmpdir(), 'myai-discovery-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    await settings.addProvider('ollama', { type: 'ollama', baseUrl }, 'global');
    process.env.MYAI_TEST_KEY = 'test-key';
    t.after(() => { delete process.env.MYAI_TEST_KEY; });
    await settings.addProvider('freellmapi', { type: 'freellmapi', baseUrl, apiKeyEnv: 'MYAI_TEST_KEY' }, 'global');
    await settings.addProvider('groq', { type: 'groq', apiKeyEnv: 'MYAI_TEST_MISSING_KEY' }, 'global');
    await settings.addModel('ollama:qwen', { provider: 'ollama', model: 'qwen' }, 'global');
    await settings.addModel('freellmapi:old', { provider: 'freellmapi', model: 'old' }, 'global');
    await settings.setDefaultModel('ollama:qwen', 'global');
    await settings.discoverModels();
    assert.equal(settings.resolveModel('core').name, 'ollama:qwen');
    assert.ok(settings.models().some(model => model.name === 'freellmapi:qwen'));
    assert.equal(settings.models().some(model => model.name === 'freellmapi:llama3'), false);
    assert.equal(settings.models().some(model => model.name === 'freellmapi:old'), false);
    await settings.discoverModels();
    assert.equal(requests, 4);
});

test('disconnected providers do not expose their models', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'myai-disconnect-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    await settings.addProvider('ollama', { type: 'ollama', baseUrl: 'http://localhost:11434/v1' }, 'global');
    await settings.addModel('ollama:qwen', { provider: 'ollama', model: 'qwen' }, 'global');
    assert.equal(settings.models().length, 1);
    await settings.disconnectProvider('ollama', 'global');
    assert.equal(settings.models().length, 0);
});

test('does not choose the first model when no default is saved', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'myai-no-default-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    await settings.addProvider('freellmapi', { type: 'freellmapi', baseUrl: 'http://localhost:3001/v1' }, 'global');
    await settings.addModel('freellmapi:first', { provider: 'freellmapi', model: 'first' }, 'global');
    await settings.addModel('freellmapi:second', { provider: 'freellmapi', model: 'second' }, 'global');
    assert.equal(settings.resolveModel('core'), undefined);
});
