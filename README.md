# APD AI Roundtable Workbench

APD is a Windows local content production tool for weekly AI hotspot analysis. It collects AI news signals from RSS and manual input, asks a central planning agent to structure a roundtable, then generates an editable Chinese text draft with simulated roles:

- Host: explains the hotspot and keeps the discussion readable.
- Hotspot participant: provides first-person-style intuition and industry know-how without pretending to be a real person.
- Investor: analyzes business impact, competition, and capital efficiency.
- Technical expert: analyzes model, engineering, data, safety, and feasibility questions.

The MVP is a tool for editors and AI practitioners. It is not a public reader app, not an audio product, and not a cloud CMS.

## Stack

- Desktop: Tauri v2
- Frontend: React, TypeScript, Vite
- Storage: local JSON files
- LLM: OpenAI-compatible provider with Mock fallback
- Packaging: Windows NSIS installer first, MSI later

## Local Setup

PowerShell may block `npm.ps1`, so use `npm.cmd`.

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run tauri:dev
```

Build commands:

```powershell
npm.cmd run build
npm.cmd run tauri:build
```

## MVP Workflow

1. Open the workbench.
2. Select this week's time range.
3. Fetch RSS candidates.
4. Add missing hotspots manually when needed.
5. Select one hotspot.
6. Generate a central-agent discussion plan.
7. Generate the roundtable draft.
8. Review sources and fact-check risks.
9. Save the draft locally.

## Current Status

The repository contains a working local MVP: React calls Tauri commands through `invoke`, the Rust side reads/writes local JSON, fetches real RSS feeds, supports manual hotspot input, generates roundtable plans/drafts through OpenAI-compatible providers or a local rule-based fallback, and saves drafts locally.

Bundled LLM prompts and guest personas are split by responsibility:

```text
config/prompts/personas.json
config/prompts/style-guide.json
config/prompts/tasks/
config/prompts/schemas/
config/prompts/fallbacks.json
```

On first run, the app composes those files into a writable app-data copy named `llm-prompts.json`. Version 3 prompt config supports one-shot draft generation and multi-agent draft generation where the central agent plans turns, then calls each simulated guest independently.
