import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Resolve configuration from the installed harness, independent of the folder
// that the CLI is currently using as its coding workspace.
export const harnessEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));

config({ path: harnessEnvPath });

export function getGroqApiKey() {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
        throw new Error(
            `GROQ_API_KEY is missing. Set it in ${harnessEnvPath} or in your shell environment.`,
        );
    }
    return apiKey;
}
