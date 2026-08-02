# Tasks

- [x] Review the current RSS fetch, hotspot selection, category overview, and draft page state flow in `src/App.tsx`.
- [x] Change RSS fetch completion so no hotspot is selected for generation by default.
- [x] Add or wire a category-level generation action that selects all articles in the current category before generating the roundtable.
- [x] Keep viewing/focusing a hotspot separate from selecting it for generation.
- [x] Audit the roundtable draft page interactions one by one: empty state, generating state, interactive interruption, user input, finish, save, export, status switch, and source opening.
- [x] Fix any draft page interaction defects found during the audit with small scoped changes.
- [x] Add focused logic tests for RSS default selection and category-wide selection behavior.
- [x] Verify with typecheck, lint, relevant logic tests, and a production build where the local environment permits it. Typecheck, lint, and logic tests pass; production build remains blocked by the current sandbox denying esbuild access while resolving `vite.config.ts`.
