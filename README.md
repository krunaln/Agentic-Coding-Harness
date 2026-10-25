# agent_study

MyAI is a small coding helper that runs in your terminal.

## Development

Copy `.env.example` to `.env` in this repository and add your `GROQ_API_KEY`.
MyAI uses this key even when you start it from another project. A key already
set in your terminal takes priority. MyAI does not read the other project's
`.env` file. Restart MyAI after changing the key.

MyAI opens a terminal screen. Type a request and press Enter. You will see the
work it does and its answer. Press Ctrl+C to exit. The weather tool is only a
demo and returns made-up weather.

```sh
npm install
npm run dev
```

## Run from any project

Link the CLI once from this repository:

```sh
npm run link-cli
```

Then open any project directory and launch the harness. That directory becomes
the workspace used by `list_files`, `read_file`, and `search_code`:

```sh
cd path/to/another-project
myai
```

Run `npm unlink --global agentic-coding-harness` to remove the linked command.

## Build and run

```sh
npm run build
npm start
```

Run `npm run typecheck` to check types without generating output.

## Permission modes

MyAI starts in `ask` mode. Before it changes a file or runs a command, it asks
you to type `yes` or `no`:

```sh
myai
# or
myai --permission-mode ask
```

Full-access mode skips these questions:

```sh
myai --permission-mode full-access
# shorthand
myai --full-access
```

Read-only tools never need approval.

## Sessions

Completed turns are saved under `~/.myai/sessions/`, separately for each
project. This lets you continue work later with the same conversation.

```sh
myai                         # start a new saved session
myai --continue              # continue the latest session in this workspace
myai -c                      # shorthand for --continue
myai --resume <id-or-path>   # resume a specific session
myai --no-session            # run without writing a session file
```

## Providers and models

MyAI can use Groq, OpenAI, FreeLLMAPI, and Ollama. Add providers and models
from the TUI:

```text
/provider list
/provider add ollama
/model
```

Global models are available in every project. A model added without `--global`
belongs to the current project. Project settings win over global settings.
Tasks use the main model unless a task model is set.

Use `--provider` or `--model` for a one-time choice:

```text
myai --provider ollama
myai --model ollama:qwen
```

API keys stay in environment variables. Ollama and FreeLLMAPI use local
OpenAI-compatible addresses. OpenAI API-key mode is supported. ChatGPT sign-in
is recorded as a provider option, but needs an official standalone sign-in flow.

You can only open a session in the project where it was created. Failed or
cancelled turns are not saved.

## Slash commands

Type `/` to open the command menu. Continue typing to filter, use the up/down
arrows to select an option, press Tab to complete it, or press Enter to execute
the highlighted command.

- `/help` — show every command
- `/new` — create and switch to a new session
- `/resume <id|path>` — load a session and its model history
- `/session` — show the active session ID, file, creation time, and message count
- `/permissions` — show the active permission mode
- `/clear` — clear the visible transcript without deleting session history
- `/quit` — exit MyAI (`/exit` is an alias)

## Workspace tools

The workspace is the folder where you start MyAI.

Tool output is kept small so it does not fill the conversation. Long results
show a note telling you that some output was left out.

- `list_files`: lists files and directories, optionally recursively. Skips
  `.git`, `node_modules`, `dist`, and symlinks; defaults to 200 entries.
- `read_file`: reads UTF-8 text with line numbers. Accepts `start_line` and
  `end_line`; defaults to 200 lines, capped at 500 lines and 20,000 characters.
  Files larger than 1 MiB and binary files are rejected.
- `search_code`: searches literal text recursively, returning workspace-relative
  paths, line numbers, and snippets. Supply `query`, optional file/directory
  `path`, `case_sensitive` (default false), and `limit` (default 50, maximum 200).
  Skips generated folders, `.env` files (except `.env.example`), nested symlinks,
  binary/non-UTF-8 files, and files over 1 MiB. Searches at most 10,000 entries
  and returns at most 20,000 snippet/path characters. Narrow the query or path
  when `truncated` is true. Results also report skipped-file counts and clipped
  snippets. This searches literal text, not regex, and does not apply `.gitignore`.
- `write_file`: creates or completely replaces a UTF-8 file and creates missing
  parent directories. Content is limited to 1,000,000 characters.
- `edit_file`: replaces exact text in an existing UTF-8 file. A normal edit must
  match once; set `replace_all` explicitly when every occurrence should change.
  Binary, invalid UTF-8, and files larger than 1 MiB are rejected.
- `delete_file`: permanently deletes one existing regular file.
- `remove_directory`: removes an empty directory by default. Recursive removal
  requires `recursive: true`, and the workspace root can never be removed.
- `execute_command`: executes PowerShell on Windows or Bash on Linux/macOS.
  Supports a workspace-relative `cwd`, explicit shell selection, cancellation,
  and timeouts from 1 second to 10 minutes (default 2 minutes). Captures bounded
  stdout and stderr together with exit code, signal, duration, and timeout state.

All four file mutation tools share a per-workspace queue, so concurrent tool calls
change files in submission order.

All workspace tools reject paths outside the workspace, including symlinks resolving
outside it. Try: "List the files in src and read src/agent/runner.ts."
For search, try: "Find where createAgent is used in src."

### Tool architecture

`createToolDefinitions(workspace)` creates a fresh registry bound to the active
workspace. There is no process-global tool array. Each `ToolDefinition` contains
the model schema, description, display label, and an `execute` function.

Execution returns a `ToolResult` with two channels:

- `content`: bounded text added to the model conversation as a `ToolMessage`.
- `details`: structured metadata emitted to the TUI and kept out of model context.

The agent runner validates model arguments with the definition's Zod schema,
executes the matching definition, applies the final output limit, creates the
LangChain `ToolMessage`, and emits `details` with the completion event. This is
the boundary where a permission check can be added before execution.

Malformed tool calls get one repair attempt per user turn. Provider-rejected
calls are regenerated once with an explicit schema reminder. Locally rejected
arguments and unknown tool names are returned as error `ToolMessage` objects so
the model can correct them once. If the repaired call is also malformed, an
unbound model produces a brief failure response without access to tools.

Verify workspace tools with `npm run build` followed by
`node --test tests/*.test.mjs`.
