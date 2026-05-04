# AI Roundtable

AI Roundtable is a local desktop content production tool for weekly AI hotspot analysis. The user-facing Chinese product name is **AI小圆桌**. The internal package and executable name is `ai-roundtable`.

It collects AI news signals from RSS and manual input, asks a central planning agent to structure a roundtable, then generates an editable Chinese draft with simulated roles:

- Host: explains the hotspot and keeps the discussion readable.
- Hotspot participant: provides industry intuition without pretending to be a real person.
- Investor: analyzes business impact, competition, and capital efficiency.
- Technical expert: analyzes model, engineering, data, safety, and feasibility questions.

The MVP is a tool for editors and AI practitioners. It is not a public reader app, not an audio product, and not a cloud CMS.

## Stack

- Desktop: Tauri v2
- Frontend: React, TypeScript, Vite
- Storage: local JSON files
- LLM: OpenAI-compatible providers with explicit local rule-based fallback only when selected
- Packaging: Windows NSIS installer; macOS users can build unsigned `.app` / `.dmg` locally

## Local Setup On Windows

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

## Local Setup On macOS

macOS builds must be produced on a Mac because Apple app bundles, code signing, notarization, and DMG packaging depend on Apple's local toolchain.

Install Xcode Command Line Tools:

```bash
xcode-select --install
```

Install Rust and project dependencies:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
```

Build an unsigned local app and DMG:

```bash
npm run tauri:build:mac
```

Expected outputs:

```text
src-tauri/target/release/bundle/macos/AI小圆桌.app
src-tauri/target/release/bundle/dmg/AI小圆桌_0.1.0_*.dmg
```

For a universal Apple Silicon + Intel build:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri:build:mac:universal
```

Unsigned local builds are suitable for personal use. Public distribution to other Mac users requires an Apple Developer account, code signing, notarization, and stapling; otherwise Gatekeeper may block or warn on launch.

## MVP Workflow

1. Open AI小圆桌.
2. Select the target date range.
3. Fetch RSS candidates.
4. Add missing hotspots manually when needed.
5. Select one hotspot.
6. Generate a central-agent discussion agenda.
7. Generate the roundtable draft.
8. Review sources and fact-check risks.
9. Edit and export the draft locally.

## Current Status

The repository contains a working local MVP: React calls Tauri commands through `invoke`, the Rust side reads and writes local JSON, fetches real RSS feeds, supports manual hotspot input, generates roundtable agendas and drafts through OpenAI-compatible providers, and saves drafts locally. When a real LLM provider is selected, the app checks connectivity before saving settings and before generation; failed LLM calls no longer silently fall back to local generation.

Bundled LLM prompts and guest personas are split by responsibility:

```text
config/prompts/personas.json
config/prompts/style-guide.json
config/prompts/tasks/
config/prompts/schemas/
config/prompts/fallbacks.json
```

On first run, the app composes those files into a writable app-data copy named `llm-prompts.json`.

Default app-data locations:

- Windows: `%APPDATA%\com.ai.roundtable`
- macOS: `~/Library/Application Support/com.ai.roundtable`

Version 3 prompt config supports one-shot draft generation and multi-agent draft generation where the central agent plans turns, then calls each simulated guest independently.
