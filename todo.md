# MyAI To-Do List

This list is for building MyAI. It is not a plan for one user request.

Status words: `Backlog`, `In progress`, `Blocked`, and `Done`.

## Next

- [ ] [HAR-001](issues/2026-10-25-add-ai-providers.md) Add more AI providers
  - Add OpenAI, Groq, FreeLLMAPI, and Ollama.
  - Keep each provider behind the same simple interface.
  - Keep provider settings in one place.
  - Make it easy to choose a provider and model.

- [ ] [HAR-002](issues/2026-10-25-task-models.md) Choose models for different tasks
  - Choose one model for normal coding work.
  - Choose another model for small or cheap tasks.
  - Allow separate choices for summaries, tool use, and reviews.
  - Keep the default setup simple.

- [ ] [HAR-003](issues/2026-10-25-plan-mode.md) Add plan mode
  - MyAI should first make a plan, show it, and wait for approval.
  - The user can change the plan before work starts.
  - MyAI can read files while planning.
  - MyAI cannot change files or run commands until approval.
  - The plan and result are saved in the session.

## Backlog

- [ ] [HAR-004](issues/2026-10-25-project-docs.md) Add project docs
- [ ] [HAR-005](issues/2026-10-25-more-commands.md) Add the remaining commands
- [ ] [HAR-006](issues/2026-10-25-more-tests.md) Add more tests
- [ ] [HAR-007](issues/2026-10-25-parallel-safe-reads.md) Run safe read-only tools at the same time. Keep file changes in order.
- [ ] [HAR-008](issues/2026-10-25-file-diffs.md) Show a file diff after every file change.
- [ ] [HAR-009](issues/2026-10-25-publish-npm.md) Publish MyAI to npm
- [ ] [HAR-011](issues/2026-10-26-model-list-scrolling.md) Scroll long model lists

- [ ] [HAR-010](issues/2026-10-26-ink-tui-tests.md) Test the TUI with Ink testing tools
  - Test login, logout, and model selection with keyboard input.
  - Check menus, prompts, errors, and cancel actions.
  - Keep fake provider tests separate from live services.
