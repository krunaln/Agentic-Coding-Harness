# MyAI Code Harness

This repository contains a TypeScript/Node.js terminal coding harness called
`myai`. It provides an Ink TUI, a Groq-backed LangChain agent, workspace-scoped
filesystem tools, shell execution, permissions, and session persistence.

## Issue writing

Use the `github-issue-creator` skill for new issues and bug reports. Keep issue
files in `issues/` at the repository root. Use simple English, clear steps,
expected behavior, actual behavior, impact, and useful context. Link each issue
to its backlog item in `todo.md`.

## Current project state

- The primary development branch is `main`.
- The user launches `myai` from any directory; that directory becomes the active
  workspace. The harness repository's `.env` supplies `GROQ_API_KEY`, while the
  target workspace's `.env` is never loaded as harness configuration.
- The Needle router experiment is isolated on `codex/needle-router` and is not
  part of the active `main` implementation.
- The TUI is implemented with Ink and `ink-text-input`.
- The model uses LangChain message and tool abstractions. Tool schemas use Zod.

## Development commands

Run these from the repository root:

```powershell
npm install
npm run dev
npm run typecheck
npm run build
node --test tests/*.test.mjs
npm run link-cli
```

`npm run link-cli` builds the project and updates the globally linked `myai`
command. Use `myai` from another directory to test workspace binding. The CLI
supports `--permission-mode ask`, `--permission-mode full-access`,
`--full-access`, `--continue`, `--resume <id-or-path>`, and `--no-session`.

Before committing a code change, run `npm run build` and
`node --test tests/*.test.mjs`. Run `npm run typecheck` when changing TypeScript
types or public interfaces.

## Architecture

`src/index.ts` parses CLI arguments and opens the workspace session. The Ink
application lives in `src/tui/`. `src/agent/runner.ts` owns the model turn loop,
tool validation, permission checks, tool execution, repair behavior, event
emission, and history commits.

`createToolDefinitions(workspace)` in `src/tools/index.ts` creates a fresh,
workspace-bound registry for every agent. Do not introduce a process-global
`agentTools` array. A tool is a `ToolDefinition` with a name, label, model
description, Zod input schema, optional permission requirement, and `execute`
function. Its result is a `ToolResult`:

- `content` is concise, bounded text sent to the model in a LangChain
  `ToolMessage`.
- `details` is structured metadata for the TUI, logs, and future session data;
  it is not added to the model context.

Filesystem tools must use the workspace helpers in `src/tools/workspace.ts`.
They must reject paths outside the workspace and paths whose symlinks resolve
outside it. File mutations use the per-workspace `FileMutationQueue` so
concurrent writes are serialized in submission order.

All tool output goes through the shared truncation utilities in
`src/tools/truncation.ts`. Preserve complete collection items when truncating;
never cut JSON or an item in the middle. Keep model-facing output concise and
put counts, byte totals, and truncation metadata in `details`.

The two permission modes are:

- `ask`: every tool declaring `workspace-write` or `command-execution` requires
  approval for that call.
- `full-access`: those tools run without an approval prompt.

Read-only tools do not require approval. Keep permission enforcement in the
agent runner so every interface receives the same policy.

Sessions are append-only JSONL files under `~/.myai/sessions/`, partitioned by
workspace. Only completed turns are committed. A session must never be resumed
from a different workspace.

## Tool behavior

The current tools are `list_files`, `read_file`, `search_code`, `write_file`,
`edit_file`, `delete_file`, `remove_directory`, and `execute_command`, plus the
mock `get_weather` and `get_day` tools. `execute_command` runs PowerShell on
Windows and Bash on Linux/macOS, always inside the workspace, with bounded
stdout/stderr capture and a timeout.

The runner validates every model call against the selected tool's Zod schema.
Malformed provider calls, invalid local arguments, unknown tool names, and
runtime tool errors should be represented as error `ToolMessage` values so the
model can repair the request once. Abort signals must propagate immediately.
After a failed repair, return a clear final failure response instead of looping
indefinitely or crashing the TUI.

## TUI conventions

Emit agent events for tool start, completion, failure, repair, permission
requests, and permission results. Render concise model-facing content in the
transcript, and use `details` for richer status panels. Keep input disabled
while a turn is running and preserve the slash-command behavior in
`src/commands/`.

## Change guidelines

Use simple English in all user-facing text. This includes the README, help
text, TUI messages, tool descriptions, comments, and backlog items. Prefer
short sentences and common words. Explain technical terms when they are needed.

- Preserve the active workspace boundary for every new tool.
- Add or update a focused test for new tool behavior, permission behavior,
  session behavior, or repair behavior.
- Prefer existing utilities and types over duplicate path, truncation, or
  serialization logic.
- Do not silently broaden permissions or execute commands outside the workspace.
- Keep changes on `main` unless the user explicitly asks for an experiment or
  isolated branch.
- Do not commit `.env`, API keys, session data, `dist/`, or generated cache
  files.
