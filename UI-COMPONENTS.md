# Mifuyu OS — UI Component System (Foundation 2.0)

A senior-engineer UI pass for `index.html`. The app is a single-file **vanilla** app
(no framework), so "components" are two things working together:

1. A **CSS foundation layer** of shared classes + design tokens that lift the *entire*
   existing UI at once (focus, motion, elevation, loading, responsive).
2. A small **`UI.*` JavaScript namespace** of reusable, accessible helpers that each
   return an HTML string — used for loading/empty states and standardised controls.

Everything is **additive and backward-compatible** — no existing screen was rewritten,
so nothing breaks, and the cozy snowfox aesthetic is preserved and elevated. All motion
is automatically disabled under `prefers-reduced-motion` and the in-app **Calm mode**.

---

## Component architecture

```
Design tokens (:root)
  ├─ colour palette (existing)            --bg --panel --ink --peri --sakura --lav --mint …
  ├─ motion         --dur-1/2/3  --ease  --ease-spring
  └─ elevation      --elev-1  --elev-2

CSS foundation (shared classes — lift all existing markup)
  ├─ Focus      :focus-visible rings on every interactive element  ·  :focus:not(:focus-visible) → none
  ├─ Motion     toast slide-up · gradient-button sheen sweep · hover elevation (desktop only)
  ├─ Loading    .skeleton + ::after shimmer · .sk-line/.sk-title · .spinner(.lg)
  ├─ Empty      .empty / .empty-emoji / .empty-title / .empty-msg
  ├─ A11y       .sr-only (screen-reader-only) · coarse-pointer touch targets ≥34px
  └─ Responsive phone tab-bar → horizontal scroll · tablet padding · fluid hero type (clamp)

UI.* helpers (JS — return HTML strings, props = one options object)
  spinner · skeleton · skeletonCard · empty · button · iconButton · pill · field
```

**Why this shape.** In a vanilla render-to-string app, a shared CSS layer is the highest-
leverage tool: one rule (e.g. `:focus-visible`) fixes keyboard accessibility on thousands
of buttons at once, with zero per-element edits and near-zero regression risk. The `UI.*`
helpers then standardise the *new* surfaces (loading, empty, future controls) so they're
consistent and accessible by construction.

---

## Props design (`UI.*`)

Every helper takes a **single options object** so call sites are self-documenting and
arguments are order-independent. All text is HTML-escaped via `esc()`.

| Component | Props | Notes |
|---|---|---|
| `UI.spinner` | `{ size?: 'sm'\|'lg', label?: string }` | `role="status"`, announces "Loading" to screen readers if no label |
| `UI.skeleton` | `{ lines?: number, width?: string }` | last line is 70% width for a natural look; `aria-hidden` |
| `UI.skeletonCard` | `{ lines?: number }` | panel-shaped placeholder; `aria-busy` |
| `UI.empty` | `{ emoji?, title?, msg?, action?: { label, act, data?, variant? } }` | optional CTA button wired to the app's `data-act` handler system |
| `UI.button` | `{ label, variant?: 'primary'\|'ghost', icon?, act?, data?, ariaLabel?, loading?, disabled? }` | `loading` swaps in a spinner + `aria-busy`; `disabled` sets `aria-disabled` |
| `UI.iconButton` | `{ icon, act, data?, ariaLabel, title? }` | `ariaLabel` required — icon-only buttons must be labelled |
| `UI.pill` | `{ text, tone?: 'peri'\|'sak'\|'lav'\|'mint'\|'ice'\|'gray' }` | maps to existing `.pill-*` classes |
| `UI.field` | `{ label, id?, control: html, hint? }` | wraps a control with a `<label for>` + hint |

`data` objects become `data-*` attributes, so components plug straight into the existing
event-delegation system (`data-act="…"` → the `H` handler map).

---

## Implementation — what shipped

**Accessibility (the biggest real gap closed).** Before, only text inputs showed a focus
style, so keyboard and switch users had *no visible focus* on buttons, tabs, chips, or
check-ins. Now every interactive element shows a clear focus ring — but only on keyboard
focus (`:focus-visible`), so mouse/touch users never see a stray outline. Added `.sr-only`
for screen-reader text, `role="status" aria-live="polite"` on the toast so confirmations
are announced, larger touch targets on coarse pointers, and `aria-busy`/`aria-label` on
loading and icon controls.

**Motion & polish.** A small motion-token scale (`--dur-*`, `--ease`, `--ease-spring`) for
consistent timing; the toast now slides up instead of just fading; gradient buttons get a
soft sheen sweep on hover; cards/buttons lift with elevation on hover — but only on real
hover devices (`@media (hover:hover) and (pointer:fine)`), and the press-scale stays the
primary tactile feedback on touch. All of it inherits the existing reduced-motion / Calm
kill-switch, so it's silent for anyone who opts out.

**Loading states.** A shimmer `.skeleton` system + `.spinner`, plus a **boot skeleton**
painted into `#view` in the HTML itself — so the very first frame shows gentle placeholder
cards instead of a blank screen, before any JavaScript runs. The Withings diagnostic now
uses `UI.spinner` as a live demonstration. Under reduced-motion the skeleton stays a calm
static block (still a valid "loading" cue) rather than shimmering.

**Responsive (mobile · iPad · PC).** On phones the tab bar now scrolls horizontally
(with scroll-snap) instead of stacking into several rows that ate vertical space; tablet
gets a touch more padding; the hero clock/title uses fluid `clamp()` type so it scales
cleanly across sizes. Desktop keeps the three-column home; the existing breakpoints are
untouched and just refined around the edges.

**Edge cases handled.** Reduced-motion and Calm mode disable all new animation; the
focus ring never appears on mouse/touch; skeletons degrade to static blocks; icon buttons
require an `ariaLabel`; the boot skeleton is replaced on first render so it can't get
stuck; hover effects are gated to hover-capable pointers so they don't "stick" on touch.

---

## How to use it going forward

```js
// loading
host.innerHTML = UI.spinner({ label: "syncing…" });
host.innerHTML = UI.skeletonCard({ lines: 4 });

// empty state with a call to action
list.length ? renderRows() : UI.empty({
  emoji: "🎨", title: "No art logged yet",
  msg: "Tap below and Kiko will start your gentle art streak.",
  action: { label: "Log some art", act: "logArt", variant: "primary" }
});

// a standardised primary button
UI.button({ label: "Save", variant: "primary", act: "save", icon: "💾" });

// mark any clickable card as lift-on-hover
`<div class="panel interactive">…</div>`
```

Add the `interactive` class to any panel/card that's clickable to get the hover-elevation
treatment. That's the only opt-in; everything else applies automatically.

*Build: app `2026-06-14.13` (client-only — ship with `PUBLISH.bat`).*
