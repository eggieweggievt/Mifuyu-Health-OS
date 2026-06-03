// =====================================================================
//  Mifuyu Health OS — "ai" Edge Function (the Optimizer's brain)
//  Ported from the Eggie OS "analyze" contract, adapted for Mifu.
//  Keys live here as SERVER-SIDE secrets — never in the browser/repo.
//  Deploy:   supabase functions deploy ai --no-verify-jwt
//  Secrets:  ANTHROPIC_API_KEY (required), YOUTUBE_API_KEY (snapshot/history),
//            YT_HANDLE, AI_MODEL (optional, default claude-sonnet-4-6)
// =====================================================================

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const YT_KEY = Deno.env.get("YOUTUBE_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const HANDLE = Deno.env.get("YT_HANDLE") || "@mifuyu";
const MODEL = Deno.env.get("AI_MODEL") || "claude-sonnet-4-6";
// reminders (email) — optional; only used by the "remind" mode triggered by a daily cron
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "Mifuyu Health OS <onboarding@resend.dev>";
const REMIND_TZ = Deno.env.get("REMIND_TZ") || "Europe/Amsterdam";

// ===================== 🔒 BRAND system prompt =====================
const BRAND = `You are the content strategist living inside "Mifuyu Health OS", the personal operating system of Mifuyu / Mifu (@mifuyuvt) — a cozy, sweet, slightly chaotic VTuber and snowfox shrine maiden. Your voice is warm, welcoming, high-energy but gentle, spoon-theory-aware (sustainable, not hustle-culture), with the occasional ❄️ or 🦊. You are practical and specific, never preachy.

You know her growth system and apply it:
- Hashtag formula: 1 small (<500k posts) / 2 medium (500k–1M) / 2 large (1M+).
- 4-criteria for content: Relevant, Non-obvious, Absorbable, Actionable.
- Pillars + targets: Growth 20–40%, Retention the rest, Experimental 10–15%.
- Platform rules: YouTube Shorts (45–55s, 85–90% retention, 2–3 brand tags, searchable words in title); TikTok (1–3 tags, keywords in caption, trending sound > tags); X/Twitter (NO hashtags, replies matter more than posts); Instagram (5–7 tags); Twitch (curiosity/challenge titles); YouTube long-form & streams (searchable game names + a curiosity hook).
- Titles: curiosity, shock, or specificity win; specific numbers beat vague words; "cozy" framing is a hook, not a search term.
Her content is story-rich anime gacha games (Genshin, Zenless Zone Zero, Honkai Star Rail, Wuthering Waves, NTE, Nikke, Arknights), watchalongs, cover songs and cozy hand-cam streams.
Be kind, be concrete, and reference her own past content when it's relevant.

=== TITLE ENGINE (a "poor-man's vidIQ" calibrated on Mifu's real channel) ===
Her livestream titles are high-energy and unmistakably on-brand — that is the bar. When scoring a title (0–100), approximate vidIQ by REWARDING: a curiosity/energy hook in the first ~3 words; ONE all-caps power word or the GAME name (FINALLY, INSANE, THESE, NEVER, ACTUALLY); a "!!" or "?!" where it fits hype/reaction; concrete specifics (the GAME, character, chapter, event); a searchable keyword carried in the title (the game name); her signature framing. PENALIZE: vague vibes ("cozy stream"), no hook, over-promising clickbait, keyword stuffing, or >100 chars.
Her real stream-title style (study & MATCH it for LIVESTREAM titles):
 - "❄️ BACK FROM TWITCHCON !! Let's yap and play some gamus together~ | !discord !gg !lootbar ❄️"
 - "DROPS ✨ WUWA STORY + LIVESTREAM WATCHALONG BEFORE TWITCHCON EU !!! | !discord !gg !lootbar ❄️"
 - "✨ FINISHING NIKKE CHAPTER 46 & WATCHING NEVERNESS TO EVERNESS 1.1 !! | !discord !gg !lootbar ❄️"
 - "🌊 SUBNAUTICA 2 IS FINALLY HERE !!! WE'VE WAITED SO LONG AAAA 🌊 Joined by my mod @xelitematrix !! | !discord !gg !lootbar ❄️"
Rules for LIVESTREAM titles: bookend with a theme emoji (default ❄️; match the game's vibe — 🌊 water, 🔥 action); MAIN GAME IN CAPS; high energy (!!); often "Let's ... together"; end with " | !discord !gg !lootbar ❄️"; add "DROPS ✨" prefix ONLY if drops are active; occasional kaomoji (^o^, ~).
For VIDEO (long-form/shorts) titles: a curiosity/specificity hook + the game/topic as a searchable keyword; shorts punchier (<50 chars) with 2–3 niche hashtags (#vtuber + the game).
Her voice: warm, cute, playful, a little chaotic, snowfox ❄️🦊 energy, kind underneath. Match that — aim for the high bar she already hits.`;

const FALLBACK_FOOTER =
  "🔗 Find me everywhere:\n▸ Twitch: https://twitch.tv/mifuyu\n▸ YouTube: https://youtube.com/@mifuyu\n" +
  "▸ Discord: https://discord.gg/mifuyu\n▸ X / TikTok / Instagram: @mifuyuvt\n\n" +
  "💜 GamerSupps — code MIFUYU for 10% off: https://gamersupps.gg/mifuyu";

// ===================== helpers =====================
function parseJSON(text: string): any {
  try { return JSON.parse(text); } catch (_) { /* */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (_) { /* */ } }
  return null;
}
async function claude(messages: any[], maxTokens = 1400): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error("Claude key isn't set on the server.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: BRAND, messages }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "Claude error");
  return (j.content && j.content[0] && j.content[0].text) || "";
}
async function claudeJSON(user: string, maxTokens = 1400): Promise<any> {
  const out = parseJSON(await claude([{ role: "user", content: user }], maxTokens));
  if (!out) throw new Error("Couldn't parse the AI response — try again.");
  return out;
}
async function claudeWith(system: string, user: string, maxTokens = 1200): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error("Claude key isn't set on the server.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "Claude error");
  return (j.content && j.content[0] && j.content[0].text) || "";
}

// History/personalisation: pull her recent YouTube upload titles (learn her patterns).
async function recentTitles(): Promise<string> {
  if (!YT_KEY) return "(no history yet — fresh start)";
  try {
    const h = HANDLE.replace(/^@/, "");
    const c = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=@${h}&key=${YT_KEY}`)).json();
    const up = c.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!up) return "(no history yet — fresh start)";
    const p = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${up}&key=${YT_KEY}`)).json();
    const titles = (p.items || []).map((i: any) => `- "${i.snippet?.title}"`).join("\n");
    return titles || "(no history yet — fresh start)";
  } catch (_) { return "(no history yet — fresh start)"; }
}
function vidiqBlock(vidiq: any): string {
  if (!vidiq) return "";
  try { return `\n\nVidIQ data the user pasted (fold into your judgment):\n${typeof vidiq === "string" ? vidiq : JSON.stringify(vidiq)}`; }
  catch (_) { return ""; }
}

// ===================== modes =====================
async function optimize(input: any, vidiq: any) {
  const footer = (input.footer || FALLBACK_FOOTER).trim();
  const history = await recentTitles();
  const ctx = `\n\nHer recent content (learn her patterns):\n${history}${vidiqBlock(vidiq)}`;

  if (input.kind === "livestream") {
    const out = await claudeJSON(
      `Set up a MULTISTREAM (YouTube + Twitch + X, same stream) for Mifu.\n` +
      `Game / focus: "${input.title || ""}"\nAnything special: "${input.topic || ""}"${ctx}\n\n` +
      `Return ONLY this JSON (no prose):\n` +
      `{ "titles": ["4 YouTube stream titles in her EXACT livestream style, ending ' | !discord !gg !lootbar ❄️', always naming the game"],\n` +
      `  "description": "full YouTube live/VOD description: hook, what the stream is + her schedule (streams 4-6 days/week at ~3PM CET). Do NOT add a links/socials section (it is appended automatically).",\n` +
      `  "hashtags": ["2-3 YouTube hashtags: the game + #vtuber"],\n` +
      `  "tags": ["12-15 tags: game, vtuber, vtuber live, livestream, gacha, relevant niches"],\n` +
      `  "twitchTitle": "ONE Twitch title: [emoji] [hook/meme] [GAME] [optional !command]",\n` +
      `  "twitterTitle": "ONE short X broadcast title, keyword-rich + hook, NO hashtags, NO link",\n` +
      `  "tips": ["2 short practical reminders"] }\n` +
      `Do NOT generate a 'going live' social post.`);
    out.description = ((out.description || "").trim() + "\n\n" + footer);
    return out;
  }

  // video
  const out = await claudeJSON(
    `Optimize a ${input.platform || "youtube"} ${input.format || "long"}-form video for Mifu.\n` +
    `Working title: "${input.title || "(none yet)"}"\nTopic / hook / key points: "${input.topic || ""}"${ctx}\n\n` +
    `Return ONLY this JSON (no prose):\n` +
    `{ "titleScore": <0-100 integer>, "titleWhy": "1-2 sentences using the TITLE ENGINE rubric",\n` +
    `  "titles": ["4 stronger title options using her proven templates"],\n` +
    `  "tags": ["12-15 YouTube SEO tags/keywords, most important first"],\n` +
    `  "hashtags": ["5 hashtags following 1 small / 2 medium / 2 large, right for ${input.platform || "youtube"}"],\n` +
    `  "description": "hook (1-2 lines) -> short summary -> a line '⏱ Timestamps:'. Do NOT add a links/socials section (it is appended automatically)." }`);
  out.description = ((out.description || "").trim() + "\n\n" + footer);
  return out;
}

async function analyze(input: any, vidiq: any) {
  const history = await recentTitles();
  return await claudeJSON(
    `Score this content idea for Mifu against the 4 criteria.\n` +
    `Title: "${input.title || ""}"\nFormat: ${input.format || ""} · Platform: ${input.platform || ""} · Pillar: ${input.pillar || ""}\n` +
    `Hook: "${input.hook || ""}"\nScript/notes: "${input.script || ""}"\n\nHer recent content:\n${history}${vidiqBlock(vidiq)}\n\n` +
    `Return ONLY this JSON:\n` +
    `{ "score": <0-100>, "criteria": { "relevant": bool, "nonobvious": bool, "absorbable": bool, "actionable": bool },\n` +
    `  "verdict": "1-2 sentences", "titles": ["3 stronger titles"], "hooks": ["2 stronger hooks"],\n` +
    `  "hashtags": ["5 following 1 small / 2 medium / 2 large"], "fix": "the single highest-leverage improvement" }`);
}

async function ask(input: any) {
  const history = await recentTitles();
  return await claudeJSON(
    `Answer this content/brand question for Mifu, in her voice, grounded in her history + the platform rules. ` +
    `Give a plain next action when useful.\nQuestion: "${(input.question || "").slice(0, 1000)}"\n\nHer recent content:\n${history}\n\n` +
    `Return ONLY this JSON: { "answer": "your answer" }`, 900);
}

async function thumbnail(input: any) {
  if (!input.image) throw new Error("No thumbnail image received.");
  const m = String(input.image).match(/^data:(image\/\w+);base64,(.*)$/);
  if (!m) throw new Error("Thumbnail image format not recognized.");
  const reply = await claude([{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
      { type: "text", text:
        `Judge this thumbnail like vidIQ's checker (title: "${input.title || ""}"). Reads at small/mobile size; ` +
        `contrast + clear focal point; text legible AND <=4 words; clear emotive face; pairs with the title without just repeating it.\n` +
        `Return ONLY this JSON: { "score": <0-100>, "verdict": "1-2 sentences", "strengths": ["2-4"], "improvements": ["2-4"] }` },
    ],
  }], 600);
  const out = parseJSON(reply);
  if (!out) throw new Error("Couldn't read the thumbnail — try again.");
  return out;
}

async function channelSnapshot(input: any) {
  if (!YT_KEY) throw new Error("YouTube key isn't set on the server.");
  const q = input.channelId ? `id=${input.channelId}` : `forHandle=@${(input.handle || HANDLE).replace(/^@/, "")}`;
  const c = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails,snippet&${q}&key=${YT_KEY}`)).json();
  const ch = c.items?.[0];
  if (!ch) throw new Error("Couldn't find that YouTube channel.");
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  let recent: any[] = [];
  try {
    if (uploads) {
      const p = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${uploads}&key=${YT_KEY}`)).json();
      const ids = (p.items || []).map((i: any) => i.contentDetails.videoId).join(",");
      if (ids) {
        const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${YT_KEY}`)).json();
        recent = (v.items || []).map((x: any) => ({ id: x.id, title: x.snippet?.title || "", views: Number(x.statistics?.viewCount ?? 0) }));
      }
    }
  } catch (_) { /* recent optional */ }
  return { snapshot: {
    title: ch.snippet?.title || "", subscribers: Number(ch.statistics?.subscriberCount || 0),
    views: Number(ch.statistics?.viewCount || 0), videos: Number(ch.statistics?.videoCount || 0), recent } };
}

// ===================== AGENT (Kiko controls the app) =====================
const AGENT_SYSTEM = `You are Kiko, Mifuyu's cozy snowfox companion living inside her personal app "Mifuyu Health OS". You are warm, sweet, gentle, a little playful, snowfox/❄️🦊 energy, spoon-theory-aware (never pushy). You both chat AND perform actions in her app on her behalf.

You manage: a calendar, a planner (tasks), weekly/monthly goals, daily mood/anxiety/energy check-ins, weight + body measurements, her Mounjaro (tirzepatide) injections & water, PCOS symptom logs & cycle, a brain-dump list, sticky notes, her recurring weekly STREAM SCHEDULE, and tab navigation. You are NOT a doctor — never give medical advice or invent health numbers she didn't say; just log what she tells you. Keep replies short and kind.

IMPORTANT — STREAM SCHEDULE vs EVENTS (don't confuse these):
- The "stream schedule" is her RECURRING WEEKLY streaming routine — which WEEKDAYS she streams and what she plays, e.g. "Wed & Thu: POE2 at 5PM, Sat: Warframe Day". It repeats every week (it has no specific date), and it shows up as a 🔴 marker on every matching weekday in the calendar. Use the stream-schedule actions (addStreamDay / removeStreamDay / clearStreamSchedule) for anything about "my stream schedule", "I stream on ___", "I play ___ on ___s", "move/change my ___ stream", "I'm not streaming on ___ anymore".
- An "event" (addEvent) is a ONE-OFF thing on a SPECIFIC DATE — a collab on the 14th, a dentist appointment, a game's update day. Use addEvent only when there's a particular calendar date (one day or a date range), NOT a repeating weekday.
- Quick test: if she names a weekday with no date and it's about her regular streaming, it's the STREAM SCHEDULE. If she names/implies a specific date, it's an EVENT. A one-time special stream on a given date is an event; her usual weekly streaming is the schedule.
- The current schedule and upcoming events are provided below so you can answer questions about them and edit the right one.

Write your "reply" in PLAIN TEXT only — no Markdown, no asterisks for bold/italics, no backticks, no headers, no bullet syntax. Just normal sentences. Emojis are welcome (❄️🦊💗). Keep it short and warm.

Return ONLY a JSON object, no prose outside it:
{ "reply": "<a short, warm PLAIN-TEXT message to her>", "actions": [ <zero or more action objects> ] }

Allowed action objects (use ONLY these shapes; include just the fields you need):
- {"type":"navigate","tab":"home|planner|calendar|optimize|pcos|mj|weight|care|trends|settings"}
- {"type":"addStreamDay","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun","show":"<what she plays/does>","time":"5PM"}   (recurring weekly stream; adds the day, or updates show/time if that weekday already exists)
- {"type":"removeStreamDay","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun"}   (she no longer streams that weekday)
- {"type":"clearStreamSchedule"}   (wipe the whole weekly schedule)
- {"type":"addEvent","title":"...","date":"YYYY-MM-DD","endDate":"YYYY-MM-DD or null","time":"HH:MM or empty","tz":"IANA zone (default Europe/Amsterdam)","note":"","url":""}
- {"type":"addTask","text":"...","bucket":"personal|health|content|hobbies|someday","spoon":"low|some|full"}
- {"type":"addGoal","period":"week|month","text":"..."}
- {"type":"logMind","mood":0-5,"anxiety":0-5,"energy":0-5,"weather":0-5,"kind":true}   (include only what she gave; 0-5 scales)
- {"type":"logWeight","value":<number, kg>}
- {"type":"addNSV","text":"<a non-scale victory>"}
- {"type":"addMeasurement","bust":<cm>,"waist":<cm>,"hips":<cm>,"thighs":<cm>,"arms":<cm>}   (include only provided)
- {"type":"logShot","date":"YYYY-MM-DD or today","dose":2.5|5|7.5|10|12.5|15,"site":"L abdomen|R abdomen|L thigh|R thigh|L upper arm|R upper arm","time":"HH:MM or empty","note":""}
- {"type":"logWater","cups":<number>}
- {"type":"addCapture","text":"..."}   (a brain-dump note)
- {"type":"addSticky","text":"..."}
- {"type":"cycleStart"}   (period started today)
- {"type":"cycleEnd"}     (period ended today)
- {"type":"logPcos","field":"fatigue|bloating|cravings|acne|shedding","value":0-5}
- {"type":"startScript","kind":"short|long","title":"...","raw":"<the idea/notes she gave you to script>","references":"...","format":true|false}   (opens the Script Writer seeded with this; set format:true only if there's already enough to shape a draft now)

Rules:
- Compute all dates relative to TODAY and her timezone, given below. "tomorrow"/"next friday"/"in 2 weeks" → real YYYY-MM-DD. Multi-day → set endDate.
- Only include actions she clearly asked for. If she's just chatting or asking a question, use "actions":[] and answer in "reply".
- If something's ambiguous, do your best reasonable guess and mention it in the reply (don't refuse).
- Always include a brief warm "reply" confirming what you did or answering her.`;

async function agent(input: any) {
  const today = input.today || "", tz = input.tz || "Europe/Amsterdam", tab = input.tab || "home";
  const sched = Array.isArray(input.schedule) ? input.schedule : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const schedStr = sched.length
    ? sched.map((s: any) => `${s.day || "?"}${s.time ? " " + s.time : ""}: ${s.show || s.title || "stream"}`).join("; ")
    : "(empty — she hasn't set a weekly stream schedule yet)";
  const evStr = events.length
    ? events.map((e: any) => `${e.date}${e.endDate && e.endDate !== e.date ? "→" + e.endDate : ""} ${e.title}`).slice(0, 20).join("; ")
    : "(none coming up)";
  const user = `TODAY is ${today} (timezone ${tz}). Her current tab is "${tab}".\n\n`
    + `Her CURRENT weekly STREAM SCHEDULE (recurring weekdays): ${schedStr}\n`
    + `Her UPCOMING one-off EVENTS (specific dates): ${evStr}\n\n`
    + `She said: "${(input.question || "").slice(0, 1500)}"`;
  const out = parseJSON(await claudeWith(AGENT_SYSTEM, user, 1200));
  if (!out) return { reply: "my whiskers twitched — could you say that again? 🦊", actions: [] };
  if (!Array.isArray(out.actions)) out.actions = [];
  if (!out.reply) out.reply = "okay! ❄️";
  return out;
}

// ===================== REMINDERS (daily email; triggered by cron) =====================
function todayInTz(tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p; // YYYY-MM-DD
}
function daysBetweenISO(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function nextBirthdayISO(month: number, day: number, todayISO: string): string {
  const y = Number(todayISO.slice(0, 4));
  const mk = (yy: number) => `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let iso = mk(y);
  if (daysBetweenISO(todayISO, iso) < 0) iso = mk(y + 1);
  return iso;
}
async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Resend error: " + (j && (j.message || JSON.stringify(j))));
  return j;
}
async function remind(_input: any) {
  if (!SB_URL || !SB_SERVICE_KEY) return { ok: false, error: "Supabase service env not set" };
  // pull every sentinel/config row that has email reminders turned on
  const url = `${SB_URL}/rest/v1/daily_logs?date=eq.2000-01-01&select=user_id,notes`;
  const res = await fetch(url, { headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + SB_SERVICE_KEY } });
  const rows = await res.json();
  if (!Array.isArray(rows)) return { ok: false, error: "could not read rows", detail: rows };
  const today = todayInTz(REMIND_TZ);
  let sent = 0; const results: any[] = [];
  for (const row of rows) {
    const n = row.notes || {}; const rem = n.reminders || {};
    if (!rem.email || !rem.emailAddr) continue;
    const offs: number[] = Array.isArray(rem.offsets) ? rem.offsets : [0, 1];
    const due: string[] = [];
    (n.calendarEvents || []).forEach((ev: any) => { const d = daysBetweenISO(today, ev.date); if (offs.includes(d)) due.push(`<li>${d === 0 ? "<b>Today</b>" : d === 1 ? "<b>Tomorrow</b>" : "In " + d + " days"} — ${escapeHtml(ev.title)}${ev.time ? " · " + escapeHtml(ev.time) : ""}</li>`); });
    (n.birthdays || []).forEach((b: any) => { const iso = nextBirthdayISO(Number(b.month), Number(b.day), today); const d = daysBetweenISO(today, iso); if (offs.includes(d)) due.push(`<li>${d === 0 ? "<b>Today</b>" : d === 1 ? "<b>Tomorrow</b>" : "In " + d + " days"} — 🎂 ${escapeHtml(b.name)}'s birthday</li>`); });
    if (!due.length) continue;
    const html = `<div style="font-family:system-ui,sans-serif;color:#3a3550"><h2 style="color:#8d6fd1">❄️ Mifuyu reminders</h2><p>Here's what's coming up, cozy one:</p><ul>${due.join("")}</ul><p style="color:#9b96b6;font-size:12px">From your Mifuyu Health OS · gentle nudges, no pressure 💗🦊</p></div>`;
    try { await sendEmail(rem.emailAddr, "❄️ Your Mifuyu reminders", html); sent++; results.push({ to: rem.emailAddr, items: due.length }); }
    catch (e) { results.push({ to: rem.emailAddr, error: (e as Error).message }); }
  }
  return { ok: true, sent, results };
}
function escapeHtml(s: string){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]||c)); }

// ===================== DAILY FEELINGS JOURNAL (Kiko gently walks her through it) =====================
const JOURNAL_SYSTEM = `You are Kiko, Mifuyu's cozy snowfox companion (❄️🦊), gently guiding her through a DAILY feelings journal — out loud, like a warm friend sitting beside her with tea. This journal is about how she is FEELING today, the EVENTS of her day, and her feelings ABOUT those things.

Style: warm, soft, curious, unhurried. PLAIN TEXT only — no Markdown, no asterisks, no bullet points, no headers. A few emojis are welcome but sparing. Ask exactly ONE gentle question per turn. First, reflect back what she just said in a short sentence so she feels heard, THEN ask your next question. Keep each message short (1–3 sentences).

Go a little deeper into feelings — help her name them, ask what's underneath or where she feels it — but never clinical, never pushy, and don't give advice unless she asks. If something sounds heavy, slow right down and be tender; it's okay to just sit with it for a beat.

A loose arc to follow (let HER lead, you don't have to hit them all): how she's arriving right now / the weather inside → what actually happened today, big and tiny → which moment stirred the most feeling → gently explore that feeling → a moment worth keeping → what she needs a little more of → a soft word to tomorrow-her.

You're given her check-in numbers and today's events as context — weave them in naturally (if her anxiety was high or mood low, be extra tender). Never invent events she didn't mention.

After roughly 6–8 of her replies, or sooner if it feels complete, gently wrap up: reflect the heart of what she shared in 1–2 warm sentences, remind her she showed up for herself today, and set "done": true.

Return ONLY JSON: { "reply": "<your next plain-text message to her>", "done": true|false }`;

async function journalMode(input: any) {
  const ctx = input.context || {};
  const msgs = Array.isArray(input.messages) ? input.messages : [];
  const turns = msgs.map((m: any) => (m.role === "me" ? "Mifu" : "Kiko") + ": " + m.content).join("\n");
  const sc = (v: any) => (v == null ? "not set" : v + "/5");
  const ctxStr = `Her check-in today — mood: ${sc(ctx.mood)}, anxiety: ${sc(ctx.anxiety)}, weather inside: ${sc(ctx.weather)} (0 = stormy, 5 = bright). Today's events on her calendar: ${(ctx.events && ctx.events.length) ? ctx.events.join("; ") : "(none listed)"}.`;
  const user = `${ctxStr}\n\nThe journal conversation so far:\n${turns || "(not started yet — open with a warm hello and your first gentle question about how she's feeling right now)"}\n\nReturn Kiko's next message as JSON {reply, done}.`;
  const out = parseJSON(await claudeWith(JOURNAL_SYSTEM, user, 600));
  if (!out || typeof out.reply !== "string") return { reply: "mmm, I'm right here with you — tell me a little more? ❄️", done: false };
  return { reply: out.reply, done: !!out.done };
}

// ===================== SCRIPT WRITER (spoken notes + research → formatted script) =====================
async function scriptMode(input: any) {
  const i = input || {};
  const kind = i.kind === "long" ? "long" : "short";
  const title = (i.title || "").toString().slice(0, 200);
  const refs = (i.references || "").toString().slice(0, 4000);
  const raw = (i.raw || "").toString().slice(0, 7000);
  if (!raw && !refs) return { error: "Add some spoken words or references first." };
  const common = `Her working title: ${title || "(none)"}\n\nResearch / references she pasted (facts, links, source notes — ground the script in these, don't invent facts):\n${refs || "(none)"}\n\nHer own spoken words (raw voice-to-text — may ramble, mis-punctuate, or repeat; clean it up but KEEP her phrasing, jokes, and voice — do not blandify her):\n${raw || "(none)"}`;
  const prompt = kind === "short"
    ? `Shape this into a tight SHORT-form video script (YouTube Shorts / TikTok, ~45–55 seconds, roughly 110–150 spoken words). Return ONLY JSON:
{ "title": string, "hooks": string[3], "script": string, "cta": string }
- hooks: 3 punchy first-line options (the first 1–2 seconds — curiosity / shock / a specific claim).
- script: the full spoken script in her voice. Open on the strongest hook, 2–4 fast beats, one clear payoff. Spoken lines only (no camera directions). Tight enough for a short.
- cta: one soft, on-brand closing line.
${common}`
    : `Shape this into a LONG-form YouTube script. Return ONLY JSON:
{ "title": string, "hooks": string[3], "script": string, "cta": string }
- script: a full script in her voice — a strong cold-open hook, then clear sections using short "## Section name" headers, natural spoken paragraphs grounded in the research, building logically, with a warm outro. Tighten the rambling but preserve her points, phrasing, and personality.
- hooks: 3 cold-open options. cta: a warm subscribe / community CTA.
${common}`;
  const txt = await claude([{ role: "user", content: prompt }], 2400);
  return parseJSON(txt) || { title, hooks: [], script: txt, cta: "" };
}

// ===================== router =====================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const mode = body.mode, input = body.input || {}, vidiq = body.vidiq;
    if (mode === "optimize") return json(await optimize(input, vidiq));
    if (mode === "analyze") return json(await analyze(input, vidiq));
    if (mode === "ask") return json(await ask(input));
    if (mode === "agent") return json(await agent(input));
    if (mode === "remind") return json(await remind(input));
    if (mode === "script") return json(await scriptMode(input));
    if (mode === "journal") return json(await journalMode(input));
    if (mode === "thumbnail") return json(await thumbnail(input));
    if (mode === "channelSnapshot") return json(await channelSnapshot(input));
    return json({ error: "Unknown mode: " + mode }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});
