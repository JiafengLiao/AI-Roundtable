# AI Roundtable Python Agent Backend

This backend is an optional development-time generation engine for AI小圆桌.
It keeps the desktop app in Tauri/Rust while moving experimental multi-agent
orchestration into Python with FastAPI, LangGraph, and LangChain.

## Run Locally

Prerequisites:

- Python 3.11+
- `uv` installed from the official uv installation guide

```powershell
cd agent-backend
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8787
```

Then open the desktop app settings:

- Draft generation mode: `0.4 autonomous agent`
- Agent engine: `Python Agent Backend (LangGraph)`
- Python Agent Endpoint: `http://127.0.0.1:8787`

## API Contract

`POST /v1/generate` accepts the same canonical objects used by the Tauri app:

- `RoundtablePlan`
- `HotspotCandidate`
- `ProviderSettings`
- `AutonomousDraftOptions`
- `AgentRuntimeSettings`

It returns a standard `EpisodeDraft`, so the Rust and React layers do not depend
on Python-specific internals.

`POST /v1/generate/events` streams Server-Sent Events for future Rust forwarding.
The first Tauri integration uses `/v1/generate` to keep the boundary stable.
