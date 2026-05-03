# Frontend UX Requirements

## Product Feel
The interface should feel like a premium AI research and editorial workbench: quiet, dense, precise, and built for repeated professional use.

It should not feel like a marketing landing page, entertainment media site, or decorative dashboard.

## Information Architecture
- Left navigation: Workbench, RSS Sources, Hotspots, Manual Input, Roundtable Plan, Draft Editor, Settings.
- Top action area: current week range, RSS fetch, primary generation action.
- Main workspace: candidate selection, planning, draft editing, and status surfaces.
- Right inspector: sources, fact-check risks, review checklist, and provenance.

## Required States
Every major workflow must show:
- Idle state.
- Running state.
- Empty state.
- Failure state.
- Success state.
- Draft, reviewed, and published content states.

## Visual Direction
- Default theme: dark professional.
- Core surfaces: near-black and cool charcoal.
- Borders: subtle cool gray.
- Accent: cyan/teal for primary actions and selected state.
- Warnings: restrained amber.
- Danger: restrained red.
- Avoid dominant purple/blue gradients, beige themes, decorative blobs, and oversized hero treatments.

## Layout Requirements
- Use stable dimensions for navigation, status pills, rows, buttons, and inspector panels.
- Candidate hotspots should scan like a tight editorial queue.
- Draft editing should use a role-based dialogue stream with source and fact-check context nearby.
- Controls must not resize unpredictably on hover or after async state changes.
- Mobile/narrow layouts must stack cleanly without text overflow.

## Copy Requirements
- Use Chinese UI copy.
- Keep labels short and operational.
- Do not add visible help text that explains obvious UI mechanics.
- Always label simulated role content as simulated in editorial copy or review checks.
