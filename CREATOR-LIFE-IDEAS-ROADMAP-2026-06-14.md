# Creator + Life ideas — roadmap (Ideas #6–#15)
*2026-06-14 · captured from the "Additional Creator + Life Ideas" doc and mapped onto the actual code in `index.html`. Companion to KIKO-UPGRADE-ROADMAP.md and GLOBAL-SYSTEMS-BLUEPRINT.md.*

> **STATUS — all of #6–#14 shipped (2026-06-14).** New tabs: 🏆 Wins, 📜 Lore, 🤝 Sponsors, 💡 Ideas (Creator) and 🐰 Bunny, 💗 People, 🏡 Home life, 📔 About Me (Health), plus 🗓️ On This Day on Home. New memory kinds `win`/`lore`/`house`/`bunnymoment` flow into `buildMemoryIndex` → Search + On This Day. All verified in headless Chrome (render, add, status-cycle, delete; responsive in both modes). **Nav tidied:** the four Creator extras fold into a **🏆 Studio** hub (Wins/Lore/Sponsors/Ideas) and the three Life features into a **💗 Life** hub (People/Home/About Me), each with an in-page sub-nav (hubs reuse the feature views unchanged via `viewStudio`/`viewLife`). **🦊 Ask Kiko is pinned to the tail of the nav in both modes.**

> **KIKO INTEGRATION shipped (2026-06-14, server build `2026-06-14.7`).** Kiko can now capture to the new stores via actions `logWin` / `saveLore` / `addIdea` / `addPerson` / `addMifuFact` / `addHouse` (client `execAgentAction` handlers + server catalog), with a MEMORY-FIRST behavior rule to *offer* saving stream moments, wins, ideas, people, facts and home beats (never auto-file). Her DATA SNAPSHOT (`kikoDataSummary`) now feeds PEOPLE, ABOUT MIFU, CREATOR WINS, STREAM LORE, HOME JOURNEY and IDEA GRAVEYARD so she truly knows them. Server deployed to Supabase; **client (`index.html`) changes require PUBLISH to go live in the app.**

## The one idea under all ten (Idea #15)
The next evolution is **remembering, not more tracking**. Nine of these ten features are the same shape: *capture a typed memory → index it → let Kiko detect, surface, and search it.* That means we should **not** build ten silos. We build one substrate and hang the features off it.

The substrate already exists: **`buildMemoryIndex()`** (`index.html` ~line 2310). It already unifies `state.sentinel.memories`, `journalEntries`, daily-note journals, weight milestones, `calendarEvents`, `memoryCapsules`, and `state.media` photos into one typed list — `{id, kind, date, title, preview, source, people[], tags[], fav}` — deduped and sorted newest-first. Search and the Timeline already read from it. **Every new memory kind we add (stream lore, house, wins, bunny moments) becomes searchable, timeline-able, and "On This Day"-able for free the moment it's pushed into this index.** That's the leverage point.

So the recommended spine is: extend `buildMemoryIndex` with new `kind`s, store each kind's records on `state.sentinel` (persisted via `setSent`, demo-mirrored via `demo[KEY]`), render with the existing `UI.*` components and `modularGrid`, and wire Kiko detection through the same keyword approach already used by `memIsBunny()` and the `careThingsThatHelp()` regex bank.

---

## Shared building blocks (build these once, reuse everywhere)

- **Memory kinds**: add `lore`, `win`, `house`, `bunnymoment` (and treat `person`/`mifufact` as profile data, not timeline items) to `buildMemoryIndex`. Give each an icon in `MEM_ICON`.
- **Storage pattern**: each feature gets one `state.sentinel` array/object (e.g. `streamLore[]`, `sponsors[]`, `ideas[]`, `houseLog[]`, `people[]`, `mifuLore[]`, richer `bunnyLog[]`). Write through `setSent(n => …)`; demo parity via the `demo[...]` mirror exactly like `setMedia`/`foodTargets`.
- **Kiko capture prompt**: a small reusable "Save this as a {X}? [Yes][Edit][No]" affordance. In-app it's a `UI.button` row wired to new `data-act` handlers in the `H` map; in chat it's a new entry in Kiko's action catalog (`supabase/functions/ai/index.ts`). Detection = keyword/regex over journal text, mirroring `memIsBunny`.
- **Surfacing**: new cards drop into existing modular tabs via `modularGrid(tab, items)`; new full tabs go through `TABS` / `CREATOR_TABS` / `HEALTH_TABS` + `modeTabs()`. Reuse `UI.stat`, `UI.progress`, `UI.toggle`, `UI.empty`, `UI.pill` so everything is accessible and on-theme by construction.
- **Kiko knowledge**: profile-style data (Mifu Lore #11, People #12) should be injected into Kiko's system snapshot so she *feels* like she remembers, not just stores.

---

## Tier 1 — reuse the memory index, minimal new data (a few afternoons each)

**#14 — On This Day / Memory Resurface.** ✅ **Shipped 2026-06-14** — `onThisDayPicks()` + `cardOnThisDay()` on both Home grids (creator + health), cycling via `otdAnother`, opening through the existing `memOpen`/`mediaView`. *Highest payoff per line of code.* Filter `buildMemoryIndex()` by matching month/day (and "last week"/"one month ago"/"one year ago" windows) against `TODAY`. Render one gentle card with `[Open Memory][Show Another]` (a `_resurfaceIdx` counter, same trick as `careMemoryPull`'s `_carePull`). Place on Home and/or Care; optional on Journal. No new storage at all — it reads what's already indexed. Ship this first; it also becomes the proof that the substrate is worth standardising on.

**#9 — Creator Wins.** A proto-version already exists as `careTinyWins()` (filters the memory index for `milestone`/`event`/`fav`). Promote it: add a `win` kind, auto-derive wins from data we already have (new lowest weight is already a `milestone`; add upload/stream/sponsor-paid milestones), and add a Creator-OS Wins card. The **Kiko evidence summary** ("you streamed 4×, sent 6 sponsor emails, uploaded 2 shorts") is computable today from `ciWeek(...)` check-in counts — objective, not generic positivity. Low risk, leans on existing counters.

**#13 — Bunny Health Trends.** ✅ **Shipped 2026-06-14** — promoted to its own **🐰 Bunny tab** in the Health nav (`TABS`/`HEALTH_TABS`/`viewBunny`). Daily log now merges appetite/poops/energy alongside status (`upsertBunnyDay` + `bunnyFlag`); `bunnyTrends()` produces gentle streak lines and rabbit-aware alerts (eating-less today, repeated concern/vet, poops off this week); `bunnyMemories()` builds a per-bunny timeline from milestones + name-matched photos. *Next:* push bunny moments into `buildMemoryIndex` as a `bunnymoment` kind so they also flow into Search / On This Day. — Original note: today `bunnyStatusToday()` reads `state.sentinel.bunnyLog` for *today only*. Upgrade to trend analysis using the same streak math as `sleepStreakUnder()`: "Myla's appetite normal for 14 days", "Kieran's energy marked low twice this week". Add gentle, non-alarmist alerts for rabbit-critical patterns (not eating / not pooping). Link bunny photos+journal ("Myla had zoomies") into a `bunnymoment` memory kind so each bunny gets a timeline. Extends existing Bunny Hub rather than replacing it.

---

## Tier 2 — new typed memory, new Creator/Life surfaces (a weekend each)

**#6 — Stream Lore Database.** New `streamLore[]` on the sentinel; each card = `{date, title, game, summary, why, tags[], people[], journalRef, clipUrl?}`. Push into `buildMemoryIndex` as `kind:"lore"` → instantly searchable/timeline/On-This-Day. Kiko auto-suggest on journal keywords ("hype train", "donation", "cried on stream", "chat went crazy", "finished chapter", "legendary pulls", "stream crashed") via the `memIsBunny`-style detector, with the Save-this prompt. New Creator-OS tab/card. The search examples in the doc ("the stream where Beezle donated 1000 euros") work through the existing search once cards exist.

**#10 — House Journey Timeline.** New `houseLog[]`; `{date, place, eventType, summary, meaning, result, photos, journalRef, withHoria, bunnyRelevance}` with `eventType ∈ {viewing, application, rejection, acceptance, moving, decorating, bunny-setup, memory}`. Index as `kind:"house"`. A dedicated chronological view (its own filtered Timeline) since the emotional arc matters. Kiko detects house-y journal language and offers to file it.

**#12 — Relationship Garden.** New `people[]` (Horia, Eggie, Cyphriee, Matrix, Fox, Fabled, …): `{name, relationship, birthday, favorites, giftIdeas[], memories[], photos, lastInteraction, appreciations[]}`. **Birthday reminders reuse the existing calendar/reminder pipeline** (`calendarEvents` + the reminder system) rather than a new scheduler. Soft "garden" presentation (cards, not a contact list) using `UI.*`. Kiko: "Cyphriee's birthday is in 14 days — you mentioned wanting to make something cute." Pairs naturally with the People dimension already on memory items (`people[]`).

**#11 — Mifu Lore Database.** New `mifuLore[]` of typed facts (favorites / dislikes / personality patterns): `{title, category, description, firstNoticed, source, importance, notes}`. This is profile data, **not** a timeline kind — its real job is to **feed Kiko's system snapshot** so she stops feeling generic (ties directly into KIKO-UPGRADE-ROADMAP #8 "memory tool"). A simple Life-OS page to view/curate; Kiko proposes new lore entries when she notices a stable pattern.

---

## Tier 3 — the heaviest data model (a focused project)

**#7 — Sponsor Relationship Tracker (CRM).** The biggest build: a real record type `sponsors[]` with ~25 fields (contact, status, rate offered/accepted, deadlines, invoice/payment/contract status, embargo, deliverables, relationship rating, red flags). Status pipeline (`New lead → … → Paid / Ghosted / Do-not-work-with`). **Kiko insights are all date-math over these records** — "no reply in 5 days", "deadline in 3 days", "unpaid", "below your usual rate", "ghosted last time" — so the value is high but depends on disciplined data entry. Dedicated Creator-OS tab with filtering + search ("which sponsors are unpaid?", "last GamerSupps payout?"). Build last: most fields, most upkeep, least reuse of the memory substrate.

**#8 — Content Graveyard.** Deliberately *light* (the doc is explicit: not a to-do list). A flat `ideas[]`: `{title, category, description, why, priority, energy, effort, status}`, `status ∈ {graveyard, maybe-later, ready-soon, active, completed, dropped}`. Kiko capture on "someday"/"cute idea"/"no time for this now". Small build; listed in Tier 3 only because it's lowest-urgency, not hardest. Could be slotted earlier if wanted.

---

## Recommended build order
1. ~~**#14 On This Day**~~ — ✅ shipped. Proved the substrate, near-zero new data, big emotional return.
2. ~~**#9 Creator Wins**~~ — ✅ shipped (🏆 Wins tab: weekly evidence from `ciWeek`, manual wins indexed as `win`, Kiko-noticed auto wins).
3. ~~**#13 Bunny Health Trends**~~ — ✅ shipped as a dedicated 🐰 Bunny tab with trends, alerts, and per-bunny memory timelines.
4. ~~**#6 Stream Lore**~~ — ✅ shipped (📜 Lore tab; indexed as `lore`). *Server-side Kiko keyword auto-capture still to do.*
5. ~~**#12 Relationship Garden**~~ — ✅ shipped (💗 People tab; birthday countdowns + gift ideas). *Calendar-reminder wiring still to do.*
6. ~~**#11 Mifu Lore**~~ — ✅ shipped (📔 About Me tab). *Feeding into Kiko's prompt still to do.*
7. ~~**#10 House Journey**~~ — ✅ shipped (🏡 Home life tab; indexed as `house`).
8. ~~**#8 Content Graveyard**~~ — ✅ shipped (💡 Ideas tab; status cycle graveyard→dropped).
9. ~~**#7 Sponsor CRM**~~ — ✅ shipped (🤝 Sponsors tab; status pipeline + date-math insights: no-reply / deadline / awaiting payment). *Inline note editing + rate-accepted history are future polish.*

## Constraints & cautions (carried from this codebase)
- **Single 690 KB `index.html`.** Every feature is render-to-string + `data-act`; keep new state on `state.sentinel` and persist via `setSent` with the `demo[...]` mirror so demo mode never diverges (the freeze we just fixed was a state/guard bug — be careful with any new lazy-load + re-render hooks; let the loader own its own loading flag).
- **Modular tabs** (`MODULAR_TABS`, `layoutHome`) measure card heights after render — new cards must size cleanly (no infinitely-growing content).
- **Accessibility is already handled** if we render through `UI.*`; don't hand-roll bars/cards/toggles again.
- **Kiko detection** should stay gentle and opt-in (the "[Yes][Edit][No]" pattern) — never auto-file without the prompt, per the doc's intent.
- **Search/Timeline are the payoff multiplier** — anything pushed into `buildMemoryIndex` inherits them, so prefer adding a `kind` over building a bespoke list view.
