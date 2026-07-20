# Task type fields

## Objective

Show and persist structured fields that match the selected task type while keeping existing tasks and API clients compatible.

## Field sets

- Task: work content, completion criteria.
- Story: user story, background, acceptance criteria, business value.
- Bug: reproduction steps, expected result, actual result, environment, severity, affected version.

Bug reproduction steps, expected result, and actual result are required in the interactive task form. The API accepts empty type fields so existing tasks, spreadsheet imports, GitHub imports, plans, and bulk type changes remain valid.

## Contract

Task create and patch payloads accept an additive `typeFields` object. Task list responses return the object. Unknown keys are rejected at the API boundary. Existing rows return an empty/default object.

Changing the selected type only changes which inputs are visible. Values entered for another type remain in the draft and are persisted, so switching back does not discard work.

## Verification

- Contract tests cover defaults, accepted fields, limits, and unknown keys.
- Web unit tests cover stable defaults and preserving values across type changes.
- End-to-end coverage verifies the dynamic form and Bug required fields.
- `pnpm test` and `pnpm build` pass.
