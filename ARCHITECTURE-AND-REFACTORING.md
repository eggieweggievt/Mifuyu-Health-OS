# Mifuyu OS — Architecture & Refactoring Review

A senior-engineer onboarding read of the codebase: how it's built, where the risks are,
and a staged plan to raise quality without changing behaviour. Two safe refactors from this
review are already applied (see "Applied" at the end).

---

## 1. Architecture summary

**Shape.** Two deployables, no build step:

- **Client** — a single `index.html` (~6,300 lines): inline `<style>` (design tokens + all
  component CSS), then one big `<script>` of vanilla JS. No framework, no bundler.
- **Server** — one Supabase **Edge Function** (`supabase/functions/ai/index.ts`, Deno/TS,
  ~1,300 lines) exposing many `mode`s over a single POST endpoint, plus a GET branch for the
  Withings OAuth callback. Deployed with `--no-verify-jwt`.
- **Persistence** — Supabase Postgres, table `daily_logs(user_id, date, notes jsonb)`. Two
  "hot" rows carry almost everything: a per-day row keyed by date, and a **sentinel row**
  (`date = 2000-01-01`) that holds all cross-day app state (weight log, injections, sponsors,
  goals, stickies, Kiko's memory/notebook, app config…). Most features are just nested keys
  inside `notes`.

**Client runtime model.** A classic render-to-string SPA:

1. `state` (in-memory) holds `sentinel`, `today`, a `range` of recent days, and UI scratch.
2. `render()` rebuilds `#view.innerHTML` from `state` on every change (no diffing). Tab/section
   builders return HTML strings; an `esc()` helper escapes interpolated text.
3. Interaction is **event-delegated**: elements carry `data-act="name"`; one global click
   handler dispatches to a giant `H` object of handler methods. Most handlers mutate state →
   `setSent`/`setToday` (which persist + update the in-memory hot row) → `render()`.
4. Background systems run on their own loops: the Kiko pet (rAF physics), snow canvas (rAF),
   petal trail, timers/reminders (`setInterval`), and the floating Kiko chat.

**Data flow (typical write).**
`user taps → data-act → H.method → setSent(notes => next) → DB.saveDaily (clone+merge+upsert, push undo) → state.sentinel = next → render()`.

**Kiko (the assistant) flow.**
`client kikoSend → POST mode:"agent" (+ data snapshot, history, images) → server claudeAgentLoop
(tool calls: query_history / manage_memory / recall_memory / web_search) → structured JSON
{reply, actions[]} → client execAgentAction runs each action → loadData + render`.
A separate `reflect` mode distils durable preferences into a learned profile; `1A` adds vector
memory via OpenAI embeddings + pgvector.

**Cross-cutting conventions.** `APP_BUILD`/`SERVER_BUILD` stamps; everything undoable; reduced-
motion + Calm mode kill-switches; act-then-tell autonomy; the **action catalog is mirrored** in
both `execAgentAction` (client) and the `AGENT_SYSTEM` prompt (server).

---

## 2. Problem areas

### Structural
- **One-file monolith.** `index.html` mixes CSS, ~50 feature modules, the `H` handler object,
  Kiko physics, and boot in a single global scope. Navigation relies on search; there are no
  module boundaries and everything shares one namespace.
- **God objects / long functions.** `render()`, `kikoDataSummary()`, the `execAgentAction`
  switch, the `H` object, and the `AGENT_SYSTEM` template literal are each very large and do
  many things.
- **Dual source of truth for actions.** Every Kiko action must be added in *two* places
  (client `execAgentAction` + server `AGENT_SYSTEM` catalog). Easy to desync; only discipline
  keeps them aligned.

### Duplicated code
- **Date sort comparator** `(a,b)=>a.date<b.date?-1:1` appeared **29 times** — duplicated *and*
  a non-total-order comparator. (Fixed — see Applied.)
- **Anthropic fetch wrappers** — `claude`/`claudeWith`/`claudeMsg` were three near-identical
  fetch+headers+error+extract copies. (Fixed — see Applied.)
- **Unguarded input reads** — `$("#someId").value` repeated across handlers without a null
  check; several were null-deref risks (some fixed in the bug-audit pass).
- **Date construction idioms** — `new Date(iso+"T00:00")` (local) vs `new Date(iso)` (UTC) are
  scattered; correct today only because callers pair them consistently. A `parseISO`/date-utils
  module would remove a whole class of latent timezone bugs.
- **PostgREST fetch boilerplate** on the server (headers + `apikey`/`Authorization`) is repeated
  per call.

### Performance
- **Full re-render on every change.** `render()` rebuilds the entire `#view` subtree for any
  state change. Fine at this scale, but large tabs re-parse a lot of HTML on each toggle.
- **Per-frame layout reads.** `positionKikoUI()` runs every animation frame while the chat is
  open and reads `chat.offsetWidth` (a forced reflow) each time, even though the pet is static
  when sitting.
- **Always-on rAF loops.** The snow and petal loops reschedule every frame even under
  reduced-motion/Calm (they just `clearRect`) and when the tab is hidden — wasted battery.
- **Repeated deep clones.** `DB.saveDaily` does `JSON.parse(JSON.stringify(...))` twice per write
  (clone + undo snapshot); cheap individually, but every toggle pays it.

### Maintainability risks
- **No automated tests** and no type-checking on the client (plain JS). Combined with the
  single-file blast radius, every change is "verify by eye."
- **Implicit data contracts.** `notes` is free-form JSON; field shapes (e.g. a macro stored as
  `18` vs `"18g"`) aren't validated, so partial/legacy rows surface as `NaN`/`undefined` in the
  UI.
- **Silent failure modes.** The data layer ignores Supabase `{error}` (a failed query looks like
  empty data); the global click handler swallows handler errors into a generic toast, masking
  root causes.
- **Security posture.** `--no-verify-jwt` + client-supplied `userId` means access control rests
  on the client behaving; acceptable only because the app is single-tenant (deferred work).

---

## 3. Refactoring strategies (prioritised, behaviour-preserving)

**Tier 1 — low risk, high leverage (do first):**
1. **Shared utilities module-in-file.** Extract the repeated idioms into named helpers at the
   top and migrate call sites gradually: `cmpDate` (done), `inputVal(id)` (safe `.value` read),
   `lsNum(key, default)` / `lsGet`/`lsSet` (guarded localStorage), `parseISO`/`addDays`/`fmtISO`
   (one date basis). Each is a pure helper; adoption is mechanical and reviewable.
2. **Consolidate API boilerplate.** Anthropic wrappers (done). Do the same server-side for
   PostgREST: a `sb(path, init)` helper that attaches the service headers, so every Supabase
   fetch stops repeating them.
3. **Pause idle loops.** Gate the snow/petal rAF on `!document.hidden && !reduce()`; re-arm on
   `visibilitychange`. Pure perf, identical visuals.

**Tier 2 — moderate, stage with care:**
4. **Single source of truth for the action catalog.** Define the action list once (name + arg
   schema + doc) and generate *both* the server prompt catalog and a client dispatch table from
   it. Removes the lockstep-desync risk — the biggest structural hazard.
5. **Cache layout reads.** Store the chat width in state, set it in `applyKikoChatSize`/resize,
   and have `positionKikoUI` read the cached value instead of `offsetWidth` per frame.
6. **Normalise data on read.** A thin `normalizeNotes()` that coerces known numeric fields and
   fills defaults when loading a day/sentinel row — kills the `NaN`/`undefined` display class at
   the source rather than per-call-site.

**Tier 3 — larger, only with a safety net:**
7. **Split the monolith** into a few `<script type="module">` files (or a tiny build step):
   `state/db`, `render`, `handlers`, `kiko`, `ambient` (snow/pet). Keeps the no-framework feel
   but gives real boundaries. Needs smoke tests first.
8. **Introduce lightweight tests.** Even a handful of pure-function tests (date math, food
   totals, correlation engine, `execAgentAction` against a mock state) would convert "verify by
   eye" into a guardrail and unlock the bigger refactors safely.
9. **Surface data-layer errors.** Distinguish "load failed" from "empty" and preserve last-known
   state on transient errors instead of rendering empty.

---

## 4. Improved code — applied now (safe, behaviour-preserving)

**(a) One date comparator instead of 29.** Added a single total-order helper and replaced every
inline copy:

```js
// before — repeated 29×, and a non-total-order comparator (returns 1 for equal dates)
.sort((a,b)=>a.date<b.date?-1:1)

// after — one shared, stable, ascending comparator
const cmpDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:0;
.sort(cmpDate)
```
Identical ordering for distinct dates; deterministic for duplicate dates; one place to change.

**(b) One Anthropic text-completion core instead of three copies.** `claude`/`claudeWith`/
`claudeMsg` now delegate to a single `anthropicText()`; the public signatures and behaviour are
unchanged (same endpoint, headers, model defaulting, system-caching, and text-block extraction):

```ts
const cachedSys = (text) => [{ type: "text", text, cache_control: { type: "ephemeral" } }];
async function anthropicText(opts){ /* one fetch + error + text-block join */ }

const claude     = (messages, maxTokens=1400)        => anthropicText({ system: cachedSys(BRAND),   messages, maxTokens });
const claudeWith = (system, user, maxTokens=1200)    => anthropicText({ system: cachedSys(system), messages:[{role:"user",content:user}], maxTokens });
const claudeMsg  = (system, content, maxTokens=700,m)=> anthropicText({ system, messages:[{role:"user",content}], maxTokens, model:m });
```

Both are pure consolidations — no call site changed, no behaviour changed — and they remove the
exact duplication that made the recent bug-fixes need editing the same logic in three (and 29)
places. The remaining Tier 1–3 items above are the recommended next steps, sequenced so the
risky ones only happen once a small test net exists.

*Builds: app `2026-06-14.18`, server `2026-06-14.6`. Ship `PUBLISH.bat` + `UPDATE-AI.bat`.*
