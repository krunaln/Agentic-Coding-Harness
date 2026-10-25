// One-time live regression run. This file is intentionally excluded from tests/*.test.mjs.
// Run with FREELLMAPI_API_KEY set in the shell.
import React from 'react';
import { render } from 'ink-testing-library';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { App } from '../dist/tui/App.js';
import { SettingsStore } from '../dist/providers/settings.js';

const apiKey = process.env.FREELLMAPI_API_KEY;
if (!apiKey) throw new Error('Set FREELLMAPI_API_KEY before running the manual regression test.');

const root = await mkdtemp(path.join(tmpdir(), 'myai-manual-tui-'));
const settings = await SettingsStore.open(root, { globalPath: path.join(root, 'global.json') });
process.env.MYAI_MANUAL_FREELLMAPI_KEY = apiKey;
await settings.addProvider('freellmapi', {
    type: 'freellmapi', baseUrl: 'http://127.0.0.1:31415',
    apiKeyEnv: 'MYAI_MANUAL_FREELLMAPI_KEY',
}, 'global');
await settings.addProvider('ollama', {
    type: 'ollama', baseUrl: 'http://localhost:11434/v1',
}, 'global');
await settings.discoverModels();
const firstModel = settings.models().find(model => model.config.provider === 'freellmapi');
if (!firstModel) throw new Error('FreeLLMAPI returned no usable models.');
await settings.setDefaultModel(firstModel.name, 'global');

const session = { history: [], persistent: false, appendTurn: async () => {}, header: { id: 'manual', createdAt: new Date().toISOString() } };
const app = render(React.createElement(App, { permissionMode: 'ask', session, settings }));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshots = [];
const capture = label => { const frame = app.lastFrame(); snapshots.push(`\n--- ${label} ---\n${frame}`); console.log(snapshots.at(-1)); };
const waitForIdle = async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const frame = app.lastFrame();
        if (/Approve .*\?/.test(frame)) {
            app.stdin.write('yes');
            await sleep(50);
            app.stdin.write('\r');
        }
        if (!frame.includes('Agent is working...')) return;
        await sleep(500);
    }
    throw new Error('Timed out waiting for the agent to become idle.');
};
const waitForModelRefresh = async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (!app.lastFrame().includes('Loading models from connected logins...')) return;
        await sleep(250);
    }
    throw new Error('Timed out waiting for model discovery.');
};
const waitForFrame = async pattern => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (pattern.test(app.lastFrame())) return;
        await sleep(100);
    }
    throw new Error(`Timed out waiting for frame: ${pattern}`);
};
const submit = async (value, label) => { await waitForIdle(); await sleep(350); app.stdin.write(value); await sleep(80); app.stdin.write('\r'); await waitForIdle(); await sleep(350); capture(label); };

capture('startup');
await submit('/login', 'login menu');
app.stdin.write('\u001b');
await sleep(100);
await waitForIdle();
app.stdin.write('/model');
await sleep(80);
app.stdin.write('\r');
await waitForModelRefresh();
app.stdin.write('\r');
await waitForIdle();
capture('model picker');
await submit('List the files in src and explain the project structure.', 'read-only prompt');
await submit('Create tmp/manual-regression.txt with the text manual regression.', 'write prompt');
await submit('Read tmp/manual-regression.txt and tell me its contents.', 'read prompt');
await submit('Delete tmp/manual-regression.txt.', 'delete prompt');
await submit('/logout', 'logout menu');
await waitForFrame(/│ Logout/);
capture('logout menu rendered');
app.stdin.write('\r');
await waitForFrame(/Logged out of/);
capture('logout selected');

await rm(root, { recursive: true, force: true });
app.unmount();
console.log(`\nCompleted ${snapshots.length} snapshots using ${firstModel.name}.`);
