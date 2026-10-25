# HAR-010 Test the TUI with Ink testing tools

Status: In progress

Use ink-testing-library to test the visible MyAI screens and keyboard actions.

## Work

- Export the main Ink app for tests.
- Test login, logout, and model selection.
- Test contextual input prompts and Escape cancellation.
- Test no-login and no-model messages.
- Keep tests offline with fake settings and provider responses.

## Live regression notes

- FreeLLMAPI at `http://127.0.0.1:31415` returned a real model catalog.
- The model picker displayed 75 models and scrolling worked.
- Read-only listing, file creation, file reading, and file deletion completed through the TUI.
- Login state is now shown as one global connected-login list.
- Ollama was saved in the test settings, but its local endpoint was unavailable. The model picker reported that failure instead of adding fake models.

## Improvements found

- Verify a saved login against its provider before calling it connected. A saved Ollama entry can still say `configured` while the service is offline.
- Keep the model picker loading and error states visible while discovery is running.
- Add a focused logout test that selects a login and checks that its models disappear.

The login screen now performs a short provider connection check when it opens and reports endpoint failures as `not connected`.

The latest run also exposed a race in the manual Ink driver: approval text can be appended to the next prompt when the driver submits `yes` while the approval box is changing. The app should keep input locked until the approval result is cleared, and the manual driver should wait for the approval frame to disappear before sending the next prompt.

After adding that wait, the run reached the `/logout` step but did not render the logout menu before the timeout. This needs a direct Ink test for slash-command menu opening; the current live script should remain separate until that flow is fixed.
