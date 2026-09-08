import type { StructuredToolInterface } from '@langchain/core/tools';
import { tool } from 'langchain';
import z from 'zod';
import { createDeleteFileTool } from './delete-file.js';
import { createEditFileTool } from './edit-file.js';
import { FileMutationQueue } from './file-mutation-queue.js';
import { createListFilesTool } from './list-files.js';
import { createReadFileTool } from './read-file.js';
import { createRemoveDirectoryTool } from './remove-directory.js';
import { createSearchCodeTool } from './search-code.js';
import { createWriteFileTool } from './write-file.js';
import type { AnyToolDefinition, ToolDefinition } from './types.js';
import type { Workspace } from './workspace.js';

export type { AnyToolDefinition, ToolDefinition, ToolResult } from './types.js';
export { createWorkspace, type Workspace } from './workspace.js';

function createWeatherTool(): ToolDefinition<{ location: string }, { location: string; mocked: true }> {
    return {
        name: 'get_weather',
        label: 'Get weather',
        description: 'Get mock weather at a location.',
        schema: z.object({
            location: z.string().describe('The location to get the weather for.'),
        }).strict(),
        execute(input) {
            return {
                content: `It's sunny in ${input.location}.`,
                details: { location: input.location, mocked: true },
            };
        },
    };
}

function createDayTool(): ToolDefinition<Record<string, never>, { timeZone: string }> {
    const timeZone = 'Asia/Kolkata';
    return {
        name: 'get_day',
        label: 'Get day',
        description: "Get today's day of the week in India.",
        schema: z.object({}).strict(),
        execute() {
            return {
                content: new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone }),
                details: { timeZone },
            };
        },
    };
}

/** Build a fresh registry whose filesystem tools are bound to one workspace. */
export function createToolDefinitions(workspace: Workspace): AnyToolDefinition[] {
    const mutationQueue = new FileMutationQueue();
    return [
        createWeatherTool(),
        createDayTool(),
        createListFilesTool(workspace),
        createReadFileTool(workspace),
        createSearchCodeTool(workspace),
        createWriteFileTool(workspace, mutationQueue),
        createEditFileTool(workspace, mutationQueue),
        createDeleteFileTool(workspace, mutationQueue),
        createRemoveDirectoryTool(workspace, mutationQueue),
    ];
}

/** Adapt definitions to LangChain tools for provider schema binding. */
export function createModelTools(
    definitions: AnyToolDefinition[],
    workspace: Workspace,
): StructuredToolInterface[] {
    return definitions.map(definition => tool(
        async (input, config) => {
            const result = await definition.execute(input, {
                workspace,
                signal: config?.signal,
            });
            return result.content;
        },
        {
            name: definition.name,
            description: definition.description,
            schema: definition.schema,
        },
    ));
}

