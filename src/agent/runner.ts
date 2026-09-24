import { ChatGroq } from '@langchain/groq';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { ZodError } from 'zod';
import { getGroqApiKey } from '../config/env.js';
import { createModelTools, createToolDefinitions } from '../tools/index.js';
import type { AnyToolDefinition } from '../tools/types.js';
import { boundedToolText } from '../tools/truncation.js';
import { createWorkspace, type Workspace } from '../tools/workspace.js';
import type { ApprovalRequest, PermissionMode } from '../permissions.js';

export type AgentEvent =
    | { type: 'tool-started'; callId: string; name: string; label: string; args: unknown }
    | { type: 'tool-repairing'; callId?: string; name?: string; label?: string; error: string; attempt: 1 }
    | { type: 'permission-requested'; callId: string; name: string; label: string; args: unknown }
    | { type: 'permission-granted'; callId: string; name: string; label: string }
    | { type: 'permission-denied'; callId: string; name: string; label: string }
    | { type: 'tool-completed'; callId: string; name: string; label: string; content: string; details?: unknown; durationMs: number }
    | { type: 'tool-failed'; callId: string; name: string; label: string; error: string; durationMs: number };

type Model = {
    invoke(messages: BaseMessage[], options: { signal?: AbortSignal }): Promise<AIMessage>;
};

export type CreateAgentOptions = {
    workspace?: Workspace;
    model?: Model;
    failureModel?: Model;
    tools?: AnyToolDefinition[];
    permissionMode?: PermissionMode;
    requestApproval?: (request: ApprovalRequest) => Promise<boolean>;
    initialHistory?: BaseMessage[];
    onHistoryCommitted?: (messages: BaseMessage[]) => Promise<void> | void;
};

export function createAgent(options: CreateAgentOptions = {}) {
    const workspace = options.workspace ?? createWorkspace();
    const definitions = options.tools ?? createToolDefinitions(workspace);
    const modelTools = createModelTools(definitions, workspace);
    let history: BaseMessage[] = [...(options.initialHistory ?? [])];
    let running = false;
    let model = options.model;
    let failureModel = options.failureModel;
    const permissionMode = options.permissionMode ?? 'ask';

    async function commit(messages: BaseMessage[], previousLength: number) {
        const added = messages.slice(previousLength);
        await options.onHistoryCommitted?.(added);
        history = messages;
    }

    function isMalformedToolCallError(error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('tool_use_failed')
            || message.includes('Tool call validation failed')
            || message.includes('tool call validation failed')
            || message.includes('Failed to parse tool call arguments');
    }

    function errorMessage(error: unknown) {
        return (error instanceof Error ? error.message : String(error)).slice(0, 1500);
    }

    async function requestToolApproval(request: ApprovalRequest, signal?: AbortSignal) {
        if (!options.requestApproval) return false;
        if (!signal) return options.requestApproval(request);
        signal.throwIfAborted();
        let abort: (() => void) | undefined;
        const aborted = new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            signal.addEventListener('abort', abort, { once: true });
        });
        try {
            return await Promise.race([options.requestApproval(request), aborted]);
        } finally {
            if (abort) signal.removeEventListener('abort', abort);
        }
    }

    return {
        async run(prompt: string, onEvent: (event: AgentEvent) => void = () => {}, signal?: AbortSignal) {
            if (running) throw new Error('An agent turn is already running.');
            if (!prompt.trim()) throw new Error('Enter a prompt first.');
            running = true;
            // Commit only completed turns so failed tool calls cannot corrupt history.
            const messages = [...history, new HumanMessage(prompt)];
            const previousLength = history.length;
            let repairUsed = false;
            try {
                if (!model) {
                    const baseModel = new ChatGroq({
                        apiKey: getGroqApiKey(),
                        model: 'openai/gpt-oss-20b',
                        temperature: 0,
                    });
                    model = baseModel.bindTools(modelTools);
                    failureModel ??= baseModel;
                }
                const activeModel = model;

                const finishWithFailure = async (reason: string) => {
                    let response: AIMessage;
                    if (failureModel) {
                        try {
                            response = await failureModel.invoke([
                                ...messages,
                                new SystemMessage(
                                    `A tool call could not be completed after one repair attempt. `
                                    + `Do not call any tools. Briefly tell the user that you could not complete the request and why. `
                                    + `Failure: ${reason}`,
                                ),
                            ], { signal });
                        } catch {
                            response = new AIMessage(`I couldn't complete the request because the tool call remained invalid after one repair attempt.`);
                        }
                    } else {
                        response = new AIMessage(`I couldn't complete the request because the tool call remained invalid after one repair attempt.`);
                    }
                    if (!response.text.trim()) {
                        response = new AIMessage(`I couldn't complete the request because the tool call remained invalid after one repair attempt.`);
                    }
                    messages.push(response);
                    await commit(messages, previousLength);
                    return response.text;
                };

                const invokeModel = async () => {
                    try {
                        return await activeModel.invoke(messages, { signal });
                    } catch (error) {
                        if (!isMalformedToolCallError(error)) throw error;
                        const failure = errorMessage(error);
                        if (repairUsed) return finishWithFailure(failure);
                        repairUsed = true;
                        onEvent({ type: 'tool-repairing', error: failure, attempt: 1 });
                        try {
                            return await activeModel.invoke([
                                ...messages,
                                new SystemMessage(
                                    `Your previous tool call was rejected because its arguments did not match the provided schema. `
                                    + `Repair it once: use the exact argument names and types from the tool schema, then issue the corrected tool call. `
                                    + `Do not explain the error. Provider error: ${failure}`,
                                ),
                            ], { signal });
                        } catch (retryError) {
                            if (!isMalformedToolCallError(retryError)) throw retryError;
                            return finishWithFailure(errorMessage(retryError));
                        }
                    }
                };
                    
                for (let step = 0; step < 10; step++) {
                    signal?.throwIfAborted();
                    const response = await invokeModel();
                    if (typeof response === 'string') return response;
                    messages.push(response);
                    if (!response.tool_calls?.length) {
                        if (!response.text.trim()) throw new Error('Model returned no text and no tool calls.');
                        await commit(messages, previousLength);
                        return response.text;
                    }
                    for (const call of response.tool_calls) {
                        signal?.throwIfAborted();
                        const callId = call.id ?? `${call.name}-${step}`;
                        const selectedTool = definitions.find(tool => tool.name === call.name);
                        const label = selectedTool?.label ?? call.name;
                        onEvent({ type: 'tool-started', callId, name: call.name, label, args: call.args });
                        const started = performance.now();
                        try {
                            if (!selectedTool) {
                                const failure = `Unknown tool requested: ${call.name}`;
                                onEvent({ type: 'tool-failed', callId, name: call.name, label,
                                    error: failure, durationMs: Math.round(performance.now() - started) });
                                messages.push(new ToolMessage({
                                    content: `${failure}. Retry once using one of the provided tool names.`,
                                    tool_call_id: callId,
                                    name: call.name,
                                    status: 'error',
                                }));
                                if (repairUsed) return finishWithFailure(failure);
                                repairUsed = true;
                                onEvent({ type: 'tool-repairing', callId, name: call.name, label, error: failure, attempt: 1 });
                                continue;
                            }
                            let input: unknown;
                            try {
                                input = await selectedTool.schema.parseAsync(call.args);
                            } catch (error) {
                                if (!(error instanceof ZodError)) throw error;
                                const failure = `Invalid arguments for ${call.name}: ${error.issues
                                    .map(issue => `${issue.path.join('.') || 'arguments'}: ${issue.message}`).join('; ')}`;
                                onEvent({ type: 'tool-failed', callId, name: call.name, label,
                                    error: failure, durationMs: Math.round(performance.now() - started) });
                                messages.push(new ToolMessage({
                                    content: `${failure}. Retry this tool call once using the exact schema argument names and types.`,
                                    tool_call_id: callId,
                                    name: call.name,
                                    status: 'error',
                                }));
                                if (repairUsed) return finishWithFailure(failure);
                                repairUsed = true;
                                onEvent({ type: 'tool-repairing', callId, name: call.name, label, error: failure, attempt: 1 });
                                continue;
                            }
                            if (selectedTool.permission && permissionMode === 'ask') {
                                onEvent({ type: 'permission-requested', callId, name: call.name, label, args: input });
                                const approved = await requestToolApproval({
                                    callId, toolName: call.name, toolLabel: label, args: input,
                                }, signal);
                                if (!approved) {
                                    const failure = `Permission denied for ${call.name}.`;
                                    onEvent({ type: 'permission-denied', callId, name: call.name, label });
                                    messages.push(new ToolMessage({
                                        content: failure,
                                        tool_call_id: callId,
                                        name: call.name,
                                        status: 'error',
                                    }));
                                    continue;
                                }
                                onEvent({ type: 'permission-granted', callId, name: call.name, label });
                            }
                            const result = await selectedTool.execute(input, { workspace, signal });
                            // Final safety net for every registered text tool, including
                            // tools added later without their own structured truncation.
                            const content = boundedToolText(result.content);
                            messages.push(new ToolMessage({
                                content,
                                tool_call_id: callId,
                                name: call.name,
                            }));
                            onEvent({ type: 'tool-completed', callId, name: call.name, label, content,
                                details: result.details,
                                durationMs: Math.round(performance.now() - started) });
                        } catch (error) {
                            onEvent({ type: 'tool-failed', callId, name: call.name, label,
                                error: error instanceof Error ? error.message : String(error),
                                durationMs: Math.round(performance.now() - started) });
                            throw error;
                        }
                    }
                }
                throw new Error('No final answer after 10 model responses.');
            } finally {
                running = false;
            }
        },
    };
}
