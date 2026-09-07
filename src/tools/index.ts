import { tool } from "langchain";
import z from "zod";
import type { StructuredToolInterface } from '@langchain/core/tools';
import { listFiles } from './list-files.js';
import { readFile } from './read-file.js';

export { listFiles, readFile };

export const getWeather = tool(
    (input) => `It's sunny in ${input.location}.`,
    {
        name: "get_weather",
        description: "Get the weather at a location.",
        schema: z.object({
            location: z.string().describe("The location to get the weather for"),
        }),
    },
)

export const getDay = tool(
    () => new Date().toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "Asia/Kolkata",
    }),
    {
        name: "get_day",
        description: "Get today's day of the week in India.",
        schema: z.object({}),
    },
);

export const agentTools: StructuredToolInterface[] = [getWeather, getDay, listFiles, readFile];

