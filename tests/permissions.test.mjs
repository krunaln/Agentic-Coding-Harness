import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessage } from '@langchain/core/messages';
import z from 'zod';
import { createAgent } from '../dist/agent/runner.js';
import { parsePermissionMode } from '../dist/permissions.js';

function mutationTool(executions) {
    return {
        name: 'change_file', label: 'Change file', description: 'Test mutation.',
        permission: 'workspace-write',
        schema: z.object({ path: z.string() }).strict(),
        execute(input) {
            executions.push(input.path);
            return { content: `changed ${input.path}`, details: { path: input.path } };
        },
    };
}

test('ask mode requests approval for every mutation tool call', async () => {
    const executions = [];
    const approvals = [];
    let step = 0;
    const agent = createAgent({
        permissionMode: 'ask', tools: [mutationTool(executions)],
        requestApproval: async request => { approvals.push(request); return true; },
        model: { async invoke() {
            if (step++ === 0) return new AIMessage({ content: '', tool_calls: [
                { id: 'one', name: 'change_file', args: { path: 'one.txt' } },
                { id: 'two', name: 'change_file', args: { path: 'two.txt' } },
            ] });
            return new AIMessage('done');
        } },
    });
    assert.equal(await agent.run('change two files'), 'done');
    assert.deepEqual(approvals.map(item => item.callId), ['one', 'two']);
    assert.deepEqual(executions, ['one.txt', 'two.txt']);
});

test('denied mutations are not executed and are returned to the model', async () => {
    const executions = [];
    let step = 0;
    const agent = createAgent({
        permissionMode: 'ask', tools: [mutationTool(executions)],
        requestApproval: async () => false,
        model: { async invoke(messages) {
            if (step++ === 0) return new AIMessage({ content: '', tool_calls: [
                { id: 'denied', name: 'change_file', args: { path: 'no.txt' } },
            ] });
            const toolMessage = messages.find(message => message.getType() === 'tool');
            assert.match(toolMessage.content, /Permission denied/);
            return new AIMessage('The change was not made.');
        } },
    });
    assert.equal(await agent.run('change a file'), 'The change was not made.');
    assert.deepEqual(executions, []);
});

test('full-access mode executes mutations without requesting approval', async () => {
    const executions = [];
    let approvalCalls = 0;
    let step = 0;
    const agent = createAgent({
        permissionMode: 'full-access', tools: [mutationTool(executions)],
        requestApproval: async () => { approvalCalls++; return false; },
        model: { async invoke() {
            if (step++ === 0) return new AIMessage({ content: '', tool_calls: [
                { id: 'allowed', name: 'change_file', args: { path: 'yes.txt' } },
            ] });
            return new AIMessage('done');
        } },
    });
    await agent.run('change a file');
    assert.equal(approvalCalls, 0);
    assert.deepEqual(executions, ['yes.txt']);
});

test('permission mode CLI parsing defaults to ask and validates values', () => {
    assert.equal(parsePermissionMode([]), 'ask');
    assert.equal(parsePermissionMode(['--permission-mode', 'full-access']), 'full-access');
    assert.equal(parsePermissionMode(['--full-access']), 'full-access');
    assert.throws(() => parsePermissionMode(['--permission-mode', 'invalid']), /ask.*full-access/);
});
