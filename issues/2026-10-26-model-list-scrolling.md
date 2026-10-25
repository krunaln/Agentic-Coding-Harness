# HAR-011 Scroll long model lists

Status: In progress

Keep the model picker usable when a service returns many models.

## Work

- Show only a small visible group of models.
- Move the visible group with the arrow keys.
- Show the current position in the full list.
- Keep model selection working after scrolling.

## Completed changes

- The picker shows 10 models at a time.
- Arrow keys move through the full list.
- The picker shows a range such as `Showing 1-10 of 75`.
- FreeLLMAPI's live catalog was tested with 75 models.
- Selecting a model after scrolling still updates the active model.

## Follow-up

- Add search or provider filtering if catalogs become much larger.
