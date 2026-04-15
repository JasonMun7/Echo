# Echo Design System

Standards for UI in the Echo web app. **Lead with the brand gradient: Cyan → Lavender** (`#21C4DD` → `#A577FF`) for primary CTAs, key highlights, and “Echo” moments. **Cetacean Blue** (`#150A35`) anchors text, sidebar chrome, and contrast.

**Interactive chrome** (icons, menus, borders, focus) is **neutral and monochrome** — see **§4**. Only **§5 — Gradient border frame** (`GradientIconWell`, `GradientIconTag`) and named gradient “wall” utilities carry the Cyan→Lavender **ring**; everything else uses `border-border`, muted highlights, and a neutral focus ring.

## 1. Brand quick reference

| Role                | Hex                           | Use                                                      |
| ------------------- | ----------------------------- | -------------------------------------------------------- |
| **Cyan**            | `#21C4DD`                     | Gradient start, marketing accents                        |
| **Lavender**        | `#A577FF`                     | Primary button fill, gradient end                        |
| **Cyan → Lavender** | `from-[#21C4DD] to-[#A577FF]` | **Default** for primary buttons and marketing emphasis   |
| **Cetacean Blue**   | `#150A35`                     | Body/headings, dark UI, sidebar text                     |
| **Ghost / canvas**  | `#eef2fa`                     | Page background (`bg-background`); deemphasized vs cards |

### Deemphasized & emphasized backgrounds

Source of truth: [`app/globals.css`](app/globals.css) (`:root` and `.dark`). **Deemphasized** = full-page canvas (recedes). **Emphasized** = surfaces that sit above the canvas (cards, popovers, sidebar).

| Layer                         | Role                                                   | Tailwind / token                 | Light (`:root`) | Dark (`.dark`)           |
| ----------------------------- | ------------------------------------------------------ | -------------------------------- | --------------- | ------------------------ |
| **Canvas (deemphasized)**     | Page ground; default behind main content               | `bg-background` · `--background` | `#eef2fa`       | `oklch(0.098 0.016 285)` |
| **Echo ghost**                | Kept in sync with canvas (`@theme --color-echo-ghost`) | `bg-echo-ghost`                  | `#eef2fa`       | same as `--background`   |
| **Emphasized — card**         | Panels, sheets, modals                                 | `bg-card` · `--card`             | `#ffffff`       | `oklch(0.242 0.024 285)` |
| **Emphasized — echo surface** | Alias for card-level white/surface                     | `--color-echo-surface`           | `#ffffff`       | matches `--card`         |
| **Emphasized — sidebar**      | App sidebar chrome                                     | `bg-sidebar` · `--sidebar`       | `#fafcff`       | `oklch(0.258 0.026 285)` |
| **Muted (between)**           | Secondary rows, subtle fills                           | `bg-muted` · `--muted`           | `#eef1f7`       | `oklch(0.195 0.02 285)`  |

**Usage:** Apply **`bg-background`** to the outer page shell; use **`bg-card`** / **`bg-popover`** / **`bg-sidebar`** (or patterns like `.echo-sidebar-inset`) for anything that should read as **lifted** above the canvas. Default borders: **`border-border`**, **`border-sidebar-border`**. Marketing or legacy copy may still mention `#F5F7FC`; the app canvas token is **`#eef2fa`**.

**CSS utilities** (see [app/globals.css](app/globals.css)): `.echo-btn-primary`, `.echo-gradient-cyan-lavender`, `.echo-fill-cta-gradient`, `.echo-card`, `.echo-glass-card`, etc.

**Tech:** shadcn/ui, Tailwind v4, Tabler Icons (Lucide where noted), Inter.

---

## 2. Dashboard shell

Layout code lives in:

| Area                               | Files                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar (sections, icon rail)      | [components/app-sidebar.tsx](components/app-sidebar.tsx), [components/ui/sidebar.tsx](components/ui/sidebar.tsx)                         |
| Top bar (search, theme, EchoPrism) | [components/site-header.tsx](components/site-header.tsx), [components/dashboard-command-menu.tsx](components/dashboard-command-menu.tsx) |
| Profile modal (account)            | [components/profile/profile-modal.tsx](components/profile/profile-modal.tsx) — sidebar nav + panels                                      |
| Dashboard frame                    | [app/dashboard/layout.tsx](app/dashboard/layout.tsx)                                                                                     |

**Profile modal:** Shell uses **`border-border`** + **`bg-card`** on the dialog (neutral chrome). Left rail is **`echo-sidebar-inset`** / **`bg-sidebar`** (no extra hairlines between blocks — separation is padding + surface only). Section panels use **`border-border`**, **`bg-card`** / **`bg-muted/40`**, **`text-foreground`** / **`text-muted-foreground`**. **Verified** / emphasis pills use **`GradientIconTag`**; section hero icons use **`GradientIconWell`** — not flat tinted boxes (**§4**, **§5**). Where a **brand mark** helps (e.g. Echo on Help, Google on sign-in), use **`ProfileBrandLogo`** — **Brandfetch** CDN hotlinks via `brandfetchLogoUrlForDomain` with Tabler/Lucide fallback (same rules as integrations; requires `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`).

- **Expanded width:** ~240px (`--sidebar-width`). **Collapsed (desktop):** icon rail ~68px — labels hide; tooltips remain.
- **Header:** Page title (md+), centered **universal command palette** trigger (⌘K only — no other Echo surface should bind ⌘K), notifications (stub), **theme** toggle, **EchoPrism** orb → `/dashboard/chat`. On the workflow **editor**, **⌘⇧K** focuses the canvas step search.
- **EchoPrism / LiveKit:** [components/echo-prism-livekit-session.tsx](components/echo-prism-livekit-session.tsx) on the chat route; token via Echo agent `POST /api/livekit/token` (optional `NEXT_PUBLIC_LIVEKIT_SANDBOX_ID` for sandbox).

### Main column padding (below the header)

**Source of truth:** [lib/dashboard-shell.ts](lib/dashboard-shell.ts) — `DASHBOARD_MAIN_PAD_CLASS`.

The main content area **below `SiteHeader`** uses responsive horizontal + vertical padding so pages are not flush to the inset edges. Apply it **once** in [app/dashboard/layout.tsx](app/dashboard/layout.tsx); **do not** repeat `p-6 md:p-10` (or similar) on individual dashboard pages — use **`gap-*`** between sections only.

| Token / export                    | Role                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_INSET_X_CLASS`         | **Horizontal** inset only — shared by [`SiteHeader`](components/site-header.tsx) and the main column so the header icon/title line up with page content. |
| `DASHBOARD_MAIN_PAD_Y_CLASS`      | **Vertical** padding for the scrollable main area only (below the header).                                                                               |
| `DASHBOARD_MAIN_PAD_CLASS`        | `DASHBOARD_INSET_X_CLASS` + `DASHBOARD_MAIN_PAD_Y_CLASS` on the main content wrapper in [app/dashboard/layout.tsx](app/dashboard/layout.tsx).            |
| `DASHBOARD_MAIN_PAD_NEGATE_CLASS` | Full-bleed negate (`DASHBOARD_INSET_X_NEGATE_CLASS` + `DASHBOARD_MAIN_PAD_Y_NEGATE_CLASS`) — keep in sync with the pad classes.                          |
| `dashboardMainBleedClass()`       | Wrapper for **full-bleed** routes that cancel the pad (edge-to-edge in the main column).                                                                 |

**Full-bleed routes** (segment `layout.tsx` wraps children with `dashboardMainBleedClass()`):

- [app/dashboard/workflows/[id]/edit/layout.tsx](app/dashboard/workflows/[id]/edit/layout.tsx) — workflow canvas.
- [app/dashboard/chat/layout.tsx](app/dashboard/chat/layout.tsx) — EchoPrism session.

All other dashboard routes inherit the padded main column from the root dashboard layout.

---

## 3. Components we use (by path)

| Component                                                                                             | Path                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gradient frame & tag** (Cyan→Lavender ring)                                                         | `components/ui/gradient-icon-well.tsx` — `GradientIconWell`, `GradientIconTag`                                                                                                        |
| **Universal search** (⌘K, navigate + workflows + integrations + profile sections)                     | `components/dashboard-command-menu.tsx` — `DashboardCommandMenu`, `DashboardSearchTrigger`, `useDashboardCommandPalette`                                                              |
| **Contextual search** (dropdown under an input; workflow editor, add-step modal, integrations filter) | `components/ui/echo-search-with-suggestions.tsx` — exports panel/row class helpers: `ECHO_SEARCH_SUGGEST_PANEL_CLASS`, `ECHO_SEARCH_SUGGEST_EMPTY_CLASS`, `echoSearchSuggestRowClass` |
| Workflow edit step search icons (Brandfetch + Composio mapping)                                       | `components/echo-flow/echo-flow-step-search-icon.tsx` — `EchoFlowStepSearchIcon`                                                                                                      |
| Floating dock                                                                                         | `components/ui/floating-dock.tsx`                                                                                                                                                     |
| Workflow share                                                                                        | `components/workflow-share-dialog.tsx` (or echo-flow variant)                                                                                                                         |
| Step visual context                                                                                   | `components/echo-flow/step-visual-context.tsx`                                                                                                                                        |

**Workflow share — public visibility:** Copying the direct link and sending email invites are enabled only when the workflow is **public** (`is_public` on the workflow; enforced by the API). The **owner** turns this on with a **`Switch`** (`size="sm"`) plus **`Label`** and short helper copy at the top of the dialog; collaborators see a read-only note if the workflow is still private. While sharing is off, link and invite controls are **disabled** and visually muted (`text-muted-foreground`, neutral borders per **§4** — no extra brand tint on the switch row). Primary gradient stays on the main **Share** entry points that open the dialog, not on the visibility control itself.
| Stateful async button (marketing) | `components/ui/stateful-button.tsx` |
| Agent session (LiveKit) | `components/agents-ui/blocks/agent-session-view-01` |

### Universal command palette vs contextual search

|                | Universal (`DashboardCommandMenu`)                                                                                                                                                    | Contextual (`EchoSearchWithSuggestions`)                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Trigger**    | Header “Search or jump to…” (emphasized `bg-card` + border; search icon may sit in `GradientIconWell`)                                                                                | Local `<Input>` + icon; live suggestions under the field                                                      |
| **Shortcut**   | ⌘/Ctrl+K (global)                                                                                                                                                                     | None by default; editor uses **⌘⇧K** for step search only                                                     |
| **Scope**      | Routes, account/profile sections, workflows list, integrations catalog                                                                                                                | Single page’s list (steps, actions, integrations grid filter)                                                 |
| **Navigation** | `router.push`; profile sections use `DashboardProfileNavProvider` / `openProfile(section)`                                                                                            | `onSelect` callback (e.g. focus card, pick action); edit URL `?step=` is for deep links only                  |
| **Logos**      | Brandfetch **CDN hotlinks** via `brandfetchLogoUrlForDomain` / `brandfetchLogoUrlForIntegrationId` — **do not** call the Brandfetch **Search** API (`brandfetch-search.ts`) from here | Same: deterministic CDN URLs + Tabler fallbacks for integrations (see `integration-search-dropdown-icon.tsx`) |
| **Styling**    | shadcn `Command` / `CommandDialog`                                                                                                                                                    | Use exported `ECHO_SEARCH_*` classes so dropdowns stay visually consistent                                    |

---

## 4. Interactive chrome (icons, menus, borders, focus)

This section is the **source of truth** for neutral UI chrome. It applies across the dashboard, Echo Flow, and shared primitives.

### Icons (theme-stable, monochrome)

- Use **`text-foreground`**, **`text-muted-foreground`**, or **`text-white`** on gradient-filled buttons — not per-state accent hues on the glyph.
- **Do not** change icon color on hover or row highlight: no `hover:text-primary`, `group-hover:text-[#0891b2]`, or similar on icons inside menus, sidebars, or cards. Prefer **container** highlight (`bg-muted`) when the whole control is the target.
- **Destructive** actions may keep **semantic** red on icon + label (`text-destructive`).

### Dropdowns, menus, and list rows

- **Highlight** = **background only** (`bg-muted` or a neutral overlay). **Do not** recolor label text or icons on `data-[highlighted]` / focus for default items (except destructive rows).
- Submenus and checkbox/radio items follow the same rule.

### Borders and inputs

- Default: **`border-border`** (or borderless surfaces with shadow). **No** brand-tinted borders on hover or focus for generic inputs, selects, or cards.
- **Allowed** Cyan→Lavender **ring**: **`GradientIconWell`**, **`GradientIconTag`**, and **`corners="full"`** for circular avatars — see **§6**. Do not duplicate that effect with flat `ring-primary` or colored `box-shadow` on plain `Avatar` components.

### Focus

- Visible focus for keyboard users uses a **neutral** `--ring` (grayscale in light and dark). **Do not** use lavender or cyan rings for default focus on text fields and shadcn controls.

### Buttons with text + icons

- Any **`Button`** (or obvious button-styled control) that shows **visible text** must include a **leading or trailing** icon (Tabler/Lucide). **Exception:** `size="icon"`, `icon-sm`, `icon-xs`, `icon-lg` — icon-only sizes.
- Primary gradient / destructive / link variants still follow this rule unless the control is icon-only.

---

## 5. Patterns

- **Echo Flow:** Canvas, dock, inspector, share — see **§9 — Echo Flow**; use `formatAction` / `workflow-action-labels.ts` for labels (no raw `snake_case` in UI).
- **Async actions:** Loading state (`Loader2` + `animate-spin`) and Sonner toasts; Aceternity `StatefulButton` reserved for hero/marketing.
- **Accessibility:** Icon-only controls need shadcn `Tooltip`; combobox keyboard nav for search fields; visible focus rings (**§4**).

---

## 6. Gradients (canonical)

### Primary product gradient — Cyan to Lavender

Use for **primary buttons**, hero CTAs, and brand emphasis.

```css
background: linear-gradient(to right, #21c4dd, #a577ff);
```

Tailwind: `bg-gradient-to-r from-[#21C4DD] to-[#A577FF]` — class: **`.echo-gradient-cyan-lavender`**

### Supporting gradients

| Name                  | Tailwind                      | Class                      |
| --------------------- | ----------------------------- | -------------------------- |
| Dark (sidebar / hero) | `from-[#150A35] to-[#2d1b69]` | `.echo-gradient-dark`      |
| Dramatic              | `from-[#0d0620] to-[#A577FF]` | `.echo-gradient-dramatic`  |
| Cetacean → Cyan       | `from-[#150A35] to-[#21C4DD]` | `.echo-gradient-secondary` |

### Gradient border frame (`GradientIconWell`)

Use for **icons, avatars, and logos** where a crisp **1px** ring should read as Echo brand (not a flat gray border).

- **Implementation:** `bg-linear-to-r` using `--echo-icon-well-from` / `--echo-icon-well-to` on the outer wrapper with `p-px`, **inner** plate on `bg-card`. Inner corner radius = outer − 1px for rounded rects — use `corners="lg"` (8px / 7px), `corners="xl"` (12px / 11px), or **`corners="full"`** for **circular avatars** (profile modal, workflow editor collaborators, share dialog).
- **Brandfetch / raster logos:** apply **`gradientWellImageClass("lg")` or `gradientWellImageClass("xl")`** to `<img>` (same `corners` as the well) so artwork matches the inner radius; avoid extra padding on the image that fights the clip.
- **Do not** put `overflow-hidden` on the **outer** shell (it clips the ring at corners). Override inner with `innerClassName` only when you need different clipping.
- **Where we use it:** workflow step icons (`echo-step-node`), add-action / search rows, profile + share **avatars** (circular), section header icons, Share workflow dialog hero icon.

```tsx
import { GradientIconWell } from "@/components/ui/gradient-icon-well";

<GradientIconWell corners="xl" className="h-10 w-10">
  <Icon className="h-5 w-5 text-foreground" aria-hidden />
</GradientIconWell>;
```

### Gradient tag (`GradientIconTag`)

**Tag / pill variant** of the same gradient ring: `rounded-full` outer + inner for inline labels, counts, or status chips next to headings.

- **Sizes:** `size="sm"` (compact) and `size="md"` (default).
- Inner defaults to **card** fill and **foreground** text. Override with `innerClassName` for dark surfaces (e.g. `bg-background`).

```tsx
import { GradientIconTag } from "@/components/ui/gradient-icon-well";

<GradientIconTag>New</GradientIconTag>
<GradientIconTag size="sm" innerClassName="bg-muted">Beta</GradientIconTag>
```

---

## 7. Buttons

**Primary:** `.echo-btn-primary` — **Cyan → Lavender** (all aliases: `.echo-btn-gradient`, `.echo-btn-cyan-lavender`, etc.). Non-button surfaces: `.echo-fill-cta-gradient` / `.echo-fill-cta-gradient-br`.

**Icon buttons:** Must use shadcn `Tooltip` (`TooltipProvider` at app level). Icon glyphs follow **§4 — Interactive chrome** (no accent tint on hover; container highlight only).

**Text + icon:** See **§4 — Buttons with text + icons**.

---

## 8. Typography & spacing

| Use        | Suggestion                               |
| ---------- | ---------------------------------------- |
| Page title | `text-3xl font-bold text-foreground`     |
| Section    | `text-2xl font-semibold text-foreground` |
| Body       | `text-base text-muted-foreground`        |
| Muted      | `text-sm text-muted-foreground`          |

Spacing: `gap-4` default between blocks; dashboard **outer** padding is **`DASHBOARD_MAIN_PAD_CLASS`** (see **§2 — Main column padding**); the main column uses `rounded-tl-2xl` against the sidebar.

---

## 9. Echo Flow (workflow editor)

- **Canvas:** React Flow; dotted background with Lavender at low opacity.
- **Top bar (editor):** `EchoSearchWithSuggestions` for steps; Share / Publish; collaborator avatars (`GradientIconWell` **full**) when shared.
- **Dock:** `FloatingDock` bottom-center.
- **Inspector:** `EchoNodeInspector`; `StepEditorPanel`; optional `StepVisualContext` when step has screenshot metadata.
- **Persistence:** `PUT /api/workflows/{id}/flow` (`flow_graph`).

### Search (`EchoSearchWithSuggestions`)

Popover list under input; optional `onQueryChange` for filtered grids (e.g. integrations).

### Motion

Aceternity for heavy shells (modals, dock); shadcn for forms and a11y.

### Icons

Prefer Tabler; Echo Flow may use Lucide where names differ — keep `h-4`–`h-5` and **§4 — Interactive chrome** (foreground/muted only; no hover accent on glyphs).

---

## 10. CSS variables (`globals.css`)

`@theme inline`: `--color-echo-cetacean`, `--color-echo-lavender`, `--color-echo-cyan`, `--color-echo-ghost`, `--color-echo-surface`, `--color-echo-text`, `--color-echo-text-muted`, `--shadow-echo-card`, `--radius-echo`, etc. Semantic app tokens (`--background`, `--card`, `--sidebar`, …) and the deemphasized vs emphasized hierarchy are documented in **§1 — Deemphasized & emphasized backgrounds** above. **`--ring`** is **neutral** for default focus (see **§4**).

---

## Appendix A — Full color tables

### Primary palette

| Token         | Hex       | Usage                          |
| ------------- | --------- | ------------------------------ |
| Cetacean Blue | `#150A35` | Dark accents, headers, sidebar |
| Lavender      | `#A577FF` | Primary fills, gradient end    |
| Ghost White   | `#F5F7FC` | Legacy marketing copy          |
| Cyan          | `#21C4DD` | Gradient start, marketing      |

### Lavender / Cyan opacity tints

Reserve **rgba / opacity** tints of Cyan and Lavender for **gradient components** (**§6**), **marketing hero** art, and **primary CTA** surfaces — not for default borders, focus rings, or menu row chrome (**§4**).

### Semantic

|            | Hex       |
| ---------- | --------- |
| Success    | `#22c55e` |
| Error      | `#ef4444` |
| Text muted | `#6b7280` |

---

## Appendix B — Glassmorphism

Primary language for overlays and elevated panels: `backdrop-blur`, semi-transparent fills, **neutral** borders (`border-border` / subtle white or black alpha). Utilities: `.echo-glass-light`, `.echo-glass-dark`, `.echo-glass-card`. Prefer **§4** for rings and focus.

---

## Appendix C — Utility class index

| Class                                  | Description                                                    |
| -------------------------------------- | -------------------------------------------------------------- |
| `.echo-card`                           | Solid bordered card                                            |
| `.echo-glass-card`                     | Glass card                                                     |
| `.echo-btn-primary`                    | Primary gradient button                                        |
| `.echo-btn-secondary`                  | Outline (neutral border; see globals)                          |
| `.echo-btn-secondary-accent`           | Cyan-tinted outline (use sparingly; marketing / special cases) |
| `.echo-indicator-flash-dot`            | Pulsing status dot                                             |
| `.echo-gradient-*`                     | Named backgrounds                                              |
| `GradientIconWell` / `GradientIconTag` | 1px Cyan→Lavender frame (see §6)                               |
