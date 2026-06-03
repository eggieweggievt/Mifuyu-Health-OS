# The AI assistant ("Kiko") + "Ask Kiko" tab — transfer doc (port to any single-file OS)

**Purpose:** paste this into a fresh Claude chat that's building/extending a personal "OS" web app so it can drop in the same **agentic AI companion** — a floating chat bubble *and* a full "Ask [Name]" home-base tab — that can **chat, take actions in the app, log things from photos, search the web, and run guided wizards**. It's a single-file vanilla-JS front-end + one Edge Function mode. No frameworks.

This is written so another Claude can adapt it to *its* host app. Wherever you see `SB`, `DB`, `state`, `render()`, `setSent()`, `$()`, treat them as the host app's existing primitives (described in §1). Swap the persona/name/colours in §8.

---

## 0. What you get
- A **floating chat bubble** (a little assistant you tap to chat), and a **maximize ⤢** that opens a full **"Ask [Name]"** tab — the assistant's home base with a row of one-tap **skills**, the full conversation, and a "what you can ask" guide. **Minimize** returns to the previous tab. Both share one conversation + photo queue.
- The assistant is **agentic**: you say "add a stream Saturday 7pm" / "log my mood as 4" / "log lunch: chicken & rice" and it actually performs the action in the app and confirms it.
- **Photo logging**: attach one or several photos (📷, multi-select) — the assistant runs them through a vision model and logs the result (built for food → macros, but the pattern is general).
- **Web search**: the agent can search the internet when it helps (current info, dates, facts) and weave it into its reply/actions.
- **Plain-text replies** (no Markdown clutter), with emojis.
- A reusable **scripted-wizard** pattern (journaling, tax-prep, onboarding…) that runs inside the chat with no AI cost.

## 1. Host-app assumptions (the primitives this plugs into)
This expects a single-file SPA shaped like:
- `state` — a global object; `state.tab` is the current tab; `render()` rebuilds `#view` for the current tab.
- `TABS` — array of `[id, label]`; a dispatch map `{id: viewFn}` in `render()`.
- A global **click delegator**: `document.addEventListener("click", e => { const el=e.target.closest("[data-act]"); if(el) H[el.dataset.act](el); })` — so buttons use `data-act="handlerName"` and handlers live on an object `H`.
- A global **change delegator** for file inputs (used by photo upload).
- `DB.saveDaily(key, mergeFn)` persists a JSON blob (e.g. a Supabase row's `notes`); `setSent(mergeFn)` is a convenience that does `state.sentinel = await DB.saveDaily(SENTINEL, mergeFn)`. Demo mode falls back to memory.
- `SB` is the backend client (null in demo); `aiCall(mode, input)` invokes the Edge Function (below). `DEMO` is true when no backend.
- `$ = sel => document.querySelector(sel)`, `esc()` HTML-escapes, `toast()` shows a transient message.
- A floating element `<div id="[name]Chat" class="hidden"></div>` exists in the static HTML (the bubble's panel). 🔒 It must be a **static element outside `#view`** so it persists across tab renders.

If the host app differs, map these names — the logic is what matters.

---

## 2. PART A — The Edge Function `agent` mode (the brain)

The AI lives **server-side** (an Edge Function / your API), never in the browser. Add an `agent` mode alongside your other modes. It returns **strict JSON** `{reply, actions[]}` and may call **web search**.

🔒 The API key is a server secret — never in the client.

### 2a. A tools-enabled model call (for web search)
```ts
// custom system + user, optional server-side tools (e.g. web search). Returns joined text blocks.
async function claudeWithTools(system, user, maxTokens = 1500, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: user }], ...(tools && tools.length ? { tools } : {}) }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "AI error");
  return (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");   // ignore tool_use / search-result blocks
}
function parseJSON(t){ try{ return JSON.parse(t); }catch(_){} const a=t.indexOf("{"),b=t.lastIndexOf("}"); if(a>=0&&b>a){ try{ return JSON.parse(t.slice(a,b+1)); }catch(_){} } return null; }
```

### 2b. The agent system prompt (the contract)
```ts
const AGENT_SYSTEM = `You are [NAME], <persona — e.g. a cozy snowfox companion> living inside her personal app "[APP NAME]". You are <tone words>. You both CHAT and PERFORM ACTIONS in her app on her behalf.

You manage: <list the app's domains>. <Any safety lines — e.g. "you are not a doctor; never invent numbers; just log what she says.">

Write your "reply" in PLAIN TEXT only — no Markdown, no asterisks, no headers, no bullet syntax. Just normal sentences. Emojis are welcome. Keep it short and warm.

Return ONLY a JSON object, no prose outside it:
{ "reply": "<a short, warm PLAIN-TEXT message>", "actions": [ <zero or more action objects> ] }

Allowed action objects (use ONLY these shapes; include just the fields you need):
- {"type":"navigate","tab":"<one of the tab ids>"}
- {"type":"addEvent","title":"...","date":"YYYY-MM-DD","endDate":"YYYY-MM-DD or null","time":"HH:MM or empty","tz":"IANA zone","note":"","url":""}
- {"type":"addTask","text":"...", ...}
   ... ONE line per action your app supports — name + exact field shapes ...

You can SEARCH THE WEB when it helps — current info, dates, facts, prices, anything time-sensitive or that you don't reliably know. Weave findings into your reply (and an action if relevant). Don't search for simple chit-chat.

Rules:
- Compute dates relative to TODAY and her timezone (given below). "tomorrow"/"next friday" → real YYYY-MM-DD.
- Only include actions she clearly asked for. If she's just chatting/asking, use "actions":[] and answer in "reply".
- If ambiguous, make a sensible guess and say so. Always include a brief warm "reply".
- CRITICAL: after any web search, your FINAL output must be ONLY the JSON object.`;
```
🔒 **The action list in the prompt must mirror exactly what your executor (§3b) handles** — same `type` names and field shapes. Keep them in sync; that's the #1 source of bugs.

### 2c. The agent function + router
```ts
async function agent(input) {
  const today = input.today || "", tz = input.tz || "UTC", tab = input.tab || "home";
  // Pass any context the agent should "see" (current schedule, upcoming events, check-in numbers…)
  const user = `TODAY is ${today} (timezone ${tz}). Current tab "${tab}".\n`
    + `<...serialize relevant context here...>\n\n`
    + `She said: "${(input.question || "").slice(0, 1500)}"`;
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
  let text;
  try { text = await claudeWithTools(AGENT_SYSTEM, user, 1500, tools); }
  catch (_e) { text = await claudeWithTools(AGENT_SYSTEM, user, 1200); }   // graceful fallback if web search unavailable
  const out = parseJSON(text) || {};
  if (!Array.isArray(out.actions)) out.actions = [];
  if (!out.reply) out.reply = "okay! ❄️";
  return out;
}
// in your request router:  if (mode === "agent") return json(await agent(input));
```

### 2d. (Optional) vision mode for photo logging
```ts
async function claudeMsg(system, content, maxTokens=900){ /* same as claudeWithTools but messages:[{role:"user",content}] and no tools */ }

async function foodMode(input){            // rename for your domain
  const desc=(input.description||"").slice(0,600);
  const imgs = Array.isArray(input.images)?input.images:(input.image?[input.image]:[]);
  const content=[];
  imgs.slice(0,8).forEach(im=>{ const m=String(im).match(/^data:(image\/\w+);base64,(.*)$/); if(m) content.push({type:"image",source:{type:"base64",media_type:m[1],data:m[2]}}); });
  if(!content.length && !desc) return {error:"Add a photo or a description first."};
  const multi = imgs.length>1;
  content.push({type:"text", text: multi
    ? `These are ${imgs.length} photos${desc?` — note: "${desc}"`:""}. Identify EACH item and return ONLY JSON { "items":[ {...per item...} ] }`
    : `Estimate from this. ${desc?'Note: "'+desc+'"':""} Return ONLY the JSON {...}`});
  const out = parseJSON(await claudeMsg(VISION_SYSTEM, content, multi?1400:700));
  return multi ? { items:(out&&out.items||[]).map(normalize) } : normalize(out||{});
}
```
🔒 The host sends **data-URL** images (`data:image/jpeg;base64,…`); downscale them client-side first (§4d).

---

## 3. PART B1 — The chat + actions (client)

### 3a. State + the assistant call
```js
const KIKO = { open:false, busy:false, log:[], journal:null, tax:null, pendingImages:[] };
function kikoInputEl(){ return document.getElementById("kikoTabInput") || document.getElementById("kikoInput"); }   // tab input wins if present
function stripMd(t){ return String(t==null?"":t)
  .replace(/```+/g,"").replace(/(\*\*\*|___)(.*?)\1/g,"$2").replace(/(\*\*|__)(.*?)\1/g,"$2").replace(/(\*|_)(.*?)\1/g,"$2")
  .replace(/~~(.*?)~~/g,"$1").replace(/`([^`]+)`/g,"$1").replace(/^\s{0,3}#{1,6}\s+/gm,"").replace(/^\s{0,3}>\s?/gm,"")
  .replace(/^\s{0,3}[-*+]\s+/gm,"• ").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").trim(); }   // belt-and-suspenders plain text
```

### 3b. The send handler (agent turn + execute + photos + wizards)
```js
H.kikoSend = async function(){
  const inp=kikoInputEl(); const q=(inp?inp.value:"").trim(); const imgs=(KIKO.pendingImages||[]).slice();
  if((!q && !imgs.length)||KIKO.busy) return;
  KIKO.log.push({role:"me", text: imgs.length?("📷 "+(q||"")).trim():q});
  if(KIKO.journal && KIKO.journal.active){ KIKO.pendingImages=[]; paintKiko(); return H.kikoJournalReply(q||"(sent a photo)"); }  // scripted flow intercepts
  if(KIKO.tax && KIKO.tax.active){ KIKO.pendingImages=[]; paintKiko(); return H.kikoTaxReply(q||"(noted)"); }
  if(imgs.length){ KIKO.pendingImages=[]; return H.kikoFoodPhoto(q,imgs); }   // photos → vision + log
  KIKO.busy=true; paintKiko();
  let ans, didActions=false;
  try{
    if(DEMO || !SB){ ans="I'm a sleepy demo right now 💤 — connect me to the server to chat & run things!"; }
    else {
      const d = await aiCall("agent", { question:q, today:TODAY, tz:TZ, tab:state.tab, /* + any context */ });
      if(d&&d.error) throw new Error(d.error);
      ans = (d&&(d.reply||d.answer)) || "hmm, ask me again? 🦊";
      const done=[];
      for(const a of (d&&Array.isArray(d.actions)?d.actions:[])){ const r=await execAgentAction(a); if(r) done.push(r); }
      if(done.length){ didActions=true; ans += "\n\n"+done.map(x=>"✓ "+x).join("\n"); }   // show what it did
    }
  }catch(e){ ans="aw, I couldn't reach the server — "+(e.message||"try again")+" 🌧️"; }
  KIKO.log.push({role:"pet", text:ans}); KIKO.busy=false;
  if(didActions){ try{ await loadData(); await render(); }catch(_){} }   // re-pull so the app reflects the writes
  paintKiko();
};
```

### 3c. The action executor — the heart of "it can control the OS"
One function maps each action `type` to a real write through the host app's persistence. **Every `type` here must exist in the prompt (§2b).** Each returns a short human summary (or `null`).
```js
async function execAgentAction(a){
  if(!a||!a.type) return null; const T=a.type;
  try{
    if(T==="navigate"){ if(TABS.some(t=>t[0]===a.tab)) state.tab=a.tab; return "opened "+a.tab; }
    if(T==="addEvent"){ const ev={id:uid(),title:a.title||"event",date:a.date||TODAY,endDate:(a.endDate&&a.endDate>(a.date||TODAY))?a.endDate:null,time:a.time||"",tz:a.tz||TZ,note:a.note||"",url:a.url||""};
      await DB.saveDaily(SENTINEL,n=>({...n,calendarEvents:[...(n.calendarEvents||[]),ev]})); return "📅 added “"+ev.title+"”"; }
    if(T==="addTask"){ await setSent(n=>({...n,tasks:[...(n.tasks||[]),{id:"t"+Date.now(),text:a.text}]})); return "🗒️ "+a.text; }
    // …one branch per action. Validate/clamp inputs. Never trust the model blindly with numbers/ranges.
  }catch(e){ console.error("action failed",T,e); return null; }
  return null;
}
```
🔒 Match each write to your real data shapes (verify against an existing handler), validate/clamp (`Math.max/min`, `isNaN`), and keep them idempotent-ish. The `loadData()+render()` after the loop is what makes the change appear.

---

## 4. PART B2 — The UI (floating bubble + full tab)

### 4a. Shared chat body (used by BOTH the bubble and the tab)
```js
function kikoLogHTML(){ return KIKO.log.length
  ? KIKO.log.map(m=>`<div class="kiko-msg ${m.role}">${esc(m.role==='pet'?stripMd(m.text):m.text)}</div>`).join("")
  : `<div class="kiko-msg pet">Konfuyu~! I'm [Name] 🦊 Tell me to do things, tap 📷 to send photos, or just chat. ❄️</div>`; }
function kikoChatInner(inputId, fileId, logId){
  return `<div class="kiko-log" id="${logId}">${kikoLogHTML()}${KIKO.busy?`<div class="kiko-msg pet">…thinking ❄️</div>`:""}</div>
    ${KIKO.pendingImages.length?`<div class="kiko-imgrow">${KIKO.pendingImages.map((im,i)=>`<span class="thumb"><img src="${im}"><button class="x" data-act="kikoClearImg" data-i="${i}">✕</button></span>`).join("")}<span class="soft">${KIKO.pendingImages.length} photo(s) ready 🍽️</span></div>`:""}
    <div class="kiko-input">
      <label class="btn" style="cursor:pointer">📷<input type="file" id="${fileId}" accept="image/*" multiple style="display:none" ${KIKO.busy?"disabled":""}></label>
      <input class="inp" id="${inputId}" placeholder="${KIKO.pendingImages.length?'what are they? (optional)':'tell me to do something…'}" ${KIKO.busy?"disabled":""}>
      <button class="btn btn-grad" data-act="kikoSend" ${KIKO.busy?"disabled":""}>send</button>
    </div>`;
}
function paintKiko(){
  const c=$("#kikoChat");
  if(c){ c.innerHTML=`<div class="kiko-head">…avatar…name…<button class="x" data-act="kikoMaximize" title="open Ask [Name]">⤢</button><button class="x" data-act="kikoToggle">✕</button></div>${kikoChatInner("kikoInput","kikoFile","kikoLog")}`; }
  const tc=$("#kikoTabChat"); if(tc){ tc.innerHTML=kikoChatInner("kikoTabInput","kikoTabFile","kikoTabLog"); }   // the tab copy
  const a=$("#kikoLog"), b=$("#kikoTabLog"); if(a)a.scrollTop=a.scrollHeight; if(b)b.scrollTop=b.scrollHeight;
  const inp=kikoInputEl(); if(inp&&!KIKO.busy) try{ inp.focus(); }catch(_){}
}
```
🔒 The bubble (`#kikoChat`) and the tab (`#kikoTabChat`) use **different element ids** for their input/file/log so there are no duplicate IDs. `kikoInputEl()` prefers the tab's input when it exists. Both read/write the same `KIKO.log`, so the conversation is continuous as you move between them.

### 4b. The "Ask [Name]" tab + skills grid + maximize/minimize
```js
function viewKiko(){
  const skills=[ ["🌤️","Log mood","seed","log my mood as "], ["📅","Add event","seed","add an event: "],
    ["📓","Daily journal","act","startKikoJournal"], ["🔎","What's coming up","send","what's on my schedule coming up?"],
    ["🌐","Search the web","seed","search the web for "] /* …your skills… */ ];
  const chip=(e,l,kind,val)=> kind==="act"
    ? `<button class="kiko-skill" data-act="${val}">${e} ${l}</button>`
    : `<button class="kiko-skill" data-act="kikoSkill" data-${kind}="${esc(val)}">${e} ${l}</button>`;
  return `<div style="max-width:920px;margin:0 auto">
    <div class="card-head"><h2>🦊 Ask [Name]</h2><button class="btn" data-act="kikoMinimize">－ minimize</button></div>
    <section class="panel"><div class="label">✨ Quick skills</div><div class="kiko-skills">${skills.map(s=>chip(s[0],s[1],s[2],s[3])).join("")}</div></section>
    <section class="panel"><div id="kikoTabChat" class="kiko-tabchat"></div></section>
    <details class="acc"><summary>💬 What you can ask</summary><div class="acc-body"><!-- a friendly capabilities list --></div></details>
  </div>`;
}
H.kikoMaximize = function(){ state.kikoReturn=(state.tab==="kiko")?(state.kikoReturn||"home"):state.tab; KIKO.open=false; $("#kikoChat").classList.add("hidden"); setTab("kiko"); };
H.kikoMinimize = function(){ setTab(state.kikoReturn||"home"); };
H.kikoSkill = function(el){ const inp=kikoInputEl(); if(!inp)return; if(el.dataset.send!=null){ inp.value=el.dataset.send; H.kikoSend(); } else { inp.value=el.dataset.seed||""; inp.focus(); } };
H.kikoToggle = function(){ if(state.tab==="kiko"){ kikoInputEl()?.focus(); return; }   // already in home base
  KIKO.open=!KIKO.open; const c=$("#kikoChat"); c.classList.toggle("hidden",!KIKO.open); if(KIKO.open) paintKiko(); };
// register tab: add ["kiko","🦊 Ask [Name]"] to TABS and {kiko:viewKiko} to the dispatch map.
// in render(), after building the view:  if(state.tab==='kiko'){ KIKO.open=false; $("#kikoChat")?.classList.add("hidden"); paintKiko(); }
```
**Skill behaviours:** `data-send="…"` fills the input and sends immediately (great for questions); `data-seed="…"` pre-fills and focuses so she completes it; `kind==="act"` runs a handler directly (e.g. a wizard).

### 4c. Multi-photo upload (in the global `change` delegator)
```js
if(t.id==="kikoFile"||t.id==="kikoTabFile"){
  const files=t.files?[...t.files]:[]; if(!files.length) return;
  const keep=(kikoInputEl()||{}).value||"";
  files.slice(0,8).forEach(f=>{ const r=new FileReader(); r.onload=()=>{ const img=new Image(); img.onload=()=>{
    const max=1024; let w=img.width,h=img.height; const s=Math.min(1,max/Math.max(w,h)); w=Math.round(w*s); h=Math.round(h*s);
    const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h);
    try{ KIKO.pendingImages.push(c.toDataURL("image/jpeg",0.82)); }catch(e){ KIKO.pendingImages.push(r.result); }   // downscale → small payload
    paintKiko(); const ni=kikoInputEl(); if(ni&&keep) ni.value=keep;
  }; img.onerror=()=>{ KIKO.pendingImages.push(r.result); paintKiko(); }; img.src=r.result; }; r.readAsDataURL(f); });
  t.value="";   // allow re-selecting the same file
}
H.kikoClearImg = function(el){ const i=el&&el.dataset.i!=null?+el.dataset.i:-1; if(i>=0) KIKO.pendingImages.splice(i,1); else KIKO.pendingImages=[]; paintKiko(); };
```

### 4d. Photo handler (vision → log)
```js
H.kikoFoodPhoto = async function(desc, imgs){
  if(DEMO||!SB){ KIKO.log.push({role:"pet",text:"I can look at your photos once connected 💤"}); paintKiko(); return; }
  KIKO.busy=true; paintKiko();
  try{ const r=await aiCall("food",{images:imgs, description:desc||""});
    if(r&&r.error){ KIKO.log.push({role:"pet",text:"I couldn't read those — tell me what they are? 🌧️"}); }
    else { const items=Array.isArray(r.items)?r.items:[r]; const done=[];
      for(const it of items){ if(!it||it.kcal==null)continue; const item={id:"fd"+Date.now()+Math.floor(Math.random()*1e3),...it,time:new Date().toISOString()};
        await setToday(n=>({...n,food:[...(n.food||[]),item]})); done.push(item); }
      KIKO.log.push({role:"pet",text: done.length>1 ? `logged ${done.length} items 🍽️ …`: `logged ${done[0]?.name} 🍽️ …`}); }
  }catch(e){ KIKO.log.push({role:"pet",text:"that didn't go through — try again? 🌧️"}); }
  KIKO.busy=false; if(state.tab==='food'){ try{ await render(); }catch(_){} } paintKiko();
};
```

---

## 5. PART B3 — Scripted wizards (no AI cost; runs inside the chat)
Great for journaling, tax-prep, onboarding — a fixed list of steps the assistant walks through. Pattern:
```js
const STEPS=[ "First question…", "Second…", /* … */ ];
H.startWizard = function(){ KIKO.wiz={active:true,step:0,log:[]}; if(state.tab!=="kiko") H.openKikoChatPanel();
  KIKO.log.push({role:"pet",text:"intro line"}); KIKO.log.push({role:"pet",text:STEPS[0]}); KIKO.wiz.log.push({who:"Name",text:STEPS[0]}); paintKiko(); };
H.kikoWizReply = async function(ans){ const J=KIKO.wiz; J.log.push({who:"User",text:ans});
  if(/^(stop|cancel|done)$/i.test(ans)){ J.active=false; KIKO.log.push({role:"pet",text:"okay, anytime 💗"}); paintKiko(); return; }
  J.items=(J.items||[]).concat([{q:STEPS[J.step],a:ans}]); J.step++;
  if(J.step<STEPS.length){ KIKO.log.push({role:"pet",text:"got it ✓"}); KIKO.log.push({role:"pet",text:STEPS[J.step]}); paintKiko(); return; }
  J.active=false; KIKO.log.push({role:"pet",text:"all done! 🎉"}); paintKiko(); await saveWizard(J); };   // persist J.items
// route it in kikoSend (top): if(KIKO.wiz && KIKO.wiz.active) return H.kikoWizReply(q);
```
Optionally end the wizard by calling the AI once to *write up* the answers (a "compose" mode) — same idea as a `journalWrite` mode.

---

## 6. CSS (minimal, re-skin freely)
```css
.kiko-msg{font-size:12.5px;line-height:1.45;padding:8px 11px;border-radius:14px;max-width:86%;white-space:pre-wrap;word-break:break-word;}
.kiko-msg.me{align-self:flex-end;background:linear-gradient(135deg,var(--accent1),var(--accent2));color:#fff;}
.kiko-msg.pet{align-self:flex-start;background:var(--panel-soft);border:1px solid var(--line);}
.kiko-log{display:flex;flex-direction:column;gap:8px;overflow:auto;padding:10px;}
.kiko-input{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line);}
.kiko-skills{display:flex;flex-wrap:wrap;gap:8px;}
.kiko-skill{border:1.5px solid var(--line);border-radius:999px;background:#fff;font-size:13px;padding:8px 13px;cursor:pointer;}
.kiko-skill:hover{background:var(--accent-soft);}
.kiko-tabchat{display:flex;flex-direction:column;}
.kiko-tabchat .kiko-log{height:50vh;min-height:300px;}
.kiko-imgrow{padding:8px 10px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.kiko-imgrow .thumb{position:relative;display:inline-block;}
.kiko-imgrow img{width:50px;height:50px;object-fit:cover;border-radius:8px;border:1px solid var(--line);}
.kiko-imgrow .x{position:absolute;top:-7px;right:-7px;background:#fff;border:1px solid var(--line);border-radius:50%;width:19px;height:19px;font-size:11px;}
```

## 7. Wiring checklist
1. **Edge Function:** add `claudeWithTools` + `agent` (and optional vision `food` + a compose mode). Add router lines. Deploy with your existing secrets — no new keys in the client.
2. **Static HTML:** ensure `<div id="kikoChat" class="hidden"></div>` exists outside `#view` (plus your floating bubble element if you have one).
3. **TABS:** add `["kiko","🦊 Ask [Name]"]`; dispatch `{kiko:viewKiko}`; in `render()` add the kiko paint hook.
4. **State:** add the `KIKO` object.
5. **Handlers (on `H`):** `kikoSend, kikoToggle, kikoMaximize, kikoMinimize, kikoSkill, kikoClearImg, kikoFoodPhoto`, plus `execAgentAction`, `paintKiko`, `kikoChatInner`, `kikoLogHTML`, `kikoInputEl`, `stripMd`.
6. **Delegators:** make sure the global click handler dispatches `data-act`, and the change handler handles `kikoFile`/`kikoTabFile`.
7. **Greeting / persona / skills:** fill in §8.

## 8. ✏️ Re-skin for your OS
1. **Persona:** name, pronouns, emoji, tone, greeting — in `AGENT_SYSTEM` and the empty-log greeting.
2. **Actions:** delete every action you don't have; add yours. Keep the prompt list (§2b) and `execAgentAction` (§3c) **identical** in `type`s + fields.
3. **Context:** in `agent()`'s `user` string, pass whatever the assistant should "see" (today's data, schedule, upcoming items) so it answers/edits accurately.
4. **Skills:** build the `viewKiko` skill chips from your real handlers/prompts.
5. **Vision mode:** keep it for food, repurpose it (receipts, plants, outfits…), or drop it.
6. **Colours/CSS:** map `--accent1/2`, `--panel-soft`, `--line` to your palette.

## 9. 🔒 Non-negotiables
1. **API keys stay server-side.** The client only ever sends text/images and shows the returned JSON.
2. **Prompt actions ≡ executor actions.** Same names, same fields. Drift = silent no-ops.
3. **Plain-text replies:** instruct it in the prompt AND run `stripMd()` on rendered assistant messages — so stray Markdown never shows.
4. **Bubble vs tab share `KIKO.log`** but use **distinct element ids**; `kikoInputEl()` resolves the active one. The bubble panel must be a **static element outside `#view`**.
5. **After actions:** re-pull data + `render()` so the app reflects the writes (and entering the kiko tab closes the floating chat to avoid two chats).
6. **Downscale photos** (~1024px JPEG) before sending; support **multiple** images and a per-thumbnail remove.
7. **Web search:** enable the `web_search` tool but **always fall back** to a plain reply if it's unavailable, and demand the final output be the JSON object.
8. **Wizards intercept first** in `kikoSend` (before the AI path), and let "stop/cancel" exit gracefully.

That's the whole assistant: §2 (brain) + §3 (chat & actions) + §4 (bubble + tab UI) + §5 (wizards). Wire per §7, re-skin per §8, respect §9. 🦊❄️
