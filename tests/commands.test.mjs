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
