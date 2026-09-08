# agent_study

Node.js project using TypeScript and ES modules.

## Development

Create a `.env` file in the harness repository using `.env.example` and set
`GROQ_API_KEY` to your Groq API key. The CLI resolves this file relative to its
installed code, so it continues working when `myai` is launched from another
project. A `GROQ_API_KEY` already set in the shell takes precedence. The target
workspace's `.env` is never loaded as harness configuration. Restart the CLI
after changing the harness `.env`.

The app opens an Ink terminal interface. Type a prompt and press Enter to run
the agent. Tool activity and answers appear in the transcript. Conversation
history lasts until you exit. Input pauses during each turn; Ctrl+C exits.
The weather tool currently returns mock weather.

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

## Workspace tools

The workspace root is the directory where you launch the app.

All tools use a shared head-truncation policy. Text output is limited to 20,000
UTF-8 bytes or 500 lines, with truncation metadata included in structured
results. Collection-based tools keep complete entries rather than cutting JSON
mid-item. Tool-specific input limits may stop collection earlier.

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

All four mutation tools share a per-workspace queue, so concurrent tool calls
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
