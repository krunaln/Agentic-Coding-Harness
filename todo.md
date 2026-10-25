# MyAI Product Backlog

This file tracks work required to build and mature the reusable coding harness.
It is a product backlog, not the runtime plan for an individual user request.

## Next

- [ ] HAR-001 Implement plan mode
  - Goal: let the harness inspect a request, explore the workspace, propose an
    implementation plan, and wait for the user to approve or revise it before
    making changes.
  - Acceptance criteria:
    - The agent can enter and leave plan mode from the TUI.
    - Read-only tools remain available while planning.
    - Mutation and command tools are blocked until approval.
    - The plan is visible in the TUI and can be revised before execution.
    - The approved plan and execution outcome are persisted in the session.

## Backlog

- [ ] HAR-002 Add project documentation
- [ ] HAR-003 Implement remaining CLI commands
- [ ] HAR-004 Write and expand automated tests
- [ ] HAR-005 Run independent read-only tool calls concurrently, keep filesystem mutations
  serialized through the workspace mutation queue, and wait for every tool call
  in the model response before invoking the model again.
- [ ] HAR-006 Implement a per-file diff view for every file mutation, rendered in the TUI
  and exposed consistently in every supported interaction mode.
- [ ] HAR-007 Publish to npm
