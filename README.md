# AI Roundtable

AI Roundtable is a local desktop workbench for producing a weekly Chinese AI hotspot roundtable. The user-facing Chinese product name is **AI小圆桌**. The internal package and executable name is `ai-roundtable`.

The app helps an editor collect AI news signals from RSS and manual input, ask a central planning agent to structure the discussion, then generate, review, and export an editable Chinese roundtable draft. It is a content production tool for AI practitioners and editors, not a public reader site, cloud CMS, or real interview product.

## What It Does

- Collects AI hotspot candidates from curated RSS feeds and manual input.
- Scores and filters candidates by date range, source count, source category, and matched signals.
- Generates a central-agent roundtable plan before drafting.
- Generates Chinese roundtable drafts with simulated roles: host, hotspot participant, investor, and technical expert.
- Keeps source links, fact-check risks, takeaways, and agent trace data attached to drafts.
- Saves draft history locally.
- Exports text/PDF-style artifacts from the frontend and MP3 audio through supported TTS providers.

Simulated roundtable guests must never be presented as real interviewed people. Generated drafts should keep uncertainty visible and should be reviewed against original sources before publishing.

## Stack

- Desktop: Tauri v2
- Frontend: React, TypeScript, Vite
- Backend shell: Rust Tauri commands
- Agent runtime: native Rust Tauri commands; archived Python experiment under `agent-backend/`
- Storage: local JSON files in the Tauri app data directory
- LLM: OpenAI-compatible providers, plus explicit local mock/rule generation
- TTS: OpenAI TTS and DashScope TTS adapters
- Packaging: Windows NSIS installer; macOS users can build unsigned `.app` / `.dmg` locally

## Requirements

Windows:

- Node.js and npm
- Rust stable toolchain
- Microsoft Visual Studio Build Tools with C++ tooling for Tauri builds

macOS:

- Node.js and npm
- Rust stable toolchain
- Xcode Command Line Tools

PowerShell may block `npm.ps1`, so use `npm.cmd` on Windows. Use plain `npm` on macOS/Linux.

## Quick Start On Windows

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

Expected Windows package output:

```text
src-tauri\target\release\ai-roundtable.exe
src-tauri\target\release\bundle\nsis\AI小圆桌_0.1.0_x64-setup.exe
```

## Quick Start On macOS

macOS app bundles and DMG packages must be built on a Mac because they depend on Apple's local toolchain.

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
npm run tauri:dev
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

## Product Workflow

1. Open AI小圆桌.
2. Select the target date range.
3. Fetch RSS candidates.
4. Add missing hotspots manually when needed.
5. Select one or more candidate hotspots.
6. Generate a central-agent discussion agenda.
7. Review the agenda, role setup, tension points, and source risks.
8. Generate the roundtable draft.
9. Review sources, fact-check risks, role quality, and final takeaways.
10. Edit, save, and export locally.

## Model Configuration

Open **Settings** in the app to configure generation and TTS.

Generation providers currently focus on OpenAI-compatible chat completion APIs:

- OpenAI
- DeepSeek
- Qwen / DashScope compatible mode
- Mock/local rule generator for no-key testing

Real provider settings require a Base URL, API Key, and selected model. The app checks connectivity when settings are saved and before generation. If a real provider fails, the app returns an error instead of silently falling back to mock output.

Draft generation modes:

- `single`: one structured model call generates the complete draft.
- `multi_agent`: the central agent plans turns, then each simulated guest is called separately.
- `autonomous_agent`: native Rust autonomous path with memory retrieval, optional JSON web search, depth-controlled turn planning, and agent trace output.

## Native Autonomous Agent

The `autonomous_agent` draft mode now runs inside Tauri/Rust. It builds local memory chunks from the hotspot, attached sources, and supplemental documents; asks the central agent to plan a depth-controlled turn sequence; runs `memory.search` for each turn; optionally calls a configured generic JSON Search API; then finalizes the standard `EpisodeDraft` with an `agentTrace`.

The former Python FastAPI/LangGraph backend under `agent-backend/` is kept only as an experimental archive and is no longer a product runtime dependency or a visible settings option.

## TTS And MP3 Export

MP3 export uses the TTS settings page. The supported adapters are:

- OpenAI TTS: easiest path for quick setup. Existing persona voices use OpenAI-style names such as `alloy`, `coral`, `onyx`, and `sage`.
- DashScope TTS: supports `MiniMax/speech-2.8-hd` and `cosyvoice-v3.5-plus` through the Rust adapter.

Important DashScope notes:

- `MiniMax/speech-2.8-hd` must be activated for the API Key in Alibaba Cloud Model Studio.
- `cosyvoice-v3.5-plus` generally needs a valid voice clone or voice design ID created in Model Studio. Built-in-looking values such as `longanlang` may fail with voice/model mismatch errors.
- Persona-level voice mapping lives in `config/prompts/personas.json` under each role's `tts` field.

## Local Data

The app stores runtime data in the Tauri app data directory, not in the project root.

Default locations:

- Windows: `%APPDATA%\com.ai.roundtable`
- macOS: `~/Library/Application Support/com.ai.roundtable`

Common files and folders:

```text
feeds.json
provider-settings.json
tts-settings.json
llm-prompts.json
drafts/
```

API keys are currently stored in local app-data JSON. Keep that directory private and avoid committing copied settings files.

## Prompt Configuration

Bundled prompt and persona files live under:

```text
config/prompts/personas.json
config/prompts/style-guide.json
config/prompts/tasks/
config/prompts/schemas/
config/prompts/fallbacks.json
```

On first run, the app composes those files into a writable app-data copy named `llm-prompts.json`. Edit the app-data copy for local prompt tuning, or edit `config/prompts/` to change bundled defaults.

Version 3 prompt config supports both one-shot draft generation and multi-agent draft generation.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

macOS/Linux:

```bash
npm run typecheck
npm run lint
npm run build
```

Use `npm.cmd run tauri:dev` for desktop integration testing. Tauri `invoke(...)` calls do not appear in the browser Network panel; inspect the Tauri window console and local app-data JSON when debugging.

## Troubleshooting

- `npm.ps1 cannot be loaded`: use `npm.cmd` in PowerShell.
- Tauri build cannot find Rust/Cargo: add `%USERPROFILE%\.cargo\bin` to the current shell `PATH`.
- Windows package build fails with C++ toolchain errors: install Visual Studio Build Tools with `Microsoft.VisualStudio.Workload.VCTools`.
- Real LLM generation fails: check provider, Base URL, API Key, selected model, and model permission.
- Autonomous agent generation fails: check the model provider, Base URL, API Key, selected model, Search API settings, and supplemental document content. If no Search API is configured, external search is skipped automatically.
- TTS returns empty audio or HTTP 400: confirm the TTS model is activated and that the configured voice ID is valid for that model.
- UI settings seem stale: check the app data directory; runtime settings are read from local JSON there.

## Repository Map

```text
src/                         React frontend
src-tauri/                   Tauri Rust backend and packaging config
agent-backend/               Experimental archive of the old Python agent backend
config/prompts/              Bundled prompt, persona, schema, and fallback config
docs/                        Product, technical, UX, packaging, and workflow docs
dev_readme.md                Developer commands and release workflow
dev_readme.zh-CN.md          Chinese developer commands and release workflow
README.zh-CN.md              Chinese project README
```

## Documentation

- `docs/PRODUCT_REQUIREMENTS.md`: product scope and success criteria.
- `docs/TECHNICAL_PLAN.md`: architecture and data flow.
- `docs/FRONTEND_UX_REQUIREMENTS.md`: UI and visual quality requirements.
- `docs/PACKAGING_RELEASE_PIPELINE.md`: Windows packaging and release flow.
- `docs/CODEX_WORKFLOW.md`: Codex implementation and verification workflow.
- `docs/CONTENT_WORKFLOW.md`: editorial production workflow.
- `docs/LLM_AGENT_DESIGN.md`: central agent and simulated role design.
