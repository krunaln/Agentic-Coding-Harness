import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinCommands } from '../dist/commands/builtins.js';
import { CommandRegistry, parseSlashCommand } from '../dist/commands/registry.js';

test('slash command parser separates normalized names and arguments', () => {
    assert.deepEqual(parseSlashCommand('/resume  abc-123 '), { name: 'resume', args: 'abc-123' });
    assert.deepEqual(parseSlashCommand('/SESSION'), { name: 'session', args: '' });
    assert.equal(parseSlashCommand('normal prompt'), undefined);
});

test('command suggestions filter names and aliases but stop once arguments begin', () => {
    const registry = new CommandRegistry(builtinCommands);
    assert.ok(registry.suggestions('/').length >= 7);
    assert.deepEqual(registry.suggestions('/ses').map(command => command.name), ['session']);
    assert.deepEqual(registry.suggestions('/per').map(command => command.name), ['permissions']);
    assert.deepEqual(registry.suggestions('/resume '), []);
});

test('registry executes commands and validates unknown commands and required arguments', async () => {
    const calls = [];
    const context = {
        clear: () => calls.push('clear'),
        newSession: async () => calls.push('new'),
        resumeSession: async value => calls.push(`resume:${value}`),
        show: value => calls.push(`show:${value}`),
        sessionInfo: () => 'session info',
        permissionInfo: () => 'permission info',
        quit: () => calls.push('quit'),
    };
    const registry = new CommandRegistry(builtinCommands);
    await registry.execute('/clear', context);
    await registry.execute('/resume abc', context);
    await registry.execute('/permission', context);
    assert.deepEqual(calls, ['clear', 'resume:abc', 'show:permission info']);
    await assert.rejects(registry.execute('/resume', context), /Usage/);
    await assert.rejects(registry.execute('/missing', context), /Unknown command/);
});

test('provider and model commands pass their arguments to the TUI', async () => {
    const calls = [];
    const context = {
        clear: () => {}, newSession: async () => {}, resumeSession: async () => {},
        show: value => calls.push(`show:${value}`), sessionInfo: () => '', permissionInfo: () => '', quit: () => {},
        providerInfo: () => '', modelInfo: () => '',
        addProvider: async value => calls.push(`provider:add:${value}`),
        startProviderMenu: () => calls.push('provider:menu'),
        startProviderAdd: () => calls.push('provider:start'),
        removeProvider: async value => calls.push(`provider:remove:${value}`),
        addModel: async value => calls.push(`model:add:${value}`),
        removeModel: async value => calls.push(`model:remove:${value}`),
        setDefaultModel: async value => calls.push(`model:default:${value}`),
        setTaskModel: async value => calls.push(`model:task:${value}`),
        startModelMenu: () => calls.push('model:menu'),
    };
    const registry = new CommandRegistry(builtinCommands);
    await registry.execute('/provider add ollama', context);
    await registry.execute('/provider add', context);
    await registry.execute('/provider list', context);
    await registry.execute('/provider remove ollama', context);
    await registry.execute('/model', context);
    assert.deepEqual(calls, [
        'provider:add:ollama', 'provider:start', 'show:', 'provider:remove:ollama', 'model:menu',
    ]);
});
