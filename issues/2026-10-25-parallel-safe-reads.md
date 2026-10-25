## Summary

Run independent read-only tools at the same time.

## Expected Behavior

Several safe reads can run together. File changes still happen in order, and
MyAI waits for every tool result before asking the model what to do next.

## Environment

- Product: MyAI Code Harness
- Issue: HAR-007

## Acceptance Criteria

- Run independent reads together.
- Keep file changes in order.
- Keep command execution safe.
- Show each tool result in the TUI.
- Add tests for mixed reads and changes.

## Impact

Medium. This can make multi-file tasks faster.
