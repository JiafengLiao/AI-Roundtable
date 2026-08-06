---
name: deploy-tauri
description: >-
  Restart AI小圆桌 Tauri local development by killing any existing tauri/vite
  process, then running npm run tauri:dev. Use when the user invokes
  /deploy-tauri, mentions deploy-tauri, or asks to restart/start tauri:dev
  for this repo.
disable-model-invocation: true
---

# Deploy Tauri (dev restart)

Restart the local Tauri app for **AI小圆桌** (`ai-roundtable`) from the repo root.

## Steps

1. **Working directory**: repo root (`AI-Roundtable`). Use `npm` on macOS/Linux; `npm.cmd` on Windows PowerShell.

2. **Stop anything already running** (do this every time before start):
   - Kill processes matching `tauri dev`, `ai-roundtable`, and Vite on port `5173`.
   - Example (macOS/Linux):

```bash
pkill -f "tauri dev" 2>/dev/null || true
pkill -f "ai-roundtable" 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1
```

   - If a Cursor terminal is already running `npm run tauri:dev`, stop that session too before starting a new one.

3. **Start**:

```bash
npm run tauri:dev
```

   - Run in the background with unrestricted permissions (GUI + Rust build).
   - Wait until Vite reports `Local: http://127.0.0.1:5173/` and cargo finishes / the app binary is `Running`.
   - Tell the user briefly that the app is starting (or ready).

4. **If start exits immediately** with code 0 and no window: kill leftovers again and retry once. If it still fails, report the terminal error output.

## Do not

- Do not run `tauri:build` / packaging unless the user explicitly asks to build.
- Do not change git state or project config as part of this skill.
