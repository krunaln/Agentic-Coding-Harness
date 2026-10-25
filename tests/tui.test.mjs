import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { App } from '../dist/tui/App.js';
import { SettingsStore } from '../dist/providers/settings.js';

function session() {
    return { history: [], persistent: false, appendTurn: async () => {}, header: { id: 'test', createdAt: new Date().toISOString() } };
}

async function waitForFrame() {
    await new Promise(resolve => setTimeout(resolve, 30));
}

test('Ink app opens the login menu from slash command input', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'myai-tui-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    const app = render(React.createElement(App, { permissionMode: 'ask', session: session(), settings }));
    app.stdin.write('/login');
    await waitForFrame();
    app.stdin.write('\r');
    await waitForFrame();
    assert.match(app.lastFrame(), /Login/);
    assert.match(app.lastFrame(), /use subscription/);
    assert.match(app.lastFrame(), /use api key/);
    app.unmount();
});

test('Ink app opens the model picker from /model', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'myai-tui-model-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    await settings.addProvider('ollama', { type: 'ollama', baseUrl: 'http://127.0.0.1:1/v1' }, 'global');
    await settings.addModel('ollama:qwen', { provider: 'ollama', model: 'qwen' }, 'global');
    const app = render(React.createElement(App, { permissionMode: 'ask', session: session(), settings }));
    app.stdin.write('/model');
    await waitForFrame();
    app.stdin.write('\r');
    await waitForFrame();
    assert.match(app.lastFrame(), /Choose model/);
    assert.match(app.lastFrame(), /No models found|ollama:qwen/);
    app.unmount();
});

test('Ink app opens logout menu and disconnects a login', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'myai-tui-logout-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
    await settings.addProvider('ollama', { type: 'ollama', baseUrl: 'http://127.0.0.1:1/v1' }, 'global');
    const app = render(React.createElement(App, { permissionMode: 'ask', session: session(), settings }));
    app.stdin.write('/logout');
    await waitForFrame();
    app.stdin.write('\r');
    await waitForFrame();
    assert.match(app.lastFrame(), /Logout/);
    assert.match(app.lastFrame(), /ollama/);
    app.stdin.write('\r');
    await waitForFrame();
    assert.match(app.lastFrame(), /Logged out of ollama/);
    app.unmount();
});
