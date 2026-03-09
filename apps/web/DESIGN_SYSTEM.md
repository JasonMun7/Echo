# Echo Design System

A clean, modern design system using Cetacean Blue, Lavender, Ghost White, and Cyan secondary. Glassmorphism is the primary visual language. Use this document as the standard for all UI development in the Echo application.

## Tech Stack

- **Components**: **shadcn/ui** — You must use shadcn components at all times. Build on top of shadcn primitives; do not create custom components from scratch when a shadcn equivalent exists.
- **Styling**: Tailwind CSS
- **Icons**: Tabler Icons (`@tabler/icons-react`)
- **Font**: Inter (via Next.js font optimization)

---

## Color Palette

### Primary Colors

| Token         | Name           | Hex       | RGB           | Usage                                      |
| ------------- | -------------- | --------- | ------------- | ------------------------------------------ |
| Cetacean Blue | Primary Dark   | `#150A35` | 21, 10, 53    | Dark accents, headers, sidebar, gradients  |
| Lavender      | Primary Accent | `#A577FF` | 165, 119, 255 | Primary buttons, links, highlights, accent |
| Ghost White   | Surface        | `#F5F7FC` | 245, 247, 252 | Page backgrounds, card backgrounds         |

### Lavender Shades (opacity / tints)

| Token        | Usage                                                            |
| ------------ | ---------------------------------------------------------------- |
| Lavender 80% | `rgba(165, 119, 255, 0.8)` — Hover states, slightly muted accent |
| Lavender 60% | `rgba(165, 119, 255, 0.6)` — Borders, subtle accents             |
| Lavender 40% | `rgba(165, 119, 255, 0.4)` — Backgrounds, dividers               |
| Lavender 20% | `rgba(165, 119, 255, 0.2)` — Very light accents                  |

### Secondary Colors

| Token        | Name           | Hex       | RGB            | Usage                                          |
| ------------ | -------------- | --------- | -------------- | ---------------------------------------------- |
| Cyan         | Secondary      | `#21C4DD` | 33, 196, 221   | Secondary buttons, links, badges, accents       |

### Cyan Shades (opacity / tints)

| Token     | Usage                                                             |
| --------- | ----------------------------------------------------------------- |
| Cyan 80%  | `rgba(33, 196, 221, 0.8)` — Hover states, slightly muted          |
| Cyan 60%  | `rgba(33, 196, 221, 0.6)` — Borders, subtle accents               |
| Cyan 40%  | `rgba(33, 196, 221, 0.4)` — Backgrounds, dividers                 |
| Cyan 20%  | `rgba(33, 196, 221, 0.2)` — Very light accents                    |

### Semantic Colors

| Token      | Hex       | Usage                                  |
| ---------- | --------- | -------------------------------------- |
| Success    | `#22c55e` | Positive indicators, growth            |
| Error      | `#ef4444` | Errors, destructive actions            |
| Text       | `#150A35` | Headings, primary text (Cetacean Blue) |
| Text Muted | `#6b7280` | Body text, descriptions                |
| Text Light | `#9ca3af` | Secondary labels                       |

---

## Gradients

### Dark Gradient

Cetacean Blue to mid purple. Use for hero backgrounds, section headers, sidebar backgrounds.

```css
background: linear-gradient(to right, #150a35, #2d1b69);
```

Tailwind: `bg-gradient-to-r from-[#150A35] to-[#2d1b69]`

### Dramatic Gradient

Near-black/dark indigo to Lavender. Use for CTAs, highlights, decorative backgrounds.

```css
background: linear-gradient(to right, #0d0620, #a577ff);
```

Tailwind: `bg-gradient-to-r from-[#0d0620] to-[#A577FF]`

### Secondary Gradient (Cyan)

Cetacean Blue to Cyan. Use for secondary CTAs, badges, accents, and complementary hero sections.

```css
background: linear-gradient(to right, #150a35, #21c4dd);
```

Tailwind: `bg-gradient-to-r from-[#150A35] to-[#21C4DD]`

### Secondary Gradient (Cyan to Lavender)

Cyan to Lavender. Use for dual-accent highlights, decorative elements, and hover states.

```css
background: linear-gradient(to right, #21c4dd, #a577ff);
```

Tailwind: `bg-gradient-to-r from-[#21C4DD] to-[#A577FF]`

### Utility Classes

- `.echo-gradient-dark` — Dark gradient (Cetacean Blue → mid purple)
- `.echo-gradient-dramatic` — Dramatic gradient (dark → Lavender)
- `.echo-gradient-secondary` — Secondary gradient (Cetacean Blue → Cyan)
- `.echo-gradient-cyan-lavender` — Dual-accent gradient (Cyan → Lavender)

---

## Glassmorphism

Glassmorphism is the primary visual language for cards, modals, sidebars, and overlays. Use frosted-glass effects with backdrop blur and semi-transparent surfaces.

### Principles

- **Backdrop blur**: Creates depth by blurring content behind panels
- **Semi-transparent backgrounds**: White/light with low opacity (10–20%) over dark; dark with low opacity over light
- **Subtle borders**: Light borders with low opacity for edge definition
- **Layered depth**: Stack glass panels for hierarchy

### Glass Card (Light)

Use on dark or gradient backgrounds.

```css
background: rgba(255, 255, 255, 0.12);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.18);
```

Tailwind: `bg-white/12 backdrop-blur-md border border-white/20`

### Glass Card (Dark)

Use on light backgrounds or as overlay.

```css
background: rgba(21, 10, 53, 0.08);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(165, 119, 255, 0.15);
```

Tailwind: `bg-[#150A35]/8 backdrop-blur-md border border-[#A577FF]/15`

### Glass Surface Variants

| Variant  | Background          | Border                 | Usage                    |
| -------- | ------------------- | ---------------------- | ------------------------ |
| Light    | `bg-white/12`       | `border-white/20`      | Dark backgrounds         |
| Light+   | `bg-white/20`       | `border-white/25`      | Emphasized on dark       |
| Dark     | `bg-[#150A35]/8`    | `border-[#A577FF]/15`  | Light backgrounds        |
| Dark+    | `bg-[#150A35]/12`   | `border-[#A577FF]/25`  | Emphasized on light      |

### Blur Levels

| Class           | blur value | Usage                        |
| --------------- | ---------- | ---------------------------- |
| `backdrop-blur-sm`  | 4px    | Subtle panels                |
| `backdrop-blur`     | 8px    | Default glass                |
| `backdrop-blur-md`  | 12px   | Cards, modals                |
| `backdrop-blur-lg`  | 16px   | Hero overlays                |
| `backdrop-blur-xl`  | 24px   | Full-screen modals           |

### Utility Classes

- `.echo-glass-light` — Light glass on dark backgrounds
- `.echo-glass-dark` — Dark glass on light backgrounds
- `.echo-glass-card` — Default glass card (dark variant)

---

## Typography

| Element       | Classes                                 | Usage                |
| ------------- | --------------------------------------- | -------------------- |
| Page title    | `text-3xl font-bold text-[#150A35]`     | Hero headings        |
| Section title | `text-2xl font-semibold text-[#150A35]` | Section headers      |
| Body          | `text-base text-gray-600`               | Default body text    |
| Muted         | `text-sm text-gray-600`                 | Descriptions, labels |
| Small         | `text-sm text-gray-500`                 | Secondary info       |
| Accent text   | `text-[#A577FF]`                        | Links, highlights    |
| Secondary accent | `text-[#21C4DD]`                    | Secondary links, badges |

---

## Spacing

Use consistent spacing scale:

- `gap-2` (8px) – Tight spacing
- `gap-4` (16px) – Default between elements
- `gap-6` (24px) – Section spacing
- `p-4`, `p-6` – Card padding
- `p-6 md:p-10` – Page content padding

---

## Components

### Buttons

**Primary** (use `.echo-btn-primary` or):

```html
<button
  class="rounded-lg bg-[#A577FF] px-5 py-2.5 font-medium text-white hover:opacity-90"
></button>
```

**Secondary** (use `.echo-btn-secondary` or):

```html
<button
  class="rounded-lg border border-[#A577FF]/40 bg-[#F5F7FC] px-5 py-2.5 font-medium text-[#150A35] hover:bg-[#A577FF]/10"
></button>
```

**Gradient** (use `.echo-btn-gradient` or):

```html
<button
  class="rounded-lg bg-linear-to-r from-[#A577FF] to-[#150A35] px-5 py-2.5 font-medium text-white hover:opacity-95"
></button>
```

**Secondary accent** (Cyan; use `.echo-btn-secondary-accent` or):

```html
<button
  class="rounded-lg border border-[#21C4DD]/40 bg-[#F5F7FC] px-5 py-2.5 font-medium text-[#21C4DD] hover:bg-[#21C4DD]/10"
></button>
```

### Cards

**Solid card** (use `.echo-card` or):

```html
<div class="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm"></div>
```

**Glass card** (preferred; use `.echo-glass-card` or):

```html
<div class="rounded-lg border border-white/20 bg-white/12 backdrop-blur-md shadow-sm"></div>
```

For white cards on Ghost White background:

```html
<div class="rounded-lg border border-gray-200 bg-white shadow-sm"></div>
```

### Links

Primary/accent links:

```html
<a class="font-medium text-[#A577FF] hover:underline"></a>
```

Secondary links:

```html
<a class="font-medium text-[#21C4DD] hover:underline"></a>
```

---

## Layout

- **Full viewport**: Use `h-screen w-full min-h-screen` for full-height pages
- **Page background**: `bg-[#F5F7FC]` (Ghost White) or gradient with glass overlays
- **Content area**: Prefer glass cards (`.echo-glass-card`) or solid cards with `rounded-lg`, `shadow-sm`
- **Sidebar**: Use `.echo-gradient-dark` for dark, or glass (`.echo-glass-light`) over gradients

---

## Border Radius

- `rounded-lg` (0.5rem) – Cards, buttons, inputs
- `rounded-tl-2xl` – Dashboard main content (connects to sidebar)

---

## Shadows

- `shadow-sm` – Cards, elevated surfaces
- `shadow-lg` – Modals, popovers (pair with glass for depth)
- Avoid heavy shadows; keep the interface light and clean
- Glassmorphism: Prefer subtle borders over strong shadows for definition

---

## Icons

Always use **Tabler Icons** (`@tabler/icons-react`):

```tsx
import { IconSettings, IconUser } from "@tabler/icons-react";

<IconSettings className="h-5 w-5 text-[#150A35]" />;
```

Icon sizes: `h-4 w-4` (small), `h-5 w-5` (default), `h-6 w-6` (large)

---

## CSS Variables (globals.css)

Design tokens are defined in `@theme inline`:

- `--color-echo-cetacean` — #150A35
- `--color-echo-lavender` — #A577FF
- `--color-echo-cyan` — #21C4DD (secondary)
- `--color-echo-ghost` — #F5F7FC
- `--color-echo-success`, `--color-echo-error`
- `--color-echo-text`, `--color-echo-text-muted`
- `--shadow-echo-card`
- `--radius-echo`, `--radius-echo-lg`

---

## Utility Classes

| Class                       | Description                                |
| --------------------------- | ------------------------------------------ |
| `.echo-card`                | Solid card with border, radius, shadow     |
| `.echo-glass-card`          | Glassmorphism card                         |
| `.echo-glass-light`         | Light glass on dark backgrounds            |
| `.echo-glass-dark`          | Dark glass on light backgrounds            |
| `.echo-btn-primary`         | Primary Lavender button                    |
| `.echo-btn-secondary`       | Secondary outline button                   |
| `.echo-btn-secondary-accent`| Secondary accent (Cyan) outline button      |
| `.echo-btn-gradient`        | Gradient button (Lavender → Cetacean Blue) |
| `.echo-gradient-dark`       | Dark gradient background                   |
| `.echo-gradient-dramatic`   | Dramatic gradient background               |
| `.echo-gradient-secondary`  | Secondary gradient (Cetacean Blue → Cyan)  |
| `.echo-gradient-cyan-lavender` | Dual-accent gradient (Cyan → Lavender) |
