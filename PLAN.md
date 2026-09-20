# Roadmap

Jev State is a local-first, MIT-licensed development studio. Account management, subscription gates, payment integrations, and managed cloud storage are outside the current product.

## Available

- Editable flat state machines with direct graph interactions, saved positions, undo/redo, and advisory diagnostics.
- Multi-turn simulation and live Jev routing; optional OpenAI Responses replies.
- Turn inspection, project snapshots, confidence thresholds, and stale-report detection.
- Evaluation cases, JSON reports, path coverage, and a CLI with CI exit codes.
- Project import/export and complete workspace backups; corrupt-storage and multi-tab protection.
- Local, Docker, and Vercel entrypoints; a simulation-only public demo.
- Typed single-decision actors with Choice, Noul, Score, cancellation, and a runnable example.

## Next, based on user feedback

1. **Better evaluations:** intermediate-state assertions, dataset comparison, threshold sweeps, and clearer partial-failure usage accounting.
2. **Larger workspaces:** IndexedDB persistence, explicit history retention controls, search, and more extensive schema migration support.
3. **Richer workflow semantics:** per-edge criteria, nested states, parallel regions, and an explicit compatibility boundary with XState imports/exports.
4. **Reusable runtime:** stable public APIs, packaged artifacts, versioned file formats, and published npm packages.
5. **Agent integrations:** explicit adapters for remote agents and tools, with cancellation, authorization, and inspectable side effects.

These are proposals, not promises or implemented features. Good contributions include small representative workflows, concrete UX reports, and failing evaluation cases with sanitized inputs.
