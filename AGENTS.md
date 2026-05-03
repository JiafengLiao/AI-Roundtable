# Codex Working Guide

## Project Context
APD is a Windows-first local AI weekly roundtable workbench. It helps an editor collect weekly AI hotspots from RSS and manual input, ask a central planning agent to design the discussion, then generate and review a Chinese text roundtable draft.

This is a content production tool, not a public media landing page.

## Best-Practice Basis
This file follows the Codex `AGENTS.md` pattern: keep project-level instructions close to the repo, keep them concise, and move deep detail into `docs/`. More specific nested `AGENTS.md` files may override this file for `src/`, `src-tauri/`, and `docs/`.

Useful references:
- OpenAI Codex AGENTS.md guide: https://developers.openai.com/codex/guides/agents-md
- AGENTS.md open format: https://agents.md/
- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices

## Engineering Defaults
- Use Tauri v2, React, TypeScript, Vite, and local JSON storage.
- Prefer small, focused changes that preserve the local-first MVP.
- Use `npm.cmd` on Windows instead of `npm` when invoking scripts from PowerShell.
- Keep LLM provider code OpenAI-compatible, with a Mock fallback when no API key exists.
- Never present simulated roundtable guests as real interviewed people.
- Keep sources attached to every generated draft and make uncertainty visible.

## UX Defaults
- First screen is the workbench, not a marketing page.
- Use a dense, professional, premium dark interface for AI practitioners and content researchers.
- Avoid decorative gradients, oversized hero blocks, nested cards, and stock-like visual treatment.
- Prioritize scanability: source credibility, candidate status, generation status, and fact-check risk must be visible.
- Verify responsive behavior so text does not overflow or overlap.

## Local Commands
```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run tauri:dev
npm.cmd run build
npm.cmd run tauri:build
```

## Documentation Map
- `README.md`: human-facing overview and local workflow.
- `docs/PRODUCT_REQUIREMENTS.md`: product scope and success criteria.
- `docs/TECHNICAL_PLAN.md`: architecture and data flow.
- `docs/FRONTEND_UX_REQUIREMENTS.md`: UI, UX, and visual quality bar.
- `docs/PACKAGING_RELEASE_PIPELINE.md`: Windows packaging and CI/release flow.
- `docs/CODEX_WORKFLOW.md`: how Codex should implement and verify changes.
- `docs/CONTENT_WORKFLOW.md`: editorial workflow.
- `docs/LLM_AGENT_DESIGN.md`: central agent and simulated role design.
