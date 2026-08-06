# Frontend UX Requirements

## Product Feel
The interface should feel like a premium AI research and editorial workbench: quiet, dense, precise, and built for repeated professional use.

It should not feel like a marketing landing page, entertainment media site, or decorative dashboard.

## Information Architecture
- Left navigation (top-level only): 首页, 热点库, 圆桌, 历史, 设置.
- 热点库 is a hub with in-page tabs: 候选, RSS 源, 手动补充.
- 圆桌 is a linear in-page flow: 议程 → 圆桌稿. It stays disabled until an agenda (or draft) exists; no empty stand-alone agenda landing.
- 首页 is a weekly entry overview (range summary, status chips, entry cards into 热点库 / 圆桌).
- Hotspot date range defaults to the current week and is capped at **4 weeks (28 days)**.
- Main workspace: candidate selection inside 热点库, planning and draft editing inside 圆桌, with sources and review surfaces on the draft step.
- 设置 is progressive: core LLM + 低/中/高智能模式 first; Agent advanced options collapsed; TTS/ASR not shown on this surface for now.

## Required States
Every major workflow must show:
- Idle state.
- Running state (non-blocking bottom activity bar + sidebar status; do not full-screen lock the workbench).
- Empty state.
- Failure state.
- Success state.
- Draft, reviewed, and published content states.

## Visual Direction
- Default theme: light Zip / porcelain studio on the current product surface (near-white app canvas, white panels, teal brand accent).
- Borders: soft cool gray-green.
- Accent: teal (`#087d71`) for primary actions and selected state.
- Warnings: restrained amber.
- Danger: restrained red.
- Avoid dominant purple/blue gradients, decorative blobs, and oversized hero treatments.

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
