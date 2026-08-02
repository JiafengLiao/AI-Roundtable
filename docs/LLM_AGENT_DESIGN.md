# LLM Agent Design

## Core Principle
Use a central planning agent before generating the full draft. This keeps the content controllable, reviewable, and easier to edit than one-shot generation.

## Step 1: Central Planning Agent
Input:
- Selected hotspot.
- Source titles, summaries, URLs, and publication dates.
- Optional editor notes.

Output:
- Discussion objective.
- Audience promise.
- Four simulated guest personas.
- Agenda.
- Speaking order.
- Tension points.
- Source risks.

Required roles:
- Host.
- Consumer / product user.
- Hotspot technical staff.
- Investor.

## Step 2: Draft Generation
Input:
- `RoundtablePlan`.
- Source material.
- Editorial constraints.

Output:
- `EpisodeDraft` JSON.
- Title and summary.
- Guests.
- Dialogue turns.
- Takeaways.
- Fact-check checklist.

Supported modes:
- `single`: one OpenAI-compatible chat completion generates the whole draft under `roundtable_draft` JSON Schema.
- `multi_agent`: the central agent first generates `roundtable_turn_plan`, then the backend calls the model once per scheduled guest turn using that speaker's persona and the accumulated transcript.
- `autonomous_agent`: the Tauri/Rust runtime runs a deeper native graph: memory indexing, depth-controlled controller planning, per-turn memory retrieval, optional JSON web search, guest generation, finalization, and `agentTrace`.

Multi-agent mode requirements:
- At least 8 dialogue turns, preferably 10 to 14.
- The central agent decides who speaks, not a fixed mechanical role loop.
- Guest turns must naturally接话, include追问 where useful, allow轻微分歧, and use口语化转场.
- Each turn can be longer when the speaker has relevant domain experience, but length must add substance.
- Avoid research-report, paper, PR, and generic AI-summary tone.

Autonomous mode requirements:
- `discussionDepth` controls the target turn range: low 8-10, medium 10-14, high 12-16.
- Supplemental documents must be indexed into local memory and made available to guest turns through retrieval context.
- Web search is optional and must be skipped without failure when no Search API Base URL is configured.
- Search results may be attached as sources, but generated dialogue must not imply a simulated guest personally browsed the web.
- Debug trace records are hidden unless debug trace is enabled.
- The archived Python FastAPI/LangGraph backend is reference material only, not a product runtime path.

## Role Rules
- Host explains, asks, challenges, and summarizes.
- Consumer / product user provides first-person-style product usage experience, willingness-to-pay intuition, and adoption friction, but must not impersonate a real person.
- Investor analyzes business model, market structure, competition, and capital efficiency.
- Hotspot technical staff analyzes models, engineering, data, safety, and feasibility.

## Safety And Source Rules
- Do not fabricate unsupported facts.
- Use conservative wording when sources are incomplete.
- Do not claim the simulated guests are real.
- Preserve source URLs.
- Keep disagreement meaningful; avoid four roles repeating the same conclusion.

## Prompt Shape
Bundled prompts live under `config/prompts/`:
- `personas.json`
- `style-guide.json`
- `tasks/*.json`
- `schemas/*.schema.json`
- `fallbacks.json`

The backend composes those files into a versioned runtime config and sends strict JSON Schema response formats for models that support constrained output. If a real LLM provider is selected, invalid output or connection failure is surfaced as an error instead of silently falling back. The local rule-based generator is used only when the Mock provider is explicitly selected.
