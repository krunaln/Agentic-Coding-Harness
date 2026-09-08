import type z from 'zod';
import type { Workspace } from './workspace.js';

export type ToolExecutionContext = {
    workspace: Workspace;
    signal?: AbortSignal;
};

export type ToolResult<TDetails = unknown> = {
    /** Concise text sent back to the language model. */
    content: string;
    /** Structured information intended for the TUI, logs, and future session storage. */
    details?: TDetails;
};

export type ToolDefinition<TInput = unknown, TDetails = unknown> = {
    name: string;
    label: string;
    description: string;
    schema: z.ZodType<TInput, z.ZodTypeDef, any>;
    execute(
        input: TInput,
        context: ToolExecutionContext,
    ): Promise<ToolResult<TDetails>> | ToolResult<TDetails>;
};

export type AnyToolDefinition = ToolDefinition<any, any>;
