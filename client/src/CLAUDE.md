## Client polling and rendering

`useWidget.ts` polls `/api/widgets/:id` at half the server's `refreshMs` (clamped between
15s and 5min), plus immediately on `visibilitychange`. It tracks `offline` separately from envelope
`status` — `offline` means the dashboard's own server is unreachable, not that a given provider
failed.

`components/WidgetCard.tsx` has two layers:
- `WidgetBody` is the `loading/disabled/error/ready` rendering state machine for **one** envelope.
- `WidgetShell` is just the card chrome (border, header, badge slot) with no envelope logic.
- `WidgetCard` = `WidgetShell` + `WidgetBody` for the common case of one card backed by one envelope.

Use `WidgetShell` + `WidgetBody` directly (see `sections/ai/AiDetail.tsx` or the section overview
components) when a card doesn't map 1:1 onto a single envelope — e.g. Claude and Codex usage poll
on different schedules and must not block each other's rendering or share one `error`/`stale` state.

## Sections and navigation

The UI is organized into **sections** (AI, GitHub, Personal), each with a condensed `Overview`
block on the landing page and a full `Detail` view. Everything derives from
`sections/registry.tsx` — adding a section = one `SECTIONS` entry plus its
Overview/Detail components. Navigation is hash-based (`router.ts`, `#/ai` etc.) so deep
links never hit the server's SPA catch-all. `SectionCard` (overview block) and `SectionView`
(expanded view header) share `motion` layoutIds, which produces the expand/morph animation;
page-level animation config (`MotionConfig`/`LayoutGroup`/`AnimatePresence`) lives in `App.tsx`.
Design tokens (glass surfaces, ink text hierarchy, per-section accents) are `@theme` variables in
`index.css`, mode-adaptive via `light-dark()` — use them instead of raw palette classes.
