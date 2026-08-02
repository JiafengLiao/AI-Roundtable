# Design

## Overview
This change tightens the path from RSS fetch to roundtable planning without changing the product's local-first shape. The central plan remains the reviewable contract between source material and draft generation, but it gains explicit editorial topic metadata and the current Zip agenda page becomes the main editable planning surface.

The implementation should touch four areas:
- Planning schema and prompt config for model-generated topic metadata.
- Frontend workflow routing after RSS fetch.
- Persona labels and role copy shared by config, mock data, and UI display helpers.
- Zip agenda page controls and review-card styling.

## Decisions
### Plan Topic Metadata
Extend `RoundtablePlan` with optional fields first:
- `topicTitle?: string`
- `topicSummary?: string`

The backend `RoundtablePlan` struct, TypeScript type, bundled plan schema, OpenAI-compatible prompt instructions, and rule-based fallback should all understand these fields. Keep them optional on the frontend so existing saved plans, old mock data, and partial backend responses still render. When fields are absent, the UI should fall back to the selected hotspot title/summary and then to the existing objective/audience promise.

The plan prompt should ask the model for a concise Chinese topic title and a practical editorial summary. The topic title should describe the weekly discussion angle, not simply copy a source headline. The summary should be source-grounded and avoid unsupported conclusions.

### RSS Fetch Navigation
Change only the successful RSS fetch path from the workbench view to the hotspot library view. Keep existing post-fetch state behavior intact unless implementation discovers a conflict with the previous `fix-rss-selection-and-draft-workflow` change. In particular, do not reintroduce automatic generation selection if that previous change intentionally cleared `selectedHotspotIds`.

### Persona Consistency
Keep the existing internal guest IDs for compatibility:
- `host`
- `participant`
- `expert`
- `investor`

Map those IDs to the requested Chinese roles:
- `host`: 主持人
- `participant`: 消费者（产品使用者）
- `expert`: 热点技术人员
- `investor`: 投资人

Update `config/prompts/personas.json`, mock data, Zip guest constants, speaker label helpers, fallback dialogue labels, and any visible role cards. This avoids a storage migration from `participant` to `consumer` while making the user-facing product consistent.

### Editable Zip Agenda
Wire the Zip agenda page to the same update handlers already used by the older `PlanView`, and add handlers for topic title/summary if the metadata fields are added. Prefer direct text inputs or textareas styled as dense planning rows. Do not advertise drag-and-drop unless ordering is actually implemented.

Editing the plan should update `roundtablePlan` in memory so draft generation uses the editor-reviewed values. The change does not need to persist plans separately unless the current app already has that behavior.

### Tension And Source Risk Styling
Use one shared review-card visual pattern for both tension points and source risks, with restrained tone differences if useful. The goal is not to make everything amber, but to make both surfaces feel like generated claims that require editor attention.

### Compatibility
No new Tauri command is required. Local JSON draft saving should continue to work. Old saved drafts with embedded guests should render with their stored labels; new plans and drafts should use the standardized role labels.

## Verification
Use focused checks rather than broad refactors:
- Typecheck the TypeScript changes.
- Run lint if the current branch already supports it.
- Run relevant existing frontend logic tests.
- Build if the local environment permits it.
- Manually verify the happy path in the UI:
  - RSS fetch completes and lands on Hotspots.
  - Generating a plan shows model/fallback topic title and summary.
  - Agenda and tension points can be edited in the Zip agenda page.
  - Draft generation uses the edited plan values.
  - Simulated guest labels are consistent in plan and draft views.
  - Tension points and source risks use matching review-card styling on desktop and narrow layouts.
