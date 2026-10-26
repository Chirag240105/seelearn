# SeeLearn Design System

A calm, professional educational design language. Think Khan Academy meets a high-end CAD viewer — clean, trustworthy, and focused.

## Principles

1. **Calm & Focused** — Neutral slate surfaces let the 3D model be the hero.
2. **Purposeful Color** — One accent (blue), semantic states, and connection-type colors only where they carry meaning.
3. **Accessible** — WCAG AA contrast everywhere. Respect `prefers-reduced-motion`.
4. **Consistent** — Every value comes from `src/styles/tokens.css`. No ad-hoc colors or magic numbers.

---

## Color Tokens

### Surfaces (Dark default)

| Token                 | Value      | Use                        |
| --------------------- | ---------- | -------------------------- |
| `--sl-bg-base`        | `#0f1117`  | Page background            |
| `--sl-bg-surface`     | `#161a22`  | Cards, sidebar             |
| `--sl-bg-raised`      | `#1c2028`  | Elevated panels, inputs    |
| `--sl-bg-overlay`     | `#232830`  | Popovers, tooltips         |
| `--sl-border`         | `#2a2f3a`  | Default borders            |
| `--sl-border-subtle`  | `#232830`  | Subtle separators          |

### Text

| Token                  | Value      | Contrast (on base) |
| ---------------------- | ---------- | ------------------- |
| `--sl-text-primary`    | `#e8ecf1`  | ≈ 13.5:1            |
| `--sl-text-secondary`  | `#9ba3af`  | ≈ 6.5:1             |
| `--sl-text-muted`      | `#6b7280`  | ≈ 4.5:1 (AA)        |

### Accent — Blue

| Token               | Value                          |
| -------------------- | ------------------------------ |
| `--sl-accent`        | `#3B82F6`                      |
| `--sl-accent-hover`  | `#60A5FA`                      |
| `--sl-accent-muted`  | `rgba(59, 130, 246, 0.12)`     |
| `--sl-accent-text`   | `#93C5FD`                      |

### Semantic

| Token              | Value      | Use              |
| ------------------- | ---------- | ---------------- |
| `--sl-success`      | `#22C55E`  | Camera on, OK    |
| `--sl-warning`      | `#F59E0B`  | Searching, notice|
| `--sl-danger`       | `#EF4444`  | Error states     |

### Connection-Type Colors

| Type       | Token                  | Value      | Meaning            |
| ---------- | ---------------------- | ---------- | ------------------- |
| Power      | `--sl-conn-power`      | `#F59E0B`  | Amber               |
| Signal     | `--sl-conn-signal`     | `#06B6D4`  | Cyan                |
| Data       | `--sl-conn-data`       | `#8B5CF6`  | Violet              |
| Mechanical | `--sl-conn-mechanical` | `#6488A6`  | Slate-blue          |
| Thermal    | `--sl-conn-thermal`    | `#F97316`  | Orange-red          |

---

## Typography

| Role          | Font              | Sizes          | Weight       |
| ------------- | ----------------- | -------------- | ------------ |
| UI text       | Inter             | 12–36px scale  | 400–700      |
| Labels/Values | JetBrains Mono    | 12–14px        | 400–500      |

### Type Scale

```
--sl-text-xs    12px
--sl-text-sm    13px
--sl-text-base  14px
--sl-text-md    16px
--sl-text-lg    18px
--sl-text-xl    20px
--sl-text-2xl   24px
--sl-text-3xl   30px
--sl-text-4xl   36px
```

Minimum readable size: **12px**. Nothing smaller.

---

## Spacing (8px grid)

```
--sl-space-1    4px
--sl-space-2    8px
--sl-space-3    12px
--sl-space-4    16px
--sl-space-5    20px
--sl-space-6    24px
--sl-space-8    32px
--sl-space-10   40px
--sl-space-12   48px
--sl-space-16   64px
```

---

## Radii

```
--sl-radius-sm    4px
--sl-radius-md    8px
--sl-radius-lg    12px
--sl-radius-xl    16px
--sl-radius-full  9999px
```

---

## Shadows

| Token           | Use                              |
| --------------- | -------------------------------- |
| `--sl-shadow-sm`| Subtle depth on buttons          |
| `--sl-shadow-md`| Cards, panels                    |
| `--sl-shadow-lg`| Popovers, floating toolbars      |
| `--sl-shadow-xl`| Modals, dialogs                  |

---

## Motion

```
--sl-duration-fast     150ms
--sl-duration-normal   200ms
--sl-duration-slow     250ms
--sl-easing            cubic-bezier(0.4, 0, 0.2, 1)
```

All transitions use `var(--sl-duration-normal)` with `var(--sl-easing)` by default.
Reduced to 0ms when `prefers-reduced-motion: reduce`.

---

## Icons

**lucide-react** only. Standard size 16px (`w-4 h-4`). Smaller at 14px in compact contexts.

---

## Themes

- **Dark** (default) — `data-theme="dark"` or no attribute
- **Light** — `data-theme="light"` on `<html>`

Toggle via a button in the top bar. Store preference in `localStorage`.
