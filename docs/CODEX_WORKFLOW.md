# Codex Workflow

## Best-Practice Basis
Codex should work from explicit success criteria, local project instructions, and verification commands. `AGENTS.md` holds short project rules; detailed rules live in this directory.

## Implementation Phases
1. Read `AGENTS.md`, the relevant `docs/` file, and nested `AGENTS.md` files.
2. Inspect the current code before editing.
3. Make focused changes that preserve the Tauri + React + local JSON direction.
4. Prefer typed data models and explicit states.
5. Keep simulated role safety and source attachment intact.
6. Run the narrowest relevant verification first.
7. Summarize changed files, verification results, and remaining risks.

## Recommended Task Slices
- Docs-only product refinement.
- Frontend layout and state work.
- Tauri command implementation.
- RSS parsing and source management.
- LLM provider adapter and prompt/schema hardening.
- Packaging and release workflow.

## Verification Ladder
Use the cheapest relevant check first:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run tauri:build
```

For UI work, also inspect the app in a browser or Tauri window and check:
- No blank first screen.
- No text overlap.
- Workbench actions are visible.
- Source inspector stays readable.
- Narrow viewport stacks cleanly.

## Review Checklist
- Does the change preserve the Windows local tool positioning?
- Does it avoid "daily public website" language?
- Are sources preserved for generated content?
- Does the UI expose failure and empty states?
- Does the workflow still work without an API key?
