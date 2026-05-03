# Technical Plan

## Architecture
The MVP uses a Tauri v2 desktop shell with a React + TypeScript frontend.

- React/Vite owns UI, local editing state, filtering, preview, and responsive layout.
- Tauri commands own local file access, RSS fetching, provider configuration, and future Windows packaging concerns.
- Local JSON files are the first persistence layer.
- OpenAI-compatible LLM provider is planned, with Mock provider as the default fallback.

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
3. Plan and source material go into the draft prompt.
4. LLM returns `EpisodeDraft` as structured JSON.
5. The UI exposes fact-check and review state before saving or publishing.

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
