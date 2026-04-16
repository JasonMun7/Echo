# Echo Design System

Standards for UI in the Echo web app. **Lead with the brand gradient: Cyan → Lavender** (`#21C4DD` → `#A577FF`) for primary CTAs, key highlights, and “Echo” moments. **Cetacean Blue** (`#150A35`) anchors text and contrast; the **dashboard sidebar rail** sits on the same deemphasized plane as the page canvas (see **§1**).

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

Source of truth: [`app/globals.css`](app/globals.css) (`:root` and `.dark`). **Deemphasized** = full-page canvas and **dashboard sidebar rail** (recede). **Emphasized** = main dashboard column, cards, popovers, and modals (lifted above the canvas).

| Layer                         | Role                                                   | Tailwind / token                                                                       | Light (`:root`)  | Dark (`.dark`)           |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------- | ------------------------ |
| **Canvas (deemphasized)**     | Page ground; sidebar rail (`.echo-sidebar-inset`)      | `bg-background` · `--background`                                                       | `#eef2fa`        | `oklch(0.098 0.016 285)` |
| **Echo ghost**                | Kept in sync with canvas (`@theme --color-echo-ghost`) | `bg-echo-ghost`                                                                        | `#eef2fa`        | same as `--background`   |
| **Emphasized — main column**  | Dashboard `SidebarInset` (card surface + elevation)    | `DASHBOARD_MAIN_SURFACE_CLASS` → `bg-card`, `md:rounded-tl-2xl`, shadow, `md:border-l` | matches `--card` | matches `--card`         |
| **Emphasized — card**         | Panels, sheets, in-page cards                          | `bg-card` · `--card`                                                                   | `#ffffff`        | `oklch(0.242 0.024 285)` |
| **Emphasized — echo surface** | Alias for card-level white/surface                     | `--color-echo-surface`                                                                 | `#ffffff`        | matches `--card`         |
| **Sidebar tokens (legacy)**   | shadcn compatibility; optional chrome outside the rail | `bg-sidebar` · `--sidebar`                                                             | `#fafcff`        | `oklch(0.258 0.026 285)` |
| **Muted (between)**           | Secondary rows, nav active state, subtle fills         | `bg-muted` · `--muted`                                                                 | `#eef1f7`        | `oklch(0.195 0.02 285)`  |

**Usage:** Apply **`bg-background`** to the app shell behind the dashboard; the **sidebar rail** uses **`.echo-sidebar-inset`** (canvas; no rail border — separation from the main column is shadow + **`md:border-l`** on **`SidebarInset`**). The **main column** uses **`bg-card`** via **`DASHBOARD_MAIN_SURFACE_CLASS`** in [`lib/dashboard-shell.ts`](lib/dashboard-shell.ts) (applied in [`app/dashboard/layout.tsx`](app/dashboard/layout.tsx)). Nest **`.echo-card`**, bordered panels, and data tables on the main column for additional elevation. Default borders: **`border-border`**. Marketing or legacy copy may still mention `#F5F7FC`; the app canvas token is **`#eef2fa`**.

### Card borders and elevation (neutral only)

For **in-column cards and list tiles** (dashboard grids, integrations, auth panels, loaders):

- Use a **neutral outline**: **`border border-border`** (or **`border-dashed border-border`** only for **empty / placeholder** regions such as **`DashboardEmptyState`**).
- **Lift** surfaces with **shadow**, not with **brand-tinted** frames: prefer **`shadow-md`** / **`shadow-lg`** / **`shadow-xl`** (`shadow-black/[…]` in light mode, `dark:shadow-black/…` in dark). **Do not** use **`border-primary`**, **`ring-primary`**, **`ring-[#A577FF]`**, or other **lavender/cyan-tinted rings or borders on whole cards** for emphasis — those are reserved for **§5** gradient wells/tags and primary **buttons**, not card chrome.
- **`.echo-card`** ([`app/globals.css`](app/globals.css)): **`rounded-lg`**, **`border border-border`**, **`bg-card`**, **`shadow-lg`** — default **elevated bordered** panel. Prefer this over ad-hoc `shadow-sm` on the same node (avoid stacking conflicting shadows).
- **Workflow list tiles** ([`lib/workflow-status.ts`](lib/workflow-status.ts) — **`workflowShellClass`**, **`workflowListCardClass`**): **`rounded-xl`**, **`border border-border`**, **`bg-card`**, **`shadow-md`** with **`hover:shadow-lg`**. The **“most recently updated”** tile adds **`shadow-xl`** only (still neutral — no colored ring).

**CSS utilities** (see [app/globals.css](app/globals.css)): `.echo-btn-primary`, `.echo-gradient-cyan-lavender`, `.echo-fill-cta-gradient`, `.echo-card` (bordered elevated surface — **`border-border` + shadow**), `.echo-glass-card`, etc.

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

**Profile modal:** Dialog shell uses **`border-border`** + **`bg-card`** + **`shadow-xl`** (modal chrome). **Left rail** stays **deemphasized**: **`echo-sidebar-inset`** (canvas / `--background`), with corner rounding aligned to the dialog (`rounded-t-2xl` stacked mobile, **`md:rounded-l-2xl`** beside the main panel). **Main panel** (right) is **emphasized** like the dashboard main column: **`PROFILE_MODAL_MAIN_SURFACE_CLASS`** in [`lib/dashboard-shell.ts`](lib/dashboard-shell.ts) — **`bg-card`**, **`shadow-sm`**, **`border-l`** (desktop) or **`border-t`** (stacked), matching **§1** elevation vocabulary. Section header uses **`border-b border-border/60`** on transparent **`bg`** over the card; scroll body inherits the emphasized surface (not **`bg-background`**). Nested section panels still use **`border-border`**, **`.echo-card`** / **`bg-muted/40`** where needed. **Verified** / emphasis pills use **`GradientIconTag`**; section hero icons use **`GradientIconWell`** — not flat tinted boxes (**§4**, **§5**). Where a **brand mark** helps (e.g. Echo on Help, Google on sign-in), use **`ProfileBrandLogo`** — **Brandfetch** CDN hotlinks via `brandfetchLogoUrlForDomain` with Tabler/Lucide fallback (same rules as integrations; requires `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`).

- **Expanded width:** ~240px (`--sidebar-width`). **Collapsed (desktop):** icon rail ~68px — labels hide; tooltips remain.
- **Header:** Page title only (no visible subtitle; route description is **`sr-only`**), centered **universal command palette** trigger (⌘K only — no other Echo surface should bind ⌘K), notifications (stub), **theme** toggle, **EchoPrism** orb → `/dashboard/chat`. On the workflow **editor**, **⌘⇧K** focuses the canvas step search.
- **EchoPrism / LiveKit:** [components/echo-prism-livekit-session.tsx](components/echo-prism-livekit-session.tsx) on the chat route; token via Echo agent `POST /api/livekit/token` (optional `NEXT_PUBLIC_LIVEKIT_SANDBOX_ID` for sandbox).

### Main column padding (below the header)

**Source of truth:** [lib/dashboard-shell.ts](lib/dashboard-shell.ts) — `DASHBOARD_MAIN_PAD_CLASS`.

The main content area **below `SiteHeader`** uses **horizontal** padding (`DASHBOARD_INSET_X_CLASS` via `DASHBOARD_MAIN_PAD_CLASS`) plus **vertical margin** (`DASHBOARD_MAIN_CONTENT_MY_CLASS`) on the same wrapper. Margin (not padding) keeps breathing room top/bottom **without** shrinking the inner scroll/flex box the way layout `py-*` did. Apply **once** in [app/dashboard/layout.tsx](app/dashboard/layout.tsx); add extra **`gap-*`** / **`py-*`** on individual pages if a route needs more spacing.

| Token / export                     | Role                                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_MAIN_SURFACE_CLASS`     | **Emphasized** shell on [`SidebarInset`](components/ui/sidebar.tsx): `bg-card`, `md:rounded-tl-2xl`, light shadow, `md:border-l` — set once in [app/dashboard/layout.tsx](app/dashboard/layout.tsx).        |
| `PROFILE_MODAL_MAIN_SURFACE_CLASS` | **Profile modal** main column: `bg-card`, `shadow-sm`, `border-l` / `border-t` — same elevation language as `DASHBOARD_MAIN_SURFACE_CLASS` (see [profile-modal.tsx](components/profile/profile-modal.tsx)). |
| `DASHBOARD_SHELL_TOP_INSET_CLASS`  | **`pt-2`** on the wrapper around `SidebarInset` — thin strip of **`bg-background`** above the main column (sidebar rail stays flush to the top).                                                            |
| `DASHBOARD_INSET_X_CLASS`          | **Horizontal** inset only — shared by [`SiteHeader`](components/site-header.tsx) and the main column so the header icon/title line up with page content.                                                    |
| `DASHBOARD_MAIN_CONTENT_MY_CLASS`  | **Vertical margin** (`my-4 sm:my-5 md:my-6`) on the main content wrapper — top/bottom air without layout `py-*`.                                                                                            |
| `DASHBOARD_MAIN_PAD_CLASS`         | `DASHBOARD_INSET_X_CLASS` (horizontal) — used with `DASHBOARD_MAIN_CONTENT_MY_CLASS` in [app/dashboard/layout.tsx](app/dashboard/layout.tsx).                                                               |
| `DASHBOARD_MAIN_PAD_NEGATE_CLASS`  | Full-bleed negate: **`DASHBOARD_INSET_X_NEGATE_CLASS`** + **`DASHBOARD_MAIN_CONTENT_MY_NEGATE_CLASS`**.                                                                                                     |
| `dashboardMainBleedClass()`        | Wrapper for **full-bleed** routes that cancel the pad (edge-to-edge in the main column).                                                                                                                    |

**Full-bleed routes** (segment `layout.tsx` wraps children with `dashboardMainBleedClass()`):

- [app/dashboard/workflows/[id]/edit/layout.tsx](app/dashboard/workflows/[id]/edit/layout.tsx) — workflow canvas.
- [app/dashboard/chat/layout.tsx](app/dashboard/chat/layout.tsx) — EchoPrism session.

All other dashboard routes inherit the padded main column from the root dashboard layout.

### Empty states (dashboard)

Use **`DashboardEmptyState`** ([components/dashboard-empty-state.tsx](components/dashboard-empty-state.tsx)) for “no rows yet” views in the main column: **dashed `border-border` frame**, light **`shadow-md`** + subtle **`bg-card/80`** (and optional blur) so the block reads as a **raised** panel on the canvas, full-area **Threads** shader (muted motion, `enableMouseInteraction={false}`), **icon** in a **`rounded-full bg-muted`** well (default accent **`text-[#0891b2]`**), **title** + optional **description**, then **optional `children`** (primary CTA, `CreateWorkflowMenu`, links).

- Prefer **`minHeightClass="min-h-0 flex-1"`** and **`className="min-h-0 flex-1"`** when the empty state should expand inside a flex scroll region (workflows, MCP, schedule).
- Integrations reuse the same component via **`IntegrationsEmptyState`** ([app/dashboard/integrations/\_components/integrations-empty-state.tsx](app/dashboard/integrations/_components/integrations-empty-state.tsx)).

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
| **Step context (rich)**                                                                               | `components/echo-flow/step-context-composer.tsx` — previews, `{{cN}}` tokens; video synthesis attaches step frames here                                                               |
| Stateful async button (marketing)                                                                     | `components/ui/stateful-button.tsx`                                                                                                                                                   |
| Agent session (LiveKit)                                                                               | `components/agents-ui/blocks/agent-session-view-01`                                                                                                                                   |
| **Dashboard empty state** (dashed + Threads)                                                          | `components/dashboard-empty-state.tsx` — `DashboardEmptyState`                                                                                                                        |

**Workflow share — public visibility:** Copying the direct link and sending email invites are enabled only when the workflow is **public** (`is_public` on the workflow; enforced by the API). The **owner** turns this on with a **`Switch`** (`size="sm"`) plus **`Label`** and short helper copy at the top of the dialog; collaborators see a read-only note if the workflow is still private. While sharing is off, link and invite controls are **disabled** and visually muted (`text-muted-foreground`, neutral borders per **§4** — no extra brand tint on the switch row). Primary gradient stays on the main **Share** entry points that open the dialog, not on the visibility control itself.

### Universal command palette vs contextual search

|                | Universal (`DashboardCommandMenu`)                                                                                                                                                    | Contextual (`EchoSearchWithSuggestions`)                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Trigger**    | Header “Search or jump to…” (`bg-card` + `border-border`; search icon may sit in `GradientIconWell`)                                                                                  | Local `<Input>` + icon; live suggestions under the field                                                      |
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

- Default: **`border-border`** on cards and panels where a visible edge helps (**§1**); empty placeholders may use **dashed** `border-border` plus shadow. **No** brand-tinted borders on hover or focus for generic inputs, selects, or **whole cards**.
- **Allowed** Cyan→Lavender **ring**: **`GradientIconWell`**, **`GradientIconTag`**, and **`corners="full"`** for circular avatars — see **§6**. Do not duplicate that effect with flat `ring-primary` or colored `box-shadow` on plain `Avatar` components.

### Workflow list tiles (layout detail)

Dashboard **workflow grids** use **`workflowShellClass`** / **`workflowListCardClass`** — borders and shadow **steps** are defined in **§1 — Card borders and elevation (neutral only)** (do not add brand-tinted **card** rings). **Media clipping:** put **`overflow-hidden rounded-t-xl`** on the **top media strip** (thumbnail, Brandfetch hero, or placeholder) so the asset clips to the card’s top corners; keep the **“most recently updated”** pulse dot **outside** that clipped strip (sibling wrapper with **`relative`**, dot **`absolute -right-1 -top-1`**).

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

### Dashboard page title & description (canonical)

**Source of truth:** [`lib/dashboard-page-typography.ts`](lib/dashboard-page-typography.ts). Use these for **in-page hero** rows on dashboard routes (and the profile modal section header) so typography matches (font inherits from the app — **Inter**).

**[`SiteHeader`](components/site-header.tsx)** shows **only the page title** (`h1` + icon); route descriptions from [`dashboard-route-titles.ts`](lib/dashboard-route-titles.ts) are **`sr-only`** for screen readers, not visible under the title.

| Role                       | Export / pattern                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page title**             | **`DASHBOARD_PAGE_TITLE_CLASS`** — `text-xl font-semibold tracking-tight sm:text-2xl`                                                             |
| **Page description**       | **`DASHBOARD_PAGE_DESCRIPTION_CLASS`** — `text-sm text-muted-foreground leading-relaxed sm:text-base` (in-page / modal — not in **`SiteHeader`**) |
| **SiteHeader title color** | Same title scale; override with **`text-card-foreground`** on the `h1` (card surface).                                                            |

Use the constants above for dashboard route titles and lead copy (avoid duplicating sizes). Optional **`mt-1`** between title and description when not using a parent **`gap-*`**.

### Other typography

| Use                              | Suggestion                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Section (in-card, not page hero) | `text-lg font-semibold text-foreground` or `text-base font-semibold` per context |
| Body                             | `text-base text-muted-foreground`                                                |
| Muted                            | `text-sm text-muted-foreground`                                                  |

Spacing: `gap-4` default between blocks; dashboard main column uses **`DASHBOARD_MAIN_PAD_CLASS`** + **`DASHBOARD_MAIN_CONTENT_MY_CLASS`** (see **§2 — Main column padding**). The main column surface uses **`DASHBOARD_MAIN_SURFACE_CLASS`** (`md:rounded-tl-2xl` against the sidebar rail).

---

## 9. Echo Flow (workflow editor)

- **Canvas:** React Flow; dotted background with Lavender at low opacity.
- **Top bar (editor):** `EchoSearchWithSuggestions` for steps; Share / Publish; collaborator avatars (`GradientIconWell` **full**) when shared.
- **Dock:** `FloatingDock` bottom-center.
- **Inspector:** `EchoNodeInspector`; `StepEditorPanel` with `StepContextComposer` for step narrative and frame previews (`context_attachments`).
- **Persistence:** `PUT /api/workflows/{id}/flow` (`flow_graph`).

### Search (`EchoSearchWithSuggestions`)

Popover list under input; optional `onQueryChange` for filtered grids (e.g. integrations).

### Motion

Aceternity for heavy shells (modals, dock); shadcn for forms and a11y.

### Icons

Prefer Tabler; Echo Flow may use Lucide where names differ — keep `h-4`–`h-5` and **§4 — Interactive chrome** (foreground/muted only; no hover accent on glyphs).

---

## 10. CSS variables (`globals.css`)

`@theme inline`: `--color-echo-cetacean`, `--color-echo-lavender`, `--color-echo-cyan`, `--color-echo-ghost`, `--color-echo-surface`, `--color-echo-text`, `--color-echo-text-muted`, `--shadow-echo-card`, `--radius-echo`, etc. Semantic app tokens (`--background`, `--card`, `--sidebar`, …) and the deemphasized vs emphasized hierarchy are documented in **§1 — Deemphasized & emphasized backgrounds** above (dashboard main column = **`--card`**, rail = **`--background`** via `.echo-sidebar-inset`). **`--ring`** is **neutral** for default focus (see **§4**).

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
| `.echo-card`                           | `border-border` + `shadow-lg` elevated card (see §1)           |
| `.echo-glass-card`                     | Glass card                                                     |
| `.echo-btn-primary`                    | Primary gradient button                                        |
| `.echo-btn-secondary`                  | Outline (neutral border; see globals)                          |
| `.echo-btn-secondary-accent`           | Cyan-tinted outline (use sparingly; marketing / special cases) |
| `.echo-indicator-flash-dot`            | Pulsing status dot                                             |
| `.echo-gradient-*`                     | Named backgrounds                                              |
| `GradientIconWell` / `GradientIconTag` | 1px Cyan→Lavender frame (see §6)                               |
