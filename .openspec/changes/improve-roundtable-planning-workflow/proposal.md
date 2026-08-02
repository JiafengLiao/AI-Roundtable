# improve-roundtable-planning-workflow

## Why
The current planning workflow still feels uneven after RSS collection. Fetching RSS returns the user to the workbench instead of the hotspot queue where selection actually happens. The roundtable agenda page presents the weekly theme, agenda, tension points, risks, and simulated guests as if they are production-ready, but several of those surfaces are either not model-derived, not editable in the current Zip UI, or inconsistent with backend persona definitions.

This matters because AI小圆桌 is an editorial workbench. The editor needs to move from source collection to hotspot review, let the central model produce a useful weekly topic name and summary, then adjust the plan before draft generation. Simulated roles must also stay clear and consistent so generated content never reads like a real interview or a mismatched panel.

## What
- Add model-produced roundtable topic metadata to the planning output: a concise weekly topic name and editorial summary derived from the selected hotspot and its sources.
- After RSS fetch succeeds, navigate directly to the hotspot library while preserving the existing focus/selection behavior from the current workflow.
- Standardize the four simulated roles across backend prompt config, mock data, Zip UI labels, speaker labels, and generated plan display:
  - 主持人
  - 消费者（产品使用者）
  - 热点技术人员
  - 投资人
- Make the Zip roundtable agenda page editable for agenda items and tension points, and include editable topic title/summary if plan metadata is added.
- Make the visual treatment for generated tension points match the source-risk treatment so both review surfaces carry the same level of attention.
- Keep the change local-first and avoid storage/API churn beyond the minimum schema additions needed for plan metadata.

## Impact
- Editors land in the right place immediately after RSS collection and can continue selection without returning through the workbench.
- The weekly theme becomes a planned editorial artifact, not only a copied RSS title or hand-written display string.
- Simulated guests appear consistently throughout planning and draft review.
- Agenda review becomes an actual editing step before draft generation.
- Tension points and source risks become visually comparable review checkpoints.
- Existing drafts and plans may not have the new topic metadata, so the UI and rule-based fallback must handle missing fields gracefully.
