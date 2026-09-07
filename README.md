# agent_study

Node.js project using TypeScript and ES modules.

## Development

Create a `.env` file in the project root using `.env.example` and set
`GROQ_API_KEY` to your Groq API key. The entry point loads it with
`import "dotenv/config"`; access variables through `process.env`.
Restart the development process after changing `.env`.

The app opens an Ink terminal interface. Type a prompt and press Enter to run
the agent. Tool activity and answers appear in the transcript. Conversation
history lasts until you exit. Input pauses during each turn; Ctrl+C exits.
The weather tool currently returns mock weather.

```sh
npm install
npm run dev
```

## Build and run

```sh
npm run build
npm start
```

Run `npm run typecheck` to check types without generating output.

## Workspace tools

The workspace root is the directory where you launch the app.

- `list_files`: lists files and directories, optionally recursively. Skips
  `.git`, `node_modules`, `dist`, and symlinks; defaults to 200 entries.
- `read_file`: reads UTF-8 text with line numbers. Accepts `start_line` and
  `end_line`; defaults to 200 lines, capped at 500 lines and 20,000 characters.
  Files larger than 1 MiB and binary files are rejected.

Both tools reject paths outside the workspace, including symlinks resolving
outside it. Try: "List the files in src and read src/agent/runner.ts."

Verify workspace tools with `npm run build` followed by
`node --test tests/files.test.mjs`.
