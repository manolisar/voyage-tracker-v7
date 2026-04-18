# Voyage Tracker v7 — Static Mockup

Single-file click-through mockup for the v7 redesign. **No build, no dependencies, no real auth.** Open `index.html` in any browser and explore.

## How to open

- **In Claude Code preview panel:** already visible — click around there.
- **In your default browser:**
  ```bash
  open /Users/Manos/Projects/Voyage_Tracker_v7/mockup/index.html
  ```

Tailwind is loaded via CDN; the only network requests are to `cdn.tailwindcss.com` and Google Fonts.

## What to try

| Screen | How to reach it |
|---|---|
| **Login** | Default screen on load. |
| **Main view (tree + detail)** | Pick a ship, type any password (or leave blank), click **Continue**. |
| **Voyage detail** | Click a voyage in the tree (e.g. "Singapore → Hong Kong"). |
| **Leg detail** | Expand a voyage → click a leg row. |
| **Departure / Arrival report** | Expand a leg → click "Departure" or "Arrival". Shows full ReportForm with 5 equipment rows + 2 phases. |
| **Voyage Report (nav data)** | Same as above → click "Voyage Report". |
| **Lock overlay** | Click the 🔒 icon in the top bar. |
| **Admin Panel** | Click the ⚙ icon in the top bar — or click "Admin login" from the login screen first to log in as admin. |
| **New Voyage modal** | Click **+ New Voyage** in the top bar. |
| **Conflict modal** | Add `#conflict` to the URL: `…/index.html#conflict` (this is what users would see if two people edit the same voyage at once). |
| **Dark mode** | Click the ☀/🌙 icon in the top bar. |
| **Sidebar toggle** | Click the ☰ icon (visible on narrow viewports). |

## What this mockup is and isn't

**Is:** A faithful preview of layout, hierarchy, color, typography, and click-flow for v7.

**Isn't:** Functional. Nothing saves. Any password works. The data shown is hardcoded fake data for 3 sample voyages.

## What I want feedback on

1. **Tree pane (left)** — does the indent / icon / dirty-dot scheme work? Any voyages/legs you'd organize differently?
2. **Detail pane (right)** — voyage detail, leg detail, and report form layouts.
3. **Top bar** — ship identity, role chip, save status, action placement.
4. **Colors & typography** — does it still feel like the maritime "Signal Flag Bands" theme?
5. **Login screen** — too plain? Too busy?
6. **Lock & admin overlays** — clear about what they do?

After you've clicked around, tell me what to change. Once it's signed off, Phase 2 (real Vite scaffold + auth) starts.

## Files

- `index.html` — the entire mockup, all CSS + JS + fake data inline.
- `README.md` — this file.
