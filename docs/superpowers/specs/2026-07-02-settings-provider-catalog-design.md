# Settings Provider Catalog Design

## Goal

Unify the settings page UI while restoring the previous settings functionality, and expand the roundtable model provider catalog to 10 common OpenAI-compatible presets. The settings page should still read existing local JSON settings first, then layer provider defaults underneath missing values.

## Scope

This change covers the Settings page and roundtable model provider catalog only.

In scope:

- Keep the current Zip-style settings page visual language.
- Make each settings tab use a consistent form pattern.
- Provide 10 built-in roundtable model providers, including DeepSeek and Qwen.
- Auto-fill provider default `baseUrl` and default models after provider selection.
- If saved JSON exists for the selected provider, prefer saved `baseUrl`, `apiKey`, `selectedModel`, and `draftGenerationMode`.
- If the selected provider has an API key, automatically try to refresh models from the provider after selection.
- Continue storing settings in the existing local JSON format.
- Keep strict no-silent-fallback behavior for roundtable planning and drafting.

Out of scope:

- A full custom provider manager with create, delete, reorder, or arbitrary provider metadata editing.
- Provider-specific non-OpenAI-compatible chat protocols.
- Migrating API keys to OS credential storage.
- Redesigning RSS, hotspot, agenda, draft, TTS, or ASR flows beyond settings-page consistency.

## UI Design

The Settings page keeps the current Zip UI style: `ZipPageHeader`, `ZipPill`, `ZipCard`, `ZipBtn`, dense form rows, and restrained status indicators.

The page layout should be:

- Header: configuration title, short description, and model refresh actions.
- Tabs: `圆桌模型`, `Agent`, `TTS`, `ASR`.
- Active tab content: one primary configuration card using the same structure on every tab.
- Bottom note/action card: save current tab, test current tab, show local app data directory.

Each configuration card should follow the same pattern:

- Top row with title, short description, and status pill.
- Field grid with labels above controls.
- Context note, only when needed.
- No read-only placeholder fields standing in for editable configuration.

The `圆桌模型` tab should expose:

- Provider select.
- Model select.
- Base URL input.
- API Key password input.
- Draft generation mode select.
- Optional inline model-refresh status when provider model refresh is running or failed.

## Provider Catalog

The built-in provider catalog should include 10 common OpenAI-compatible presets:

1. OpenAI: `https://api.openai.com/v1`
2. DeepSeek: `https://api.deepseek.com`
3. Qwen / DashScope: `https://dashscope.aliyuncs.com/compatible-mode/v1`
4. Moonshot Kimi: `https://api.moonshot.cn/v1`
5. Zhipu GLM: `https://open.bigmodel.cn/api/paas/v4`
6. MiniMax: `https://api.minimax.chat/v1`
7. StepFun: `https://api.stepfun.com/v1`
8. Baichuan: `https://api.baichuan-ai.com/v1`
9. 01.AI Yi: `https://api.lingyiwanwu.com/v1`
10. SiliconFlow: `https://api.siliconflow.cn/v1`

Each provider should have a small default model list so the UI is useful before remote model refresh succeeds.

DeepSeek and Qwen keep existing special handling:

- DeepSeek plan prompt sanitization remains.
- Qwen response-format and model filtering remain.

All 10 providers are treated as OpenAI-compatible for `/models` refresh and chat generation. If a provider is not truly compatible for a user account or endpoint, the app should surface the provider error instead of silently falling back.

## Data Flow

Startup:

1. Load built-in catalog.
2. Load existing `provider-settings.json`.
3. Pick default provider `deepseek` unless a saved selected provider is already active in UI state.
4. For the selected provider, merge built-in defaults with saved settings.

Provider selection:

1. User selects a provider.
2. UI switches selected provider immediately.
3. Base URL, API Key, selected model, and generation mode are populated from saved JSON when present.
4. Missing values fall back to provider defaults.
5. If an API key is present, call `refresh_model_catalog` using the merged settings.
6. If refresh succeeds, replace that provider's model list and select the saved model when still available, otherwise first returned/default model.
7. If refresh fails, keep current inputs and show an error job/status.

Save:

1. Save the current tab settings through existing Tauri commands.
2. For roundtable model settings, keep the existing `ProviderSettings` shape.
3. Do not clear API Key or Base URL on failed refresh.

Generation:

1. Roundtable generation uses the selected provider settings from saved/current UI state.
2. Supported provider validation allows the 10 built-in OpenAI-compatible providers.
3. No mock or local fallback is used when real model planning fails.

## Error Handling

- Missing API Key: prompt the user to configure it in Settings.
- Missing selected model: prompt the user to pick a model.
- Model refresh failure: keep current form state and show the provider error.
- Provider incompatible with `/models`: show a clear refresh failure, keep default model list.
- Provider incompatible with chat generation: show a generation failure, do not fallback.
- Old local JSON missing newly added provider entries: keep old entries and rely on built-in defaults for missing providers.

## Testing

Backend tests:

- Built-in catalog contains exactly the intended 10 provider IDs.
- Default provider settings are generated for all 10 providers.
- Generation provider validation accepts the 10 OpenAI-compatible providers.
- DeepSeek and Qwen special behavior remains covered by existing tests.

Frontend tests or type-level checks:

- Settings props compile with the new provider refresh flow.
- Provider selection preserves saved JSON values when available.
- Provider selection falls back to built-in defaults when no saved JSON exists.
- A failed refresh does not clear user input.

Manual verification:

- Open Settings.
- Switch between DeepSeek, Qwen, and at least one other provider.
- Confirm Base URL and model defaults update.
- Save settings and reload app.
- Confirm saved JSON values are still read.
- With an API key present, confirm provider selection attempts model refresh.

## Implementation Notes

Prefer small, local changes:

- Keep provider metadata in the backend catalog first, because Tauri commands already expose it to the frontend.
- Add frontend helpers only if they reduce duplication in the settings page.
- Avoid a broad settings architecture rewrite.
- Keep the old unused `SettingsView` untouched unless it blocks lint or maintainability.
