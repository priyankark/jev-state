# Interaction review

This review used actual mouse, keyboard, and touch-sized browser interactions in Chrome, with screenshots inspected at 1440 × 960 and 390 × 844. The original smoke tests covered form submissions but did not exercise the canvas.

| Reproduced problem                                            | Change                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Dragging a state moved the canvas instead                     | Draggable states with saved coordinates; mouse tests verify the viewport stays put               |
| Connection dots did nothing                                   | Drag-to-connect, invalid/duplicate connection checks, clickable transition inspector and removal |
| Small graph above a long settings form                        | Canvas-first editor with independent State / Workflow settings and Save always above the canvas  |
| Adding a state left it disconnected and hard to find          | Connect from the selected non-terminal state, select the new state, and fit it into view         |
| No recovery after graph edits                                 | Undo/redo for state changes, connections, deletion and layout; keyboard shortcuts                |
| Conversation graph clicks had no visible effect               | State inspector with entry criteria, outgoing states, and a link to edit                         |
| Every incoming edge appeared active                           | Highlight only the actual transition for the inspected turn                                      |
| Commas vanished while typing simulation keywords              | Keep raw input while typing; parse on blur                                                       |
| Simulation looked like a broken natural-language conversation | Explain keyword matching beside the composer and offer actual fixture messages                   |
| Saving a moved node restarted conversations                   | Layout changes preserve the workflow version and active conversation                             |
| Changing initial state did not invalidate eval results        | Include the initial state in the evaluation signature; exclude canvas coordinates                |
| Graph selection could switch the settings panel unexpectedly  | Only forward actual selection changes                                                            |
| Sending messages scrolled the whole page                      | Scroll the message list independently                                                            |
| Errors were hidden behind the eval/connection dialog          | Inline modal errors, focus containment, Escape and focus restoration                             |
| Switching recent projects could discard edits silently        | Unsaved-change guard on project changes and browser refresh                                      |

## Regression checks

- `tests/e2e/graph.spec.ts`: drag vs pan, connection creation/removal, undo/redo, saved coordinates after reload, state editing/removal, simulation keyword typing, auto layout, expansion, conversation inspection, transition highlighting, layout edits during conversations, initial-state eval staleness, mobile overflow, modal errors and keyboard focus.
- `tests/e2e/workspace.spec.ts`: backup/restore of projects, conversations and evaluations; malformed backup rejection; corrupt data recovery; multiple-tab conflict prevention; quota failure feedback.
- Existing local API, runtime, conversation, legacy studio and workspace browser tests remain in place.

The canvas still models flat workflows with up to 12 states. Nested/parallel statecharts and remote tool connectors remain outside this implementation. Narrow screens offer an expanded graph and a scrollable state picker; complex graphs may require zooming.

## Open-source release validation

The subscription backend, account components, database migrations, payment SDK, and account-only tests were removed. The public demo runs simulation without a provider key. Tests cover fail-closed hosted live calls, shared access-code cookies, and same-origin requests.

Additional runtime coverage includes duplicate graph/case IDs, malformed provider distributions, workflow diagnostics, path coverage, full-history backup validation, and CLI pass/fail/error exit codes. New workspace browser tests caught and fixed an incorrect recovery message after resetting corrupt data.

A live TypeSafe run on September 20, 2026 passed the support example's three cases using `jev-1.13.0`: 5/5 states and 4/7 transitions exercised, 2,293 input tokens and 177 output tokens reported. This is a smoke check of that example, not a domain accuracy benchmark. OpenAI is tested against controlled SDK HTTP responses; no live OpenAI account inference was performed for this release.

## Outcome-driven workflow and code handoff

The primary job is now explicit: reproduce a conversational decision, fix its criteria, protect the behavior with tests, and use it in an application. The navigation is Define → Try → Test → Get code. Project creation asks for intended behavior, and each step has a contextual next action.

Conversations up to five user turns can become regression cases without retyping. The expected state is editable so failures do not become accepted behavior accidentally. Failed results link to state criteria and test expectations. The code page shows simulation and live evidence separately and marks changes, partial runs, missing cases, and failures honestly.

The handoff is a standalone TypeScript ZIP with a copyable integration example, exact shared runtime, workflow/test JSON, regression CLI, and setup instructions. Keys and conversation history are excluded; saved case messages are included. Unit and browser tests verify that the download compiles and runs outside this repo, preserves behavior, supports clipboard copying, and fits mobile screens.

## Conversation regression review

A second browser review found that final-state checks could hide a wrong intermediate decision, result dialogs buried user input in raw JSON, and deleting a referenced state silently removed its tests. Cases now support optional per-turn state checks, readable decision traces with exact recorded criteria, and a deletion guard requiring explicit test edits first. Early terminal exits preserve partial traces and fail clearly.

The test editor uses one multiline message box per user turn, with explicit add/remove controls. Mobile test cases stack vertically so results remain visible without horizontal scrolling. Comparisons distinguish behavioral regressions and fixes from changed expectations, provider errors, and incomplete runs. `tests/regressions.test.ts` covers comparison semantics and runtime assertions; `tests/e2e/regressions.spec.ts` exercises the edit → fail → inspect → fix loop, persistence, multiline messages, and mobile layout. Export tests execute intermediate assertions outside the repository. Downloads include simulation-only GitHub Actions checks.
