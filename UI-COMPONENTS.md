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
  progress · stat · toggle        ← Foundation 2.1 (health-data controls)
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
| `UI.progress` | `{ value, max?, label?, tone?, unit?, showValue?, valueText?, indeterminate? }` | `role="progressbar"` + `aria-valuenow/min/max` and a human `aria-valuetext`; clamps to range, flags over-target / complete, `max<=0` or `NaN` → indeterminate |
| `UI.stat` | `{ label, value, unit?, delta?, deltaText?, good?: 'up'\|'down', icon?, hint?, loading? }` | metric card; `good` says which direction is positive (weight → `'down'`) and colours the delta; arrow has an `sr-only` "increased/decreased"; `loading` → skeleton; `null` value → `—` |
| `UI.toggle` | `{ label?, on, act, data?, hint?, disabled?, ariaLabel? }` | accessible switch — native `<button role="switch" aria-checked>` so Space/Enter work for free; always carries an accessible name; flip state in the `data-act` handler and re-render |

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

### Spacing system (`--gap` + `.page`)

One token drives the gap between every stacked component: `--gap` (14px desktop → 12px
tablet ≤1040 → 10px phone ≤560). It feeds the column/grid stacks (`.col`, `.health-col`,
`.grid-home`, `.health-cols`, `.care-cols`, `.glance-cols`, `.home-fixed`, and the modular
grid's column gap — `layoutHome` reads the computed value so masonry rows match). Page bodies
use the `.page` class (`max-width:980px; margin:0 auto; gap:var(--gap)`; `.page.narrow` = 880,
`.page.tight` = 780) instead of repeating an inline flex-column wrapper. Pages that render bare
panels (planner, calendar, health, money…) are evened by `#view > * + * { margin-top:var(--gap) }`
— block margins collapse, so it never doubles a wrapper's own gap. Net effect: spacing is
even within and across every page, and tightens on tablet/phone (tablet `main`/`.panel` padding
trimmed from 20→14) so there's less dead space on small screens. To add a new full page, wrap it
in `<div class="page">…</div>` and it inherits the responsive rhythm for free.

**Home/Care/Food masonry.** The resizable modular grid (`layoutHome`) now does a true
shortest-column packing: each card is placed explicitly into the column where it sits highest, so
a tall card never strands an empty hole (CSS `grid-auto-flow:dense` couldn't pull it up). Card
width (`data-c`) and height (`data-h`) resizing still work; on tablet, spans snap to clean
half/full so cards tile without orphan side-gaps.

---

## Foundation 2.1 — health-data controls (`progress` · `stat` · `toggle`)

Three components added for the surfaces a tracking OS leans on most: daily targets,
vitals, and adherence switches. Same idiom — single options object, `esc()`'d text,
`data-act` for interactivity, reduced-motion / Calm aware.

```js
// daily target meters (announced as "82 g of 110 g")
host.innerHTML = [
  UI.progress({ label:"Protein",  value:82, max:110, unit:"g",    tone:"peri"  }),
  UI.progress({ label:"Water",    value:9,  max:8,   unit:"cups", tone:"peach" }), // over → amber
  UI.progress({ label:"Fibre",    value:28, max:28,  unit:"g",    tone:"mint"  }), // complete → mint
  UI.progress({ label:"Syncing…", indeterminate:true }),                           // unknown total
].join("");

// vitals cards — `good` colours the trend (weight: down is good)
UI.stat({ icon:"⚖️", label:"Weight", value:"80.9", unit:"kg", delta:-0.5, good:"down", hint:"vs last week" });
UI.stat({ label:"Logged today", value:null, hint:"No meals yet" });  // missing → "—"
UI.stat({ label:"Weight", loading:true });                          // skeleton while fetching

// adherence switch — flip in the handler, then re-render
UI.toggle({ label:"Protein with every meal", on:state.protein, act:"flipHabit", data:{ k:"protein" } });
// H.flipHabit = el => { state[el.dataset.k] = !state[el.dataset.k]; save(); render(); };
```

**Edge cases handled.** `progress` clamps out-of-range values, treats `max<=0`/`NaN`
as indeterminate (so a bad target can't throw or overflow the bar), and marks
over-target vs complete states distinctly; `stat` renders `—` for `null`/empty values,
falls back to a skeleton under `loading`, and never relies on colour or the arrow alone
(screen readers hear "increased"/"decreased"); `toggle` is a real `role="switch"` so it
is keyboard-operable with no extra JS and always has an accessible name even with no
visible label. All animation inherits the global reduced-motion / Calm kill-switch.

*Build: app `2026-06-14.14` (client-only — ship with `PUBLISH.bat`).*
