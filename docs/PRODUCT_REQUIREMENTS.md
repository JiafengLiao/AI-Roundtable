# Product Requirements

## Summary
APD is a Windows local AI weekly roundtable workbench. It helps an editor or AI practitioner collect weekly AI hotspots, organize source material, and generate an editable Chinese roundtable draft through a central planning agent.

The product is a tool, not a reader-facing publication site. The user opens the app to produce, review, and save content.

## Users
- AI product managers tracking market and technical shifts.
- Engineers and researchers who want concise cross-functional interpretation.
- Startup operators and investors who need a weekly briefing workflow.
- Editors or creators producing AI commentary content.

## Core Jobs
- Collect this week's AI hotspots from trusted RSS sources.
- Add missing but important events manually.
- Select one hotspot and understand why it matters.
- Ask a central agent to plan who should speak, in what order, and with what angle.
- Generate a Chinese text roundtable draft.
- Review source links, uncertainty, role quality, and action-oriented takeaways.
- Save the draft locally.

## MVP Scope
- Windows desktop app built with Tauri.
- Manual RSS fetch with week-range filtering.
- RSS source management.
- Manual hotspot creation.
- Candidate hotspot list with source count, category, status, and matching signals.
- Two-step LLM flow: plan first, draft second.
- Mock provider fallback with no API key.
- Local JSON storage for feeds, candidates, plans, and drafts.
- Draft statuses: `draft`, `reviewed`, `published`.

## Out of Scope
- Real audio generation.
- User accounts, login, comments, or cloud sync.
- Public publishing CMS.
- Fully autonomous publishing.
- Complex recommendation ranking.
- macOS/Linux packaging before the Windows MVP is stable.

## Success Criteria
- A user can understand the selected weekly hotspot within 30 seconds of opening the workbench.
- A complete mock workflow works without an API key.
- Every draft keeps source links attached.
- The central plan includes the host, hotspot participant, investor, and technical expert.
- The generated draft includes clear disagreement or differentiated perspectives.
- Simulated roles are never represented as real interviews.
