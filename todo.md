# TODO

- Add project documentation
- Implement CLI commands
- Write tests
- Run independent read-only tool calls concurrently, keep filesystem mutations
  serialized through the workspace mutation queue, and wait for every tool call
  in the model response before invoking the model again.
- Implement a per-file diff view for every file mutation, rendered in the TUI
  and exposed consistently in every supported interaction mode.
- Publish to npm
