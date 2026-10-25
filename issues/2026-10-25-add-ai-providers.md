Status: In progress

The work is now organized around global logins and model selection.

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

## New behavior

- Use `/login` to connect a service.
- Use `/logout` to disconnect one service.
- Use `/model` to refresh and choose models from authenticated services.
- Do not call model APIs for services without usable credentials.
- Do not change the current model automatically.
- Replace stale discovered models after a successful refresh.
- Keep long model lists inside a scrollable TUI window.

## Impact

High. This is the first step toward using MyAI with cheaper and local models.
