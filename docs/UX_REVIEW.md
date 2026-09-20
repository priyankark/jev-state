# Interaction review

This review used actual mouse, keyboard, and touch-sized browser interactions in Chrome, with screenshots inspected at 1440 × 960 and 390 × 844. The original smoke tests covered form submissions but did not exercise the canvas.

| Reproduced problem | Change |
| --- | --- |
| Dragging a state moved the canvas instead | Draggable states with saved coordinates; mouse tests verify the viewport stays put |
| Connection dots did nothing | Drag-to-connect, invalid/duplicate connection checks, clickable transition inspector and removal |
| Small graph above a long settings form | Canvas-first editor with independent State / Workflow settings and Save always above the canvas |
| Adding a state left it disconnected and hard to find | Connect from the selected non-terminal state, select the new state, and fit it into view |
| No recovery after graph edits | Undo/redo for state changes, connections, deletion and layout; keyboard shortcuts |
| Conversation graph clicks had no visible effect | State inspector with entry criteria, outgoing states, and a link to edit |
| Every incoming edge appeared active | Highlight only the actual transition for the inspected turn |
| Commas vanished while typing simulation keywords | Keep raw input while typing; parse on blur |
| Simulation looked like a broken natural-language conversation | Explain keyword matching beside the composer and offer actual fixture messages |
| Saving a moved node restarted conversations | Layout changes preserve the workflow version and active conversation |
| Changing initial state did not invalidate eval results | Include the initial state in the evaluation signature; exclude canvas coordinates |
| Graph selection could switch the settings panel unexpectedly | Only forward actual selection changes |
| Sending messages scrolled the whole page | Scroll the message list independently |
| Errors were hidden behind the eval/connection dialog | Inline modal errors, focus containment, Escape and focus restoration |
| Switching recent projects could discard edits silently | Unsaved-change guard on project changes and browser refresh |

## Regression checks

- `tests/e2e/graph.spec.ts`: drag vs pan, connection creation/removal, undo/redo, saved coordinates after reload, state editing/removal, simulation keyword typing, auto layout, expansion, conversation inspection, transition highlighting, layout edits during conversations, initial-state eval staleness, mobile overflow, modal errors and keyboard focus.
- `tests/e2e/cloud.spec.ts`: authenticated graph save and reopening in another browser context, conversation/eval persistence, and project limits. Uses an isolated temporary user and cleans up afterward.
- Existing local API, runtime, conversation, legacy studio and workspace browser tests remain in place.

The canvas still models flat workflows with up to 12 states. Nested/parallel statecharts and remote tool connectors remain outside this implementation. Narrow screens offer an expanded graph and a scrollable state picker; complex graphs may require zooming.
