# Voyage Tracker v7 — Project Charter

> Engineering log for the **Celebrity Solstice-class** (5 ships).
> Replaces v6 (`~/Projects/Voyage_Tracker_v6`, single-ship, local-file storage).

---

## 1. What this app is

A static SPA used by ECR / Chief Engineers to log fuel + lub-oil consumption per cruise leg. Data lives in a **public GitHub repository** (the data is not sensitive — see §4); the app reads/writes JSON files via the Contents API. Reads are anonymous; writes require a GitHub PAT. Git history is the audit log.

**Fleet (all Solstice-class, identical engine/boiler plant):**

| Code | Ship                  | Built |
|------|-----------------------|-------|
| SL   | Celebrity Solstice    | 2008  |
| EQ   | Celebrity Equinox     | 2009  |
| EC   | Celebrity Eclipse     | 2010  |
| SI   | Celebrity Silhouette  | 2011  |
| RF   | Celebrity Reflection  | 2012  |

---

## 2. Tech stack

- **React 19** + **Vite 7**
- **Tailwind CSS 4** (CSS-first config; theme tokens in `src/styles/app.css`)
- **GitHub Contents API** for storage (no backend, no server)
- **WebCrypto** for PIN hashing (PBKDF2-SHA256, 310k iter)
- Deployment: GitHub Pages (static)

No backend. No database. No serverless functions. The entire app is a static bundle that talks to one public GitHub data repo (unauthenticated reads, PAT-authenticated writes).

---

## 3. Storage model

**Two repos:**
1. `voyage-tracker-v7` — app code + GitHub Pages deploy.
2. `voyage-tracker-data` (**PUBLIC**) — JSON data + auth config.

**Why public:** GitHub's Contents API requires authentication for *any* read on a private repo. A private data repo would mean every viewer needs a PAT, contradicting §4's "anonymous View Only." Since the data isn't sensitive (no PII, no financial data — just fuel counters), making the repo public is the cleanest way to deliver truly anonymous reads without introducing a serverless proxy. The `auth.json` file in `data/_config/` contains only PBKDF2 PIN hashes (no PATs, no secrets), so its being publicly readable is acceptable — the PIN is a UI accident-gate, not a secret (see §4).

**Data repo layout:**
```
data/
├── _config/
│   └── auth.json                       # per-ship PIN hashes (no PATs stored)
├── solstice/
│   ├── 2026-01-15_MIA-NAS-MIA.json
│   └── 2026-02-04_FLL-CZM-FLL.json
├── equinox/
├── eclipse/
├── silhouette/
└── reflection/
```

**File naming:** `<voyageStartDate>_<route>.json` — e.g. `2026-01-15_MIA-NAS-MIA.json`.

**Conflict handling:** every PUT carries the previous file SHA; GitHub returns 409 on mismatch → app shows `ConflictModal` (Reload remote / Force overwrite / Cancel).

---

## 4. Auth model — "Trust the PC + PIN for edit"

The data is **not secret** (it's not PII or financial). The threat we defend against is **accidental edits by someone walking up to an unlocked ECR PC**, not exfiltration.

### Read access (View Only)
- No password, **no PAT**. The PC's Windows lock screen IS the access boundary.
- Anyone who lands on the URL can browse all 5 ships' voyage data read-only.
- Anonymous reads work because `voyage-tracker-data` is public (§3). The storage layer issues unauthenticated `GET`s for list/load operations.

### Edit access (per-ship PIN)
- 4-digit PIN per ship — **accident prevention, not security**.
- User picks ship → enters PIN → picks editor role → can edit only that ship's data.
- PINs are hashed (PBKDF2) and stored in `data/_config/auth.json`.
- Editor session: 30-minute idle timeout, then drops back to View Only.

### 4 Editor Roles (recorded in commit trailer, not enforced as permissions)
| Role                   | Commit trailer        |
|------------------------|-----------------------|
| Chief Engineer         | `Editor-Role: Chief`  |
| 2nd Engineer (ECR)     | `Editor-Role: Second` |
| Bridge Officer of Watch| `Editor-Role: Bridge` |
| Other                  | `Editor-Role: Other`  |

### Admin access (GitHub PAT — Option A)
- Admin login = paste your GitHub fine-grained PAT into the Admin modal.
- App calls `GET /user` to verify the token works on the data repo.
- Token is held **in JS memory only** (or browser password manager autofill if user opts in). Never in localStorage by default; sessionStorage only if user ticks "remember for this tab".
- **Admin actions:** rotate ship PINs, view recent commits, bootstrap new ships.
- PAT lifecycle: generated once on github.com (~3 min), reusable until expiry/revocation. Recommend 1-year fine-grained PAT scoped to data repo with `Contents: Read & Write`. Save in password manager.
- **No separate admin password exists.** Your GitHub account IS the admin credential. Nothing leaks server-side because there is no server.

### What gates what — PAT vs PIN

The PAT and the PIN are **separate, non-overlapping gates**. The PAT controls whether GitHub's API accepts the call at all; the PIN controls whether the UI lets the user flip into Edit Mode. Neither is a substitute for the other.

| Action                        | PAT? | PIN? | Notes |
|-------------------------------|------|------|-------|
| View voyages                  | —    | —    | Anonymous GETs on the public data repo. |
| Edit voyage data (create / save / end) | ✓    | ✓    | PAT so the `PUT` succeeds; PIN so the UI unlocks. |
| Rotate a ship's PIN           | ✓    | —    | Admin action — PAT *is* the admin credential. |
| Init data dir / bootstrap ship | ✓    | —    | Admin action. |

The PIN is never a crypto secret and never gates API calls. Anyone with the PAT can write to the repo directly via `curl` — the PIN only exists to stop an idle crew member at an unlocked ECR PC from clicking "Enable Edit" and changing a number. If the PAT is compromised, rotate it on github.com; the PIN rotation is a separate concern aimed at local accident prevention.

### Canonical seed PINs (mockup demo values)
| Ship | PIN  |
|------|------|
| SL   | 4815 |
| EQ   | 2734 |
| EC   | 7106 |
| SI   | 5293 |
| RF   | 8362 |

These are the **initial PINs** seeded into `auth.json` on first deploy. Admin rotates them after handover to crew.

---

## 5. Equipment & fuel rules (Solstice-class)

| Equipment | Default fuel | Allowed fuels        | Locked? |
|-----------|--------------|----------------------|---------|
| DG 1-2    | HFO          | HFO / MGO / LSFO     | no      |
| DG 4      | HFO          | HFO / MGO / LSFO     | no      |
| DG 3      | MGO          | MGO / LSFO           | no      |
| Boiler 1  | MGO          | MGO only             | **yes** |
| Boiler 2  | MGO          | MGO only             | **yes** |

**Default densities:** HFO 0.92, MGO 0.83, LSFO 0.92 (editable per-voyage).

**Lub-oil:** recorded **only** at End Voyage (one entry per voyage), NOT in departure/arrival reports.

This is data-driven via `public/ship-classes/solstice-class.json` so adding a new ship class later = drop a new JSON file.

---

## 6. UI architecture

**Layout:** persistent left tree + right detail pane (CSS Grid).

```
TopBar:  [☰] Voyage Tracker — Celebrity Solstice    [● Edit Mode | View Only]  [Enable Edit] [⚙] [🌙] [⇦]

┌─ Sidebar (tree) ─────────┬─ Detail Pane ──────────────────────────────────┐
│  🔍 Search               │                                                │
│  [Active][Ended][All]    │   Selected node renders here:                  │
│                          │   • VoyageDetail (cruise card + densities      │
│  ▾ MIA-NAS-MIA           │     + summary + Legs list)                     │
│    📋 Voyage Detail      │   • ReportDetail (Departure/Arrival form)      │
│    ▾ Leg 1               │   • VoyageReportDetail (End Voyage summary     │
│      📤 Departure        │     incl. lub-oil)                             │
│      📥 Arrival          │                                                │
│    ▾ Leg 2               │                                                │
│      📤 Departure        │                                                │
│      📥 Arrival          │                                                │
│    📊 Voyage Report      │                                                │
└──────────────────────────┴────────────────────────────────────────────────┘
```

**Tree hierarchy:**
- Voyage
  - 📋 Voyage Detail (always present)
  - Leg 1, 2, 3, …
    - 📤 Departure Report
    - 📥 Arrival Report
  - 📊 Voyage Report (only after End Voyage)

**No `LegDetail` node** — clicking a leg expands it; the actual detail nodes are Departure/Arrival underneath.

**Independent pane scrolling:** `html, body { overflow: hidden }`, root flex with `min-h-0` on grid children. Sidebar scrolls independently of detail; detail scrolls independently of sidebar.

**Mobile:** sidebar becomes a drawer below 900 px.

**Keyboard nav:** arrow keys, Enter, Home/End, `/` to focus search, Ctrl+B to toggle sidebar, Esc to close modals.

---

## 7. Visual design — Signal Flag Bands theme

Carried from v6, refined.

- **Fonts:** Manrope (UI) + IBM Plex Mono (numerics)
- **Color-coded category cards:** fuel (amber), water (blue), chemicals (green), lube (purple)
- **Edit Mode badge:** amber pill in top bar
- **View Only badge:** muted gray pill
- **Buttons:** `btn-primary` (blue), `btn-warning` (amber for End Voyage / Enable Edit)

**Dark mode** via CSS variable redefinition in `.dark` (architectural, not per-element overrides). Tokens defined:
- Surface: `--color-bg`, `--color-surface`, `--color-surface2`
- Text: `--color-text`, `--color-dim`, `--color-faint`
- Borders: `--color-border-subtle`
- State: `--color-error-{bg,fg}`, `--color-warn-{bg,fg}`
- Landing gradient: `--color-landing-bg-{from,mid,to}`

Toggle persists in localStorage; respects `prefers-color-scheme` on first visit.

---

## 8. Mockup is the spec

**`mockup/index.html`** is the canonical visual + behavioral specification.

It is a single self-contained HTML file (Tailwind via CDN, fake JSON inline, vanilla JS state machine). It demonstrates:
- Landing screen (ship picker + optional PIN + role + Open)
- Main view with tree + detail pane
- Edit Mode toggle, View Only banner
- All forms (ReportForm with 5 equipment rows × 2 phases, VoyageReportSection with lub-oil)
- All modals: New Voyage, Add Leg, End Voyage, Enable Edit, Admin Panel, Rotate PIN, Conflict
- Dark mode
- Independent pane scrolling
- PIN auto-advance / OTP-style input behavior

**Implementation MUST match the mockup's structure, copy, spacing, color choices, and interaction patterns** unless a deviation is explicitly approved.

---

## 9. Reuse from v6

Carry these over largely unchanged (refactor to read equipment from class config instead of hardcoded keys):

- `src/utils/factories.js`
- `src/utils/calculations.js`
- `src/utils/validation.js`
- `src/utils/constants.js`
- `src/components/voyage/PhaseSection.jsx`
- `src/components/voyage/EquipmentRow.jsx`
- `src/components/voyage/ReportForm.jsx`
- `src/components/voyage/CruiseSummary.jsx`
- `src/components/voyage/VoyageReportSection.jsx`
- All 6 modals in `src/components/modals/`
- `Icons.jsx` (extend with Lock / Cloud / GitHub / Tree / Anchor / Sail)
- `app.css` (Signal Flag Bands theme)
- `ThemeContext`, `ToastContext`

**Verification:** re-enter 3 v6 sample voyages in v7, fuel totals (HFO/MGO/LSFO MT) must match v6 to 0.01.

---

## 10. Project layout (target)

```
Voyage_Tracker_v7/
├── CLAUDE.md                           # this file
├── mockup/                             # Phase 1 sign-off artifact (canonical spec)
│   ├── index.html
│   └── README.md
├── public/
│   ├── ships.json                      # ship roster
│   └── ship-classes/
│       └── solstice-class.json         # equipment, fuels, densities, phase templates
├── src/
│   ├── auth/                           # crypto, PIN, session, PAT vault, inactivity
│   ├── storage/
│   │   └── github/                     # client, contents, commits, errors
│   ├── domain/                         # factories, calculations, validation, constants
│   ├── contexts/                       # Theme, Toast, Ship, VoyageStore, Auth
│   ├── hooks/
│   ├── components/
│   │   ├── auth/                       # LandingScreen, EditModeModal, AdminPanel
│   │   ├── layout/                     # AppShell, TopBar, Sidebar, DetailPane
│   │   ├── tree/                       # VoyageTree, TreeNode, TreeToolbar
│   │   ├── detail/                     # VoyageDetail, ReportDetail, VoyageReportDetail
│   │   ├── voyage/                     # ReportForm, PhaseSection, EquipmentRow, …
│   │   ├── modals/                     # NewVoyage, AddLeg, EndVoyage, Conflict, …
│   │   └── Icons.jsx
│   ├── styles/
│   │   ├── app.css
│   │   └── tree.css
│   ├── App.jsx
│   └── main.jsx
└── .github/workflows/deploy.yml
```

---

## 11. Build phases (going forward)

1. ~~**Mockup**~~ — DONE. Sign-off complete.
2. **Scaffold + Auth** — Vite scaffold, carry v6 domain/, build auth module (PIN hash, session, inactivity, PAT vault), `LandingScreen`, `EditModeModal`, `AdminPanel`.
3. **GitHub Storage** — `storage/github/` modules, conflict handling, commit trailers.
4. **Tree UI** — `VoyageStoreContext`, `VoyageTree`, `AppShell`, `DetailPane`, hash routing, keyboard nav, dirty guard.
5. **Reuse v6 forms** — drop in `ReportForm` / `PhaseSection` / `EquipmentRow` / `CruiseSummary` / `VoyageReportSection`, refactor to class config.
6. **Admin Panel** — full implementation: rotate PINs, view commits, bootstrap ships.
7. **Deploy** — GitHub Pages workflow, v6 import script, Lighthouse a11y ≥ 95.

---

## 12. Operating principles

- **No code changes for new ships of the same class** — drop an entry in `ships.json`, that's it.
- **No code changes for cosmetic data tweaks** — densities, phase labels, etc. all live in class config JSON.
- **No backend, ever** — if a feature requires a backend, redesign the feature.
- **The mockup is the contract** — if implementation diverges from `mockup/index.html`, that's a bug to file, not a freedom to take.
- **Git history is the audit log** — every save commit carries a structured trailer:
  ```
  [solstice] save: 2026-01-15_MIA-NAS-MIA.json

  Voyage: 2026-01-15 MIA-NAS-MIA
  Editor-Role: Chief
  App-Version: 7.0.0
  ```

---

*Last updated: 2026-04-19. Maintained alongside `mockup/index.html` — they MUST stay in sync.*
