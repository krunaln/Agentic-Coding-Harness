import test from 'node:test';
import assert from 'node:assert/strict';
import { AIMessage } from '@langchain/core/messages';
import { createAgent } from '../dist/agent/runner.js';

const malformedProviderError = () => new Error(
    '400 {"error":{"code":"tool_use_failed","message":"Tool call validation failed"}}',
);

test('repairs one provider-rejected tool call and continues the turn', async () => {
    let calls = 0;
    const events = [];
    const model = {
        async invoke(messages) {
            calls++;
            if (calls === 1) throw malformedProviderError();
            if (calls === 2) {
                assert.equal(messages.at(-1).getType(), 'system');
                return new AIMessage({ content: '', tool_calls: [
                    { id: 'day', name: 'get_day', args: {} },
                ] });
            }
            assert.equal(messages.at(-1).getType(), 'tool');
            return new AIMessage('Repair succeeded.');
        },
    };
    const agent = createAgent({ model });
    assert.equal(await agent.run('What day is it?', event => events.push(event)), 'Repair succeeded.');
    assert.equal(events.filter(event => event.type === 'tool-repairing').length, 1);
    assert.equal(events.filter(event => event.type === 'tool-completed').length, 1);
});

test('asks an unbound model to explain failure after provider repair also fails', async () => {
    let primaryCalls = 0;
    let failureCalls = 0;
    const agent = createAgent({
        model: { async invoke() { primaryCalls++; throw malformedProviderError(); } },
        failureModel: { async invoke(messages) {
            failureCalls++;
            assert.equal(messages.at(-1).getType(), 'system');
            return new AIMessage("I couldn't complete the request because the tool arguments remained invalid.");
        } },
    });
    assert.match(await agent.run('Use a tool'), /couldn't complete/);
    assert.equal(primaryCalls, 2);
    assert.equal(failureCalls, 1);
});

test('returns a validation error to the model for one local repair attempt', async () => {
    let calls = 0;
    const events = [];
    const agent = createAgent({ model: { async invoke(messages) {
        calls++;
        if (calls === 1) return new AIMessage({ content: '', tool_calls: [
            { id: 'bad-read', name: 'read_file', args: {
                path: 'src/index.ts', line_start: 1, line_end: 2,
            } },
        ] });
        if (calls === 2) {
            const errorResult = messages.at(-1);
            assert.equal(errorResult.getType(), 'tool');
            assert.equal(errorResult.status, 'error');
            return new AIMessage({ content: '', tool_calls: [
                { id: 'good-read', name: 'read_file', args: {
                    path: 'src/index.ts', start_line: 1, end_line: 2,
                } },
            ] });
        }
        return new AIMessage('The corrected read succeeded.');
    } } });
    assert.equal(await agent.run('Read the entry point', event => events.push(event)), 'The corrected read succeeded.');
    assert.equal(events.filter(event => event.type === 'tool-repairing').length, 1);
    assert.equal(events.filter(event => event.type === 'tool-failed').length, 1);
    assert.equal(events.filter(event => event.type === 'tool-completed').length, 1);
});
