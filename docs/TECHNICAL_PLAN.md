# Technical Plan

## Architecture
The MVP uses a Tauri v2 desktop shell with a React + TypeScript frontend.

- React/Vite owns UI, local editing state, filtering, preview, and responsive layout.
- Tauri commands own local file access, RSS fetching, provider configuration, and future Windows packaging concerns.
- Local JSON files are the first persistence layer.
- OpenAI-compatible LLM provider is supported for generation, with Mock provider as an explicit local generator.

## Data Model
- `FeedSource`: RSS source metadata, category, enabled state, and fetch status.
- `Source`: individual article/source link attached to candidates and drafts.
- `HotspotCandidate`: weekly hotspot candidate with source count, category, score, status, and matched signals.
- `RoundtablePlan`: central-agent discussion objective, audience promise, guests, agenda, tensions, speaking order, and source risks.
- `EpisodeDraft`: editable roundtable draft with sources, guests, dialogue, takeaways, fact checks, and status.
- `GenerationJob`: UI-visible status for fetch, plan, draft, and save operations.

## Tauri Command Boundary
Initial commands:
- `get_feeds`
- `search_hotspots`
- `generate_roundtable_plan`
- `generate_episode_draft`
- `save_episode_draft`

Next implementation pass:
- Replace mock RSS results with server-side RSS parsing.
- Add `upsert_feed`, `disable_feed`, and `add_manual_hotspot`.
- Add a provider adapter for OpenAI-compatible chat/completions APIs.
- Add schema validation around LLM JSON output before saving.

## LLM Flow
1. Candidate and sources go into the central planning prompt.
2. LLM returns `RoundtablePlan` as structured JSON.
3. Plan and source material go into one of two draft modes:
   - `single`: one constrained JSON call returns the complete `EpisodeDraft`.
   - `multi_agent`: one constrained JSON call returns the central turn plan, then one constrained JSON call per scheduled guest turn returns natural dialogue text.
   - `autonomous_agent`: native Tauri/Rust runtime builds memory chunks from the hotspot, sources, and supplemental documents; applies `discussionDepth` to the turn range; runs per-turn `memory.search`; optionally posts to a configured generic JSON Search API; and returns an `EpisodeDraft` with `agentTrace`.
4. The backend assembles `EpisodeDraft` as structured JSON.
5. The UI exposes fact-check and review state before saving or publishing.

The old FastAPI/LangGraph prototype under `agent-backend/` is retained only as
an experimental archive. Desktop builds must not package Python, `uv`, or a
Python sidecar for the autonomous runtime.

Bundled prompt files live under `config/prompts/`; runtime app data stores a composed versioned `llm-prompts.json` copy for local tuning.

LLM connection rules:
- Saving real provider settings runs a connection check first.
- Plan and draft generation run a connection check before invoking the model.
- If a real provider is selected and connection/model invocation fails, the command returns an error instead of silently falling back to Mock output.
- The UI shows a prompt and navigates back to Settings so the user can fix provider, Base URL, API Key, or selected model.
- Response format is provider-aware: OpenAI uses strict `json_schema`; DeepSeek uses `json_object` plus prompt-level schema hints, matching DeepSeek's chat completion docs: https://api-docs.deepseek.com/api/create-chat-completion.

## Storage
MVP storage is local JSON under `data/`.

Suggested structure:

```text
data/
  feeds.json
  candidates/
  plans/
  drafts/
  settings.json
```

Do not store API keys in plain project files. Use environment variables first, then evaluate OS credential storage in a later phase.
