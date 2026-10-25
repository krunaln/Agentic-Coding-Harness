Status: In progress

## Summary

Add OpenAI, Groq, FreeLLMAPI, and Ollama as model providers.

## Expected Behavior

MyAI can connect to each provider through one simple provider interface. Local
providers should work without sending requests to the cloud.

## Environment

- Product: MyAI Code Harness
- Branch: `main`
- Issue: HAR-001

## Acceptance Criteria

- Add OpenAI support.
- Keep the current Groq support.
- Add FreeLLMAPI support.
- Add Ollama support.
- Keep provider settings in one clear place.
- Show a clear error when a provider is not configured.

## Impact

High. This is the first step toward using MyAI with cheaper and local models.
