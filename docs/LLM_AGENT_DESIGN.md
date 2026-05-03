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
- Hotspot participant.
- Investor.
- Technical expert.

## Step 2: Draft Generation Agent
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

## Role Rules
- Host explains, asks, challenges, and summarizes.
- Hotspot participant provides first-person-style intuition and industry know-how, but must not impersonate a real person.
- Investor analyzes business model, market structure, competition, and capital efficiency.
- Technical expert analyzes models, engineering, data, safety, and feasibility.

## Safety And Source Rules
- Do not fabricate unsupported facts.
- Use conservative wording when sources are incomplete.
- Do not claim the simulated guests are real.
- Preserve source URLs.
- Keep disagreement meaningful; avoid four roles repeating the same conclusion.

## Prompt Shape
The implementation should ask for strict JSON matching the TypeScript types. If the LLM returns invalid JSON, retry once with a repair prompt, then surface the error to the UI.
