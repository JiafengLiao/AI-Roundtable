# Tasks

- [x] Review current RSS fetch success flow and confirm how it interacts with `selectedHotspot`, `selectedHotspotIds`, `roundtablePlan`, and `episodeDraft`.
- [x] Change successful RSS fetch navigation so the user lands on the Hotspots view after candidates are loaded.
- [x] Extend frontend and backend `RoundtablePlan` definitions with optional `topicTitle` and `topicSummary` fields.
- [x] Update the plan JSON schema, plan prompt, and rule-based fallback so model and mock planning both produce topic title and summary.
- [x] Render the plan topic title and summary in the Zip agenda page with fallbacks for older plans.
- [x] Add in-memory update handlers for plan topic title and summary.
- [x] Wire Zip agenda page controls so agenda items are editable and draft generation uses edited values.
- [x] Wire Zip agenda page controls so tension points are editable and draft generation uses edited values.
- [x] Remove or revise UI copy that promises drag-and-drop until drag ordering is implemented.
- [x] Standardize visible persona labels and role copy for `host`, `participant`, `expert`, and `investor` across prompt config, mock data, Zip guest cards, speaker labels, and review surfaces.
- [x] Keep internal guest IDs unchanged and verify existing speaking-order and interactive-roundtable logic still accepts `host`, `participant`, `expert`, and `investor`.
- [x] Replace the Zip tension-point pill treatment with the same review-card pattern used for source risks, with any tone differences kept subtle and consistent.
- [x] Add or update focused tests where practical for plan metadata fallback/rendering and editable plan state helpers.
- [x] Verify with typecheck, lint, relevant tests, and build where the local environment permits.
- [ ] Manually check desktop and narrow layouts for Hotspots, Zip agenda, and Draft views to catch text overflow or role-label inconsistency.
  - Blocked in this session: the dev server is running and returns 200, but no browser automation or screenshot tool is available in the current environment.
