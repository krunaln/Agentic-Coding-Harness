import 'dotenv/config';
import { ChatGroq } from '@langchain/groq';
import { HumanMessage, type BaseMessage, type AIMessage } from '@langchain/core/messages';
import { agentTools } from '../tools/index.js';

export type AgentEvent =
    | { type: 'tool-started'; name: string; args: unknown }
    | { type: 'tool-completed'; name: string; result: unknown; durationMs: number }
    | { type: 'tool-failed'; name: string; error: string };

type Model = {
    invoke(messages: BaseMessage[], options: { signal?: AbortSignal }): Promise<AIMessage>;
};

export function createAgent(providedModel?: Model) {
    let history: BaseMessage[] = [];
    let running = false;
    let model = providedModel;

    return {
        async run(prompt: string, onEvent: (event: AgentEvent) => void = () => {}, signal?: AbortSignal) {
            if (running) throw new Error('An agent turn is already running.');
            if (!prompt.trim()) throw new Error('Enter a prompt first.');
            running = true;
            // Commit only completed turns so failed tool calls cannot corrupt history.
            const messages = [...history, new HumanMessage(prompt)];
            try {
                model ??= new ChatGroq({ model: 'openai/gpt-oss-20b', temperature: 0 })
                    .bindTools(agentTools);
                    
                for (let step = 0; step < 10; step++) {
                    signal?.throwIfAborted();
                    const response = await model.invoke(messages, { signal });
                    messages.push(response);
                    if (!response.tool_calls?.length) {
                        if (!response.text.trim()) throw new Error('Model returned no text and no tool calls.');
                        history = messages;
                        return response.text;
                    }
                    for (const call of response.tool_calls) {
                        signal?.throwIfAborted();
                        onEvent({ type: 'tool-started', name: call.name, args: call.args });
                        const started = performance.now();
                        try {
                            const selectedTool = agentTools.find(tool => tool.name === call.name);
                            if (!selectedTool) {
                                throw new Error(`Unknown tool: ${call.name}`);
                            }
                            const toolCall = { ...call, type: 'tool_call' as const };
                            const result = await selectedTool.invoke(toolCall, { signal });
                            messages.push(result);
                            onEvent({ type: 'tool-completed', name: call.name, result: result.content,
                                durationMs: Math.round(performance.now() - started) });
                        } catch (error) {
                            onEvent({ type: 'tool-failed', name: call.name,
                                error: error instanceof Error ? error.message : String(error) });
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
