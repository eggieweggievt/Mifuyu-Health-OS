# Transfer doc — improvements from Mifu's OS → port to Eggie OS 🦊❄️

Everything built in Mifu's OS that's generic enough to improve Eggie's, as copy-paste-style patches with search hints. Both OSes share the architecture (single `index.html`, `H` click-dispatch via `data-act`, `setSent`/`setToday` writing the sentinel `2000-01-01` config row + today's row, `render()` rebuild, modular widget grid). Rename fields/classes to Eggie's where they differ. Each section is independent — apply what's useful, skip the rest.

> **Scope note:** This deliberately omits things that originated in *your* OS and were ported *to* Mifu (voice/Teach examples, the agent token/parse fixes, linked task↔reminder, due dates, the iPad/mobile pass, the build stamp). Those you already have. What's below is net-new from Mifu's side.

---

## 1. Linear weight-trend card (replaces sparkline bars) + the "backwards labels" gotcha

**Why:** bars scaled from a non-zero min are unreadable, and corner min/max labels read as a (wrong) axis. A clean SVG line with **dates in the corners** and **low/high spelled out, centered** fixes both.

**The gotcha that cost two rounds:** if you put `low` in the bottom-left corner and `high` in the bottom-right, they sit under the *opposite* end of the line (the line peaks left, dips right), so users read them as flipped even though the math is right. **Only the dates belong in the corners** (they correctly follow the line's direction). Put low/high **centered, with words**.

```js
function cardWeightTrend(){
  const wl=(state.sentinel.weightLog||[]).slice().sort((a,b)=>a.date<b.date?-1:1).filter(x=>x.w!=null).slice(-26);
  const vals=wl.map(x=>x.w), unit=CONFIG.weightUnit||"kg";
  let body='<p class="soft" style="font-size:12px">No weigh-ins yet.</p>';
  if(vals.length===1){
    body=`<div style="text-align:center;padding:6px 0"><span class="bignum">${vals[0].toFixed(1)} ${unit}</span><div class="soft" style="font-size:11px;margin-top:2px">${fmtDate(wl[0].date)} · one more weigh-in and your line begins ❄️</div></div>`;
  } else if(vals.length>=2){
    const mn=Math.min(...vals), mx=Math.max(...vals), rng=Math.max(0.4,mx-mn);
    const W=280,H=72,pad=8,plotH=H-pad*2;
    const xs=i=>pad+i*(W-pad*2)/(vals.length-1);
    const ys=v=>pad+(mx-v)/rng*plotH;          // higher weight sits higher; the line dips as she loses
    const line=vals.map((v,i)=>`${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
    const area=`${pad.toFixed(1)},${(H-pad).toFixed(1)} ${line} ${(W-pad).toFixed(1)},${(H-pad).toFixed(1)}`;
    const dots=vals.map((v,i)=>`<circle cx="${xs(i).toFixed(1)}" cy="${ys(v).toFixed(1)}" r="${i===vals.length-1?3:1.5}" fill="${i===vals.length-1?'var(--sakura-deep)':'var(--peri)'}"/>`).join("");
    const cur=vals[vals.length-1], change=cur-vals[0];
    const chTxt=Math.abs(change)<0.05?"steady":(change<0?"↓ "+Math.abs(change).toFixed(1):"↑ "+change.toFixed(1))+" "+unit;
    body=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="66" preserveAspectRatio="none" style="display:block;overflow:visible">
        <polyline points="${area}" fill="rgba(255,158,216,.12)" stroke="none"/>
        <polyline points="${line}" fill="none" stroke="var(--peri)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        ${dots}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:3px"><span>${fmtDate(wl[0].date)}</span><span>${fmtDate(wl[wl.length-1].date)}</span></div>
      <div style="text-align:center;font-size:11px;margin-top:6px"><b style="font-size:14px">${cur.toFixed(1)} ${unit}</b> <span class="soft">now · ${chTxt}</span></div>
      <div style="text-align:center;font-size:10.5px;color:var(--muted);margin-top:2px">lowest ${mn.toFixed(1)} · highest ${mx.toFixed(1)} ${unit} over these weigh-ins</div>`;
  }
  const insight=healthInsight();   // §2
  return `<section class="panel">
    <div class="card-head"><span class="label">Weight trend</span><button class="btn" data-act="tab" data-tab="trends">open →</button></div>
    ${body}
    ${insight?`<p class="soft" style="font-size:11.5px;margin-top:8px;line-height:1.5;background:rgba(201,184,240,.14);border-radius:10px;padding:8px 10px">🦊 ${insight}</p>`:''}
  </section>`;
}
```

---

## 2. `healthInsight()` — a data-linking, motivating one-liner

**Why:** ties hydration / muscle / fat / weight to *how the user feels*, and cheers them on. Rotates daily so it stays fresh. Adapt the fields to whatever Eggie tracks (hydration, energy, etc.).

```js
function healthInsight(){
  const wl=(state.sentinel.weightLog||[]).filter(x=>x).slice().sort((a,b)=>a.date<b.date?-1:1);
  if(wl.length<2) return "";
  const unit=CONFIG.weightUnit||"kg";
  const pair=k=>{ const a=wl.filter(x=>x[k]!=null); return a.length>=2?[a[a.length-2],a[a.length-1]]:null; };
  const msgs=[];
  const w=pair("water"); if(w&&w[1].water<w[0].water-0.3) msgs.push("Your hydration dipped since your last reading 💧 — feeling lower-energy today would make total sense. A glass of water (and maybe a salty snack) could help. ❄️");
  const f=pair("fat"), mu=pair("muscle");
  if((f&&f[1].fat<f[0].fat-0.2)||(mu&&mu[1].muscle>mu[0].muscle+0.1)) msgs.push("Muscle and fat naturally wobble day to day, but yours are clearly heading the right direction 💪✨ — keep going.");
  const ws=wl.filter(x=>x.w!=null);
  if(ws.length>=2){ const ch=ws[ws.length-1].w-ws[0].w; if(ch<=-0.5) msgs.push(`Down ${Math.abs(ch).toFixed(1)} ${unit} since you started tracking — slow and steady. 🌱`); else if(ch>=0.8) msgs.push("A small up-tick lately — totally normal (water, hormones, the day). The line over weeks is what matters. 💗"); }
  if(!msgs.length) return "Every weigh-in is just one dot — the line across the weeks is the real story. 💗";
  return msgs[parseInt(TODAY.replace(/-/g,""),10)%msgs.length];   // rotate daily
}
```

---

## 3. Merge two graph-heavy tabs into one (Weight → under Trends)

**Why:** graphs belong together. Pattern: keep both view functions, append one under the other in a single tab, drop the now-defunct tab, and redirect any old links.

- In the host view, append the other view minus its trailing disclaimer:
  ```js
  // end of viewTrends(), before the final disclaimer:
  `<div style="text-align:center;margin:18px 0 4px"><span class="label" style="letter-spacing:.08em">⚖️ &nbsp;weight &amp; body&nbsp;⚖️</span></div>
   ${viewWeight().split(DISCLAIMER)[0]}`
  ```
  (`split(DISCLAIMER)[0]` is a clean way to embed one view inside another without a double disclaimer — handy generally.)
- Remove the tab from `TABS`.
- In the view dispatch map, **point the dead tab name at the merged view** so old deep-links/agent `navigate` calls still work: `weight:viewTrends`.
- Fix any card buttons: `data-tab="weight"` → `data-tab="trends"`.

Same trick merges two *form* tabs into a **two-column** layout (Mifu's PCOS+Mounjaro → one Health tab):
```css
.health-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;}
.health-col{display:flex;flex-direction:column;gap:16px;min-width:0;}
@media(max-width:860px){ .health-cols{grid-template-columns:1fr;} }
```
```js
function viewHealth(){
  return `<div class="health-cols">
    <div class="health-col">${viewPcos().split(DISCLAIMER)[0]}</div>
    <div class="health-col">${viewMj().split(DISCLAIMER)[0]}</div>
  </div>${DISCLAIMER}`;
}
```
Column placement = "side by side": top-of-left-column sits next to top-of-right-column. Use that to put two daily check-ins beside each other.

---

## 4. Daily habits + "dailies" checklists with a 7-day mini week-strip

**Why:** lightweight repeating checklists on Home, grouped by energy, editable, with a glanceable past-week trend. Mifu uses one for chores/habits and one for gacha-game dailies; Eggie could use habits + any recurring routine.

- **Storage:** the editable lists live on the sentinel (`habitsList`, `gachaList`); the daily checked-state lives on the *day* row (`today.habits = {id:true}`, `today.gacha = {id:true}`), so each day resets naturally and history is automatic.
- **Energy grouping:** each habit has `energy: "low"|"med"|"high"`, rendered under 🌙/🌤/🌞 headers.
- **Week-strip** (reads the last 7 day-rows from `state.range`):
  ```js
  function weekStrip(field,total){
    const byDate={}; (state.range||[]).forEach(r=>byDate[r.date]=r.notes); byDate[TODAY]=state.today;
    let bars=""; for(let i=6;i>=0;i--){ const d=dayAgo(-i); const checks=(byDate[d]&&byDate[d][field])||{}; const n=Object.values(checks).filter(Boolean).length;
      const pct=total?Math.min(1,n/total):0;
      bars+=`<div title="${fmtDate(d)} — ${n}/${total}" style="flex:1;border-radius:4px;height:${Math.max(10,Math.round(pct*100))}%;background:${pct>=1?'#9fdcc0':'var(--sakura)'};opacity:${(0.3+pct*0.7).toFixed(2)}"></div>`; }
    return `<div style="display:flex;gap:4px;align-items:flex-end;height:30px;margin-top:10px">${bars}</div>`;
  }
  ```
- A done-counter pill turns mint when the list is swept. Toggle handlers write to `today[field][id]`. The assistant can tick/add/remove items and report what's left (mirror the action types in both the prompt catalog and `execAgentAction`).

---

## 5. Per-week, fully independent schedule (no infinite repeat) + per-day suggestions

**Why:** a recurring weekly template that repeats forever is wrong for anything that changes week to week (streams, game updates). Mifu's model: **every week is its own plan, blank until filled.**

- **Storage:** `sentinel.schedWeeks = { "<MondayISO>": [slots] }`. No template. A week with no entry is blank. (Optional migration: the *current* week falls back to a legacy flat `schedule` array once, so existing data isn't lost.)
  ```js
  const DOW_ORDER=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  function mondayOf(d){ const x=new Date(d); const wd=(x.getDay()+6)%7; x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x; }
  function weekStartISO(off){ const d=mondayOf(new Date(TODAY+"T00:00")); d.setDate(d.getDate()+(off||0)*7); return d.toLocaleDateString("en-CA"); }
  function weekSlots(wkISO){ const sw=(state.sentinel.schedWeeks||{}); if(sw[wkISO]) return sw[wkISO];
    if(wkISO===weekStartISO(0)) return (state.sentinel.schedule||[]); return []; }
  function slotsForDate(d){ return weekSlots(mondayOf(d).toLocaleDateString("en-CA")); }
  async function setWeekSlots(wkISO,fn){
    await setSent(n=>{ const sw={...(n.schedWeeks||{})};
      const base = sw[wkISO] ? sw[wkISO].slice() : (wkISO===weekStartISO(0) ? (n.schedule||[]).slice() : []);
      sw[wkISO]=fn(base); return {...n,schedWeeks:sw}; });
  }
  ```
- **UI:** `state.schedWeekOff` (0 = this week) with `‹ This week ›` nav. Flipping weeks shows a fresh blank schedule + freshly-computed ideas. The calendar renders streams via `slotsForDate(d)` so each week reflects its own plan.

**Per-day suggestion chips — the important rule:** *only assert a date you actually know.* Mifu's bug was generating "New [game] Update" on arbitrary days, implying release dates that were wrong. Fix:
```js
function streamSuggestions(wkISO){
  const sent=state.sentinel||{}; const games=(sent.gameTopics&&sent.gameTopics.length)?sent.gameTopics:DEFAULT_GAMES;
  const start=new Date(wkISO+"T00:00"); const byDay={};
  // REAL dated items come ONLY from the calendar layer (web-search populated) → land on the correct day, marked 🎮
  (sent.calendarEvents||[]).filter(gameSrc).forEach(ev=>{ const d=new Date(ev.date+"T00:00"); const diff=Math.round((d-start)/86400000);
    if(diff>=0&&diff<7){ const wd=DOW_ORDER[(d.getDay()+6)%7]; if(!byDay[wd]) byDay[wd]=ev.title; } });
  // filler days get date-AGNOSTIC activity ideas, never a fake "update"/"event start"
  const ideas=(g,i)=>[`Cozy ${g} stream`,`${g} grind session`,`Just chatting + ${g}`,`Variety stream`][i%4];
  return DOW_ORDER.map((wd,i)=>({day:wd, text:byDay[wd]||ideas(games[i%games.length],i), real:!!byDay[wd]}));
}
```
Render `real` chips with a 🎮 + a note "🎮 = real dated item from your calendar; the rest are just ideas." Generalizes to any "suggest something for each day" feature.

---

## 6. Display-unit vs storage-unit decoupling (water in 40oz cups)

**Why:** the user wants a custom display unit (full 40oz cups) while the data layer and trend charts want a stable base unit. Keep storing the base unit; convert only at the edges.

```js
const CUPS_PER_40OZ=5;                         // store 8oz cups internally; show 40oz cups
function waterCups(){ return (state.today&&state.today.mounjaro&&state.today.mounjaro.water)||0; }
function water40(){ return waterCups()/CUPS_PER_40OZ; }
// stepper handler: ±1 display cup = ±5 stored cups
async waterCup(el){ const d=Number(el.dataset.v)*CUPS_PER_40OZ;
  await setToday(n=>{ const m={...(n.mounjaro||{})}; m.water=Math.max(0,(m.water||0)+d); return {...n,mounjaro:m}; }); render(); }
```
Display `water40() % 1 ? .toFixed(1) : whole`. Because storage stays in the base unit, **trends and the assistant need zero changes** — only bump the trend metric's max if the new unit implies a higher daily total. General lesson: never bake a display unit into stored data.

---

## 7. One field, two entry points + cross-page linked check-offs

**Why:** Mifu wanted water editable on two pages, and a "Meds AM/PM" pair on the Food page that also satisfies the single "meds" habit on Home. Pattern: pick one source-of-truth field, let multiple UIs read/write it, and sync derived state in the handler.

```js
// AM/PM both ticked ⇒ the Home daily-habit "meds" auto-completes
async medToggle(el){ const part=el.dataset.v;   // 'am' | 'pm'
  await setToday(n=>{ const meds={...(n.meds||{})}; meds[part]=!meds[part];
    const habits={...(n.habits||{})}; habits.h_meds=!!(meds.am&&meds.pm);
    return {...n,meds,habits}; }); render(); }
// and the reverse: toggling the Home habit fills/clears both AM+PM
async habitToggle(el){ const id=el.dataset.v;
  await setToday(n=>{ const habits={...(n.habits||{})}; const nv=!habits[id]; habits[id]=nv;
    const ex={}; if(id==="h_meds") ex.meds={am:nv,pm:nv};
    return {...n,habits,...ex}; }); render(); }
```
Keeps two surfaces in lockstep without duplicating data.

---

## 8. Consolidated daily-tracking card that feeds the trend charts

**Why:** stop bouncing between tabs to check things off. Mifu's Health tab has one "How's today feeling?" card with every metric that the Trends chart reads (Mood, Anxiety, Energy, Nausea, Cravings, Water, Sleep), each writing the exact field `buildSeries()` pulls from. Mixed input styles in one card:

- `scaleRow(label, act, field, val, loLabel, hiLabel)` for 0–5 scales (Energy "low→high", Anxiety "calm→stressed", etc.)
- a `+/−` stepper for counts/hours (water cups, sleep hrs)

The win is alignment: if a metric appears on a trend chart, surface a one-tap input for it in a single daily card, writing the *same* field the series reader uses. No new storage, charts just light up.

---

## 9. "This week" history card (meals + a metric over time)

**Why:** turn the per-day rows you already store into a glanceable week. Mifu's Food tab shows protein & fibre bars per day for the last 7 days vs targets, with expandable per-day item lists and a per-logged-day average.

```js
function foodHistory(days){
  const byDate={}; (state.range||[]).forEach(r=>byDate[r.date]=r.notes); byDate[TODAY]=state.today;
  const out=[]; for(let i=days-1;i>=0;i--){ const dd=dayAgo(-i); const f=(byDate[dd]&&byDate[dd].food)||[];
    const tot=f.reduce((a,x)=>({protein:a.protein+(+x.protein||0),fiber:a.fiber+(+x.fiber||0),kcal:a.kcal+(+x.kcal||0)}),{protein:0,fiber:0,kcal:0});
    out.push({date:dd, meals:f, ...tot}); } return out;
}
```
Render two stacked `.bar`s per day (each scaled to `max(target, observed)`), `<details>` for the day's items. Generalizes to any "show the last 7 days of X" panel — it only reads `state.range` (the day rows you already cache).

---

## Quick port checklist
1. Linear weight card + the **dates-in-corners / low-high-centered** label rule (§1).
2. `healthInsight()` data-linking nudge (§2).
3. Merge graph tabs (`split(DISCLAIMER)[0]` embed) + two-column form-tab pattern, with dead-tab → merged-view redirect (§3).
4. Habits/dailies checklists with energy groups + `weekStrip()` (§4).
5. Per-week independent schedule + **only-real-dates** suggestion rule (§5).
6. Display-unit vs storage-unit decoupling (§6).
7. One-field/two-entry-points + linked check-offs sync (§7).
8. Consolidated daily-tracking card writing the exact `buildSeries()` fields (§8).
9. "This week" history card from `state.range` (§9).

All front-end (`index.html`) — no Edge Function changes needed for any of the above. Commit + push.
