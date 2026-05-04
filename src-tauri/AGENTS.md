# Tauri Instructions

## Scope
This directory owns desktop packaging, local commands, file access, RSS fetching, and future secure provider configuration. Windows NSIS is the primary release target; macOS local `.app` / `.dmg` builds should remain buildable from source.

## Rules
- Keep the Rust side thin until the MVP needs deeper native behavior.
- Put filesystem access, API key access, RSS fetching, and future updater logic behind Tauri commands.
- Store MVP content in local JSON files.
- Do not log API keys or source material that may contain private notes.
- Use Mock behavior when external services are unavailable.
