# Mifuyu OS — Global Systems Blueprint

Turning the big idea-dump into ONE coherent system. The key realisation: the six "global
systems," the three Kiko-intelligence ideas, and the memory bits inside the Journal/Food/Care
redesigns are **not separate builds** — they're all views over two shared stores plus the
intelligence layer that already exists. Build the foundation once; every page plugs into it.

> Design principle: **Upload once, use everywhere. One index, many views.**

---

## 1. The unifying model (the foundation everything sits on)

Two new shared stores on the sentinel row (same pattern as today's data), plus a tiny tag/people
graph. Nothing is duplicated — items *reference* their source.

```js
// (a) MEDIA LIBRARY — every asset, uploaded once, referenced by id anywhere
sentinel.media = [{
  id, type:"photo|video|sticker|washi|deco",
  url, thumb?, caption, date, addedAt,
  tags:[], people:[],            // e.g. people:["myla"], tags:["house","funny"]
  fav:false
}]

// (b) MEMORY INDEX — one entry per "thing that happened", pointing back to its real source
sentinel.memories = [{
  id, kind:"journal|milestone|quote|memcard|health|bunny|event",
  date, title, preview,          // short text used by Search / Timeline / cards
  source:{ page, refId },        // where to open the original (journal date, weighLog id, …)
  tags:[], people:[], mediaIds:[],
  fav:false, pinned:false, important:false   // important => shows on the Timeline
}]
```

Everything else is a **query or a writer** over these:

| Your idea | What it actually is | How it's built on the foundation |
|---|---|---|
| **1. Universal Media Library** | the `media` store + a picker | one upload → `media` item; pages store `mediaIds`, never copies |
| **2. Global Search** | a query fn over memories + media + raw logs | `searchAll(q)` → text scan **+ the semantic `recall_memory` I already built** for meaning-matches ("days I felt less nauseous") |
| **3. Life Timeline** | `memories.filter(important\|\|kind∈milestone,event,quote)` grouped by month | every item already has `date` + `source` to link back |
| **4. Favorites / Pinning** | a `fav`/`pinned` flag on any item | one Favorites view unions `media.fav` + `memories.fav` |
| **5. Suggested Quotes** | Kiko extracts a line → `memories(kind:"quote")` | runs in the journal `reflect`/analyse pass that already exists |
| **6. Bunny Relationship Timeline** | the Timeline, filtered to `people∈[myla,kieran]` | same store, a person filter |
| Journal **memory cards** / Care **memory pull** / **monthly capsules** | writers/readers of `memories` | capsule generator (already built) now reads the index instead of re-deriving |

This is why it's one system: Search, Timeline, Favorites, Bunny Timeline, Care's Memory Pull,
and the Journal's memory cards are **the same data filtered differently**.

---

## 2. The Kiko intelligence layer (ideas #1–3) — extends what's already here

These don't need new stores; they build on the correlation engine + semantic memory already shipped:

- **#1 Health Interpreter** — for each metric, attach a plain-language read of the *trend* (not
  the day's number) with a possible cause + one action. New tiny server mode `interpret` (takes a
  metric's recent series → one grounded paragraph), reusing the self-grounding rules. Numbers stay
  visible; Kiko adds the "what it means."
- **#2 Kiko Insights** — the richer "✨ Kiko noticed." The correlation engine (Pearson over
  date-aligned daily metrics) and the affinity learning are already in; this widens the data it
  reads (journal text sentiment, goals, creator cadence) and phrases multi-source findings
  ("muscle +2.1% coincides with higher protein + more gym + steadier meds").
- **#3 Kiko Perspective** — an occasional reframe ("you feel unproductive, but: 16 streams, 3
  uploads this month"). A small generator that contrasts perceived vs actual from real counts.

All three obey the existing rules: real data, explain cause + why it matters, no generic
positivity, no medical diagnosis, don't repeat the same line daily.

---

## 3. The page redesigns (ideas #4, #5, Care) — large, and they *consume* the foundation

These are big standalone projects. Each becomes much simpler once §1–2 exist, because the memory/
media/search/insight pieces are already provided:

- **#4 Digital Hobonichi Journal** — A5 voice-first canvas, month colour themes, scrapbook
  drawers, auto-save, Kiko auto-detect + Day-At-A-Glance, memory cards. (Memory cards, search,
  capsules, quotes all come from §1; auto-detect/insights from §2.)
- **#5 Kiko Food Assistant** — voice/photo-first logging, protein/fiber focus, meal memory, smart
  pantry, shopping list, lazy/fridge modes, food↔health "Kiko noticed." (Reuses §2 + the existing
  food agent.)
- **Care redesign** — comfort/memories/bunny hub, gentle plan, memory pull, tiny-wins jar.
  (Almost entirely §1 views: memory pull, bunny timeline, tiny wins = `memories` filters.)

---

## 4. Recommended build order

1. **Foundation (§1):** media library + memory index + Favorites/Pinning + global Search
   (text + semantic) + Timeline + Bunny timeline. Mostly additive data + a few views → low risk,
   unlocks everything, and immediately stops memories getting lost.
2. **Intelligence (§2):** Health Interpreter, wider Insights, Perspective.
3. **Page redesigns (§3):** Journal → Food → Care (each its own milestone), now plugged into 1–2.

This order means the "connect everything" promise is real from day one, and the giant page
redesigns ride on finished infrastructure instead of re-inventing memory/search per page.

---

## 5. Honest constraints

This is multi-milestone work — weeks, not one sitting — on a live app I currently can't compile-
test (your disk is full, so the sandbox won't start). To protect Mifu's daily-use app I'll build
in small, deployable, verify-after-each slices rather than one giant untested drop. Freeing some
disk space would also let me actually run the code before you ship it.
