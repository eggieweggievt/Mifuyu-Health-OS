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
// adaptive model tiers — fast for simple commands, standard for most work, smart on request
const FAST_MODEL = Deno.env.get("AI_MODEL_FAST") || "claude-haiku-4-5-20251001";
const SMART_MODEL = Deno.env.get("AI_MODEL_SMART") || MODEL;   // set AI_MODEL_SMART (e.g. an Opus model) to unlock a bigger brain on request
function pickAgentModel(q: string): string {
  const s = String(q || "").toLowerCase();
  if (/\b(smart|best|big brain|deep|think hard|carefully|opus)\b/.test(s)) return SMART_MODEL;   // "use your smart brain"
  if (/\b(quick|quickly|fast)\b/.test(s)) return FAST_MODEL;
  // complex: long, research-y, creative, analytical, or multi-step → standard model (also needed for web search quality)
  if (s.length > 180 || /\b(search|look up|research|plan|write|script|brainstorm|why|analy|compare|summar|explain|refresh my game|help me think)\b/.test(s)) return MODEL;
  return FAST_MODEL;   // short action-y commands ("log my mood as 4", "add a task…") → fast + cheap
}
// reminders (email) — optional; only used by the "remind" mode triggered by a daily cron
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "Mifuyu Health OS <onboarding@resend.dev>";
const REMIND_TZ = Deno.env.get("REMIND_TZ") || "Europe/Amsterdam";
// Withings (Body Smart scale) — optional; set via deploy-ai.ps1 once API access is granted
const WITHINGS_ID = Deno.env.get("WITHINGS_CLIENT_ID") || "";
const WITHINGS_SECRET = Deno.env.get("WITHINGS_CLIENT_SECRET") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://eggieweggievt.github.io/Mifuyu-Health-OS/";
const WITHINGS_REDIRECT = (SB_URL ? SB_URL + "/functions/v1/ai" : "") + "?withings=callback";

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
// custom system + user, with optional server-side tools (e.g. web search) + optional model override.
async function claudeWithTools(system: string, user: string, maxTokens = 1500, tools?: any[], model?: string): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error("Claude key isn't set on the server.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }], ...(tools && tools.length ? { tools } : {}) }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "Claude error");
  return (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
}
// custom system + arbitrary message content (supports images) + optional model — used by the food estimator
async function claudeMsg(system: string, content: any, maxTokens = 700, model?: string): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error("Claude key isn't set on the server.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
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
- {"type":"navigate","tab":"home|kiko|planner|calendar|script|optimize|money|pcos|mj|weight|food|care|trends|settings"}   (optimize = the Stream tab)
- {"type":"addStreamDay","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun","show":"<what she plays/does>","time":"5PM"}   (recurring weekly stream; adds the day, or updates show/time if that weekday already exists)
- {"type":"removeStreamDay","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun"}   (she no longer streams that weekday)
- {"type":"clearStreamSchedule"}   (wipe the whole weekly schedule)
- {"type":"addEvent","title":"...","date":"YYYY-MM-DD","endDate":"YYYY-MM-DD or null","time":"HH:MM or empty","tz":"IANA zone (default Europe/Amsterdam)","note":"","url":"","src":"OMIT normally; only game|gameevent|gamestream for game-calendar markers (always single-day, real url)"}
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
- {"type":"logFood","name":"...","serving":"the portion","kcal":<integer>,"protein":<grams>,"carbs":<grams>,"fiber":<grams>,"fat":<grams>}   (when she tells you about a meal/snack to log WITHOUT a photo, ESTIMATE its calories and macros yourself from standard nutrition knowledge for the portion she describes — she cares most about PROTEIN and FIBRE for her health, so be especially careful with those. If she gives her own numbers, use them. Don't ask her for the numbers; make a sensible estimate and mention in your reply that it's an estimate.)
- {"type":"startScript","kind":"short|long","title":"...","raw":"<the idea/notes she gave you to script>","references":"...","format":true|false}   (opens the Script Writer seeded with this; set format:true only if there's already enough to shape a draft now)
- {"type":"addBirthday","name":"...","date":"YYYY-MM-DD"}   (a friend's birthday — recurs yearly, the year is ignored. If she gives a name/social handle of a PUBLIC creator and you can find a reliable birth DATE via web search, use it; if you can't find it confidently, ask her for the date instead of guessing.)
- {"type":"addGameTopic","name":"<game>"}      (start tracking a game so its updates/events/livestreams flow into her calendar)
- {"type":"removeGameTopic","name":"<game>"}   (stop tracking a game)
- {"type":"completeTask","text":"<task wording>"}   (mark a task done)  ·  {"type":"deleteTask","text":"..."}
- {"type":"completeGoal","period":"week|month (optional)","text":"..."}  ·  {"type":"deleteGoal","period":"week|month (optional)","text":"..."}
- {"type":"deleteEvent","title":"...","date":"YYYY-MM-DD (optional, helps match)"}
- {"type":"removeBirthday","name":"..."}
- {"type":"addMed","name":"...","dose":"e.g. 500 mg","time":"e.g. morning"}  ·  {"type":"removeMed","name":"..."}
- {"type":"addJoy","text":"<a little joy for her joy jar>"}
- {"type":"logSleep","hours":<number>}
- {"type":"logMj","field":"nausea|constipation|diarrhea|reflux|belly|fatigue|foodnoise","value":0-5}   (Mounjaro side-effect levels)
- {"type":"mjToggle","field":"proteinMeals|smallerMeals|fiber|gentleMove","on":true|false}   (her daily Mounjaro helpers)
- {"type":"pcosToggle","field":"moved|balanced|protein|lowsugar","on":true|false}
- {"type":"setFlow","value":"light|med|heavy"}   (period flow today)
- {"type":"addMoney","dir":"in|out","amount":<euros>,"cat":"...","desc":"...","date":"YYYY-MM-DD optional"}   (her business books — income cats: Twitch, YouTube, Sponsorship, Donations/Tips, Merch, Affiliate, Other; expense cats: Equipment, Software & subs, Internet & phone, Home office, Travel, Games/content, Marketing, Accountant, Bank & fees, Other)
- {"type":"addSponsor","name":"...","code":"","payout":"","url":"","note":""}  ·  {"type":"sponsorStatus","name":"...","status":"pending|active|done"}  ·  {"type":"removeSponsor","name":"..."}
- {"type":"logBodyComp","weight":<kg>,"fat":<%>,"muscle":<kg>,"bone":<kg>,"water":<%>,"visceral":<n>,"hr":<bpm>}   (only the fields she gave — scale readings)
- {"type":"setFoodTargets","kcal":<n>,"protein":<g>,"fiber":<g>}
- {"type":"removeFood","name":"<one of today's logged foods>"}
- {"type":"removeShot","date":"YYYY-MM-DD or \"last\""}   (delete a mistaken injection log)
- {"type":"removePeriod","date":"YYYY-MM-DD (the start date) or \"last\""}   (delete a mistaken period log)
- {"type":"setJournalNote","text":"..."}   (today's one-line journal on Home)
- {"type":"setEnergyToday","value":1|3|5}   (her spoons for today: 1 low · 3 med · 5 high)
- {"type":"removeSticky","text":"<words on the sticky>"}  ·  {"type":"removeCapture","text":"<brain-dump words>"}
- {"type":"startJournal"}   (begin the guided daily feelings journal)  ·  {"type":"startTaxPrep"}   (begin the tax-prep walkthrough)
- {"type":"rememberFact","text":"<a lasting fact or preference about her, her people, or how she likes things>"}   (save to YOUR long-term memory — use when she says "remember…", or shares something durably useful like a friend's name, a preference, an allergy, her mods, what she mains)
- {"type":"forgetFact","text":"<words from the fact to forget>"}
- {"type":"updateEvent","title":"<existing event words>","date":"YYYY-MM-DD (optional, helps match)","newTitle":"optional","newDate":"YYYY-MM-DD optional","newTime":"HH:MM optional"}   (reschedule/rename in place — prefer this over delete+re-add)
- {"type":"editTask","text":"<existing task words>","newText":"..."}
- {"type":"undoLast"}   (undo her most recent data change — when she says "undo that" / "whoops, put it back")

When completing or removing something, echo HER wording in the action's text/title so it matches the right item — and if you're not sure which item she means, ask instead of guessing. Each action you emit gets confirmed back to her with a ✓ line; if an item couldn't be found, no ✓ appears, so don't claim it's done — invite her to rephrase.

You can SEARCH THE WEB when it would help — for current info (game update dates/times, patch notes, news), facts you're unsure of, nutrition details, prices, anything time-sensitive or that you don't reliably know. Search when it makes your answer more accurate, then weave what you found into your warm reply (and into an action if relevant — e.g. search a game's update time, then addEvent it). You don't need to search for simple chit-chat or things you already know.

You are also given YOUR MEMORY about her (facts she asked you to remember — weave them in naturally, never recite the list), a DATA SNAPSHOT (her latest real numbers — use these to answer questions about her weight, food, mood, money accurately instead of guessing), and the RECENT CONVERSATION (so follow-ups like "actually make it 8pm" or "delete that" refer to the right thing).

GAME-CALENDAR REFRESH: if she asks you to refresh/update her game calendar now, web-search each game in her TRACKED GAMES list for (a) the next update/version date, (b) limited-time event START and END dates, (c) livestream/special-program dates (add "(speculated)" to the title if unconfirmed) — then emit ONE single-day addEvent per finding with src "game", "gameevent" or "gamestream" and a real url.

Rules:
- Compute all dates relative to TODAY and her timezone, given below. "tomorrow"/"next friday"/"in 2 weeks" → real YYYY-MM-DD. Multi-day → set endDate.
- Only include actions she clearly asked for. If she's just chatting or asking a question, use "actions":[] and answer in "reply".
- If something's ambiguous, do your best reasonable guess and mention it in the reply (don't refuse).
- Always include a brief warm "reply" confirming what you did or answering her.
- CRITICAL: after any web searching, your FINAL output must be ONLY the JSON object { "reply": ..., "actions": [...] } and nothing else.`;

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
  const mem = (Array.isArray(input.memory) && input.memory.length) ? input.memory.map((m: any) => "- " + (m.text || m)).join("\n") : "(nothing saved yet)";
  const hist = (Array.isArray(input.history) && input.history.length) ? input.history.map((h: any) => (h.role === "me" ? "Mifu" : "Kiko") + ": " + String(h.text || "").slice(0, 300)).join("\n") : "(start of conversation)";
  const games = (Array.isArray(input.games) && input.games.length) ? input.games.join(", ") : "(none)";
  const user = `TODAY is ${today} (timezone ${tz}). Her current tab is "${tab}".\n\n`
    + `YOUR MEMORY about her:\n${mem}\n\n`
    + `DATA SNAPSHOT: ${input.summary || "(none)"}\n`
    + `Her CURRENT weekly STREAM SCHEDULE (recurring weekdays): ${schedStr}\n`
    + `Her UPCOMING one-off EVENTS (specific dates): ${evStr}\n`
    + `Her TRACKED GAMES: ${games}\n\n`
    + `RECENT CONVERSATION:\n${hist}\n\n`
    + `She just said: "${(input.question || "").slice(0, 1500)}"`;
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
  const model = pickAgentModel(input.question || "");
  let text = "";
  try { text = await claudeWithTools(AGENT_SYSTEM, user, 1500, tools, model); }
  catch (_e) { try { text = await claudeWithTools(AGENT_SYSTEM, user, 1200, undefined, model); } catch (_e2) { text = ""; } }
  let out = parseJSON(text);
  if (!out && model !== MODEL) {   // fast model fumbled the JSON → one retry on the standard model
    try { text = await claudeWithTools(AGENT_SYSTEM, user, 1500, tools, MODEL); out = parseJSON(text); } catch (_e3) {}
  }
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
    const bdayOffs = [30, 7, 1, 0];   // birthdays always get a month-ahead heads-up (gift time)
    (n.birthdays || []).forEach((b: any) => { const iso = nextBirthdayISO(Number(b.month), Number(b.day), today); const d = daysBetweenISO(today, iso); if (bdayOffs.includes(d)) due.push(`<li>${d === 0 ? "<b>Today</b>" : d === 1 ? "<b>Tomorrow</b>" : d >= 28 ? "In about a month" : "In " + d + " days"} — 🎂 ${escapeHtml(b.name)}'s birthday</li>`); });
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

// ===================== JOURNAL WRITE-UP (turn the chat + her data into a diary entry in her voice) =====================
const JOURNAL_WRITE_SYSTEM = `You write Mifuyu's (Mifu's) daily journal entry in HER OWN first-person voice — warm, sweet, hopeful, cozy, a little playful, snowfox ❄️🦊 energy, gentle with hard things and quick to reframe them kindly. Use soft emojis (♡ ✨ 🌙 🥺 💕) and an occasional "LOL" or kaomoji like she does, but don't overdo it.

Match the STRUCTURE and TONE of this example (do NOT reuse its facts — it's only a style guide):
"""
Good evening!! ♡
Day 24 • Week 4 of Mounjaro
Today felt like a fresh start in a lot of ways. I took my 4th Mounjaro injection a little later than usual and thankfully had no side effects... [warm first-person paragraphs weaving feelings, the day's events, stats, and a gentle reframe of anything hard] ...heading into Week 5 with a lot of excitement for what's ahead ♡
Goodnight!! 🌙💕
"""

Write today's entry as flowing first-person paragraphs:
- Open with a cheery, time-appropriate greeting line.
- If a Mounjaro Day/Week is provided in the facts, put a "Day X • Week Y of Mounjaro" line right under the greeting.
- Then warm paragraphs weaving together how she felt today, the events of her day, HER OWN WORDS from the conversation, and any REAL stats provided (weight today + change, last injection, measurements).
- Reframe any frustration gently and end on a hopeful note, then a goodnight line.

HARD RULES: Use ONLY facts present in the provided FACTS list or that she actually said in the conversation. NEVER invent numbers, metrics, or events — if something isn't provided, simply don't mention it (e.g. do not make up body-fat %, hydration, muscle %, or anything not given). Stay true to what she shared. Plain text only — no Markdown, no asterisks, no heading symbols, just paragraphs and line breaks. Around 150–320 words.

Return ONLY JSON: { "entry": "<the journal entry as plain text with line breaks>" }`;

async function journalWrite(input: any) {
  const ctx = input.context || {};
  const log = Array.isArray(input.transcript) ? input.transcript : [];
  const convo = log.map((x: any) => `${x.who || (x.role === "me" ? "Mifu" : "Kiko")}: ${x.text || x.content}`).join("\n");
  const unit = ctx.unit || "kg";
  const facts: string[] = [];
  if (ctx.dateLabel) facts.push("Date: " + ctx.dateLabel);
  if (ctx.mjDay) facts.push(`Mounjaro: Day ${ctx.mjDay}, Week ${ctx.mjWeek}`);
  if (ctx.lastShot) facts.push(`Most recent injection: ${ctx.lastShot.dose}mg${ctx.lastShot.site ? " in " + ctx.lastShot.site : ""} on ${ctx.lastShot.date}`);
  if (ctx.weightToday != null) facts.push(`Weight today: ${ctx.weightToday}${unit}` + (ctx.weightChange != null ? ` (change since first logged weight: ${ctx.weightChange > 0 ? "+" : ""}${ctx.weightChange}${unit})` : ""));
  if (ctx.measLatest) { const m = ctx.measLatest; const parts = ["bust", "waist", "hips", "thighs", "arms"].filter(k => m[k] != null).map(k => `${k} ${m[k]}cm`); if (parts.length) facts.push("Latest measurements: " + parts.join(", ")); }
  if (ctx.comp) { const names: Record<string,string> = {bmi:"BMI",fat:"body fat %",muscle:"muscle kg",bone:"bone kg",water:"body water %",visceral:"visceral fat",hr:"heart rate bpm"}; const parts = Object.keys(ctx.comp).map((k:string)=>{ const c=ctx.comp[k]; return `${names[k]||k} ${c.v}${c.d!=null&&c.d!==0?` (change ${c.d>0?"+":""}${c.d})`:""}`; }); if (parts.length) facts.push("Body composition from her scale: " + parts.join(", ")); }
  if (ctx.food) facts.push(`Today's food: ~${ctx.food.kcal} kcal, protein ${ctx.food.protein}g (target ${ctx.food.targetProtein}g), fibre ${ctx.food.fiber}g (target ${ctx.food.targetFiber}g)`);
  const sc = (v: any) => (v == null ? "not set" : v + "/5");
  facts.push(`Check-in — mood ${sc(ctx.mood)}, anxiety ${sc(ctx.anxiety)}, weather inside ${sc(ctx.weather)} (0 stormy → 5 bright)`);
  if (ctx.events && ctx.events.length) facts.push("Today's calendar: " + ctx.events.join("; "));
  const user = `FACTS (use only these plus what she says — invent nothing else):\n${facts.join("\n")}\n\nHer journal conversation with Kiko today:\n${convo || "(no conversation captured)"}\n\nWrite her journal entry now as JSON {entry}.`;
  const out = parseJSON(await claudeWith(JOURNAL_WRITE_SYSTEM, user, 900));
  return out && out.entry ? { entry: out.entry } : { entry: convo || "" };
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

// ===================== FOOD (photo + description → estimated macros) =====================
const FOOD_SYSTEM = `You are a careful, friendly nutrition estimator for Mifuyu, who is on a GLP-1 (tirzepatide) and has PCOS, so PROTEIN and FIBRE matter a lot to her. Given a photo of a meal and/or a short description, identify the food and estimate its nutrition for the portion actually shown/described.

Estimate like a knowledgeable dietitian using standard nutrition data for the identified foods and visible portion size. If the description gives quantities (e.g. "200g chicken, one cup rice"), use them. If unsure of portion, assume a normal single serving and say so in the note. Prefer realistic, not flattering, numbers.

Return ONLY JSON:
{ "name": "short food name", "serving": "the portion you assumed (e.g. '1 bowl, ~350g')", "kcal": <integer calories>, "protein": <grams>, "carbs": <grams>, "fiber": <grams>, "fat": <grams>, "confidence": "low|medium|high", "note": "one short friendly line — e.g. a protein/fibre tip or what you assumed" }

Numbers are estimates; round sensibly (kcal to nearest 5–10, grams to nearest whole or 0.5). Keep the note warm and brief, no markdown.`;

function normFoodItem(out: any) {
  const num = (v: any) => (v == null || isNaN(Number(v)) ? 0 : Math.round(Number(v) * 10) / 10);
  return { name: out.name || "food", serving: out.serving || "", kcal: Math.round(Number(out.kcal) || 0), protein: num(out.protein), carbs: num(out.carbs), fiber: num(out.fiber), fat: num(out.fat), confidence: out.confidence || "medium", note: out.note || "" };
}
async function foodMode(input: any) {
  const desc = (input.description || "").toString().slice(0, 600);
  const imgs: string[] = Array.isArray(input.images) ? input.images : (input.image ? [input.image] : []);
  const content: any[] = [];
  imgs.slice(0, 8).forEach((im) => { const m = String(im).match(/^data:(image\/\w+);base64,(.*)$/); if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }); });
  if (!content.length && !desc) return { error: "Add a photo or a description of the food first." };
  const multi = imgs.length > 1;
  if (multi) {
    content.push({ type: "text", text: `These are ${imgs.length} photos of her food${desc ? ` — her note: "${desc}"` : ""}. Each photo is (usually) a separate dish or item. Identify EACH distinct food and estimate its nutrition for the portion shown. Return ONLY JSON: { "items": [ {"name":..., "serving":..., "kcal":<int>, "protein":<g>, "carbs":<g>, "fiber":<g>, "fat":<g>, "confidence":"low|medium|high", "note":"short"} , ... ] }` });
    const out = parseJSON(await claudeMsg(FOOD_SYSTEM, content, 1400));
    let items = (out && Array.isArray(out.items)) ? out.items : (out && out.kcal != null ? [out] : []);
    items = items.filter((x: any) => x && x.kcal != null).map(normFoodItem);
    if (!items.length) return { error: "Couldn't read those — try clearer photos or a quick description." };
    return { items };
  }
  content.push({ type: "text", text: `Estimate the nutrition for this meal.${desc ? ' Her description: "' + desc + '"' : " (no description given — go by the photo.)"} Return ONLY the JSON.` });
  let out = parseJSON(await claudeMsg(FOOD_SYSTEM, content, 700, FAST_MODEL));   // fast model first — cheap & quick
  if (!out || out.kcal == null) out = parseJSON(await claudeMsg(FOOD_SYSTEM, content, 700, MODEL));   // quality retry
  if (!out || out.kcal == null) return { error: "Couldn't read that one — try a clearer photo or a quick description." };
  return normFoodItem(out);
}

// ===================== WEEKLY DIGEST (Kiko's cozy Sunday letter, via email) =====================
async function digestMode(_input: any) {
  if (!SB_URL || !SB_SERVICE_KEY) return { error: "service env missing" };
  const notes = await sbGetNotes("mifuyu"); const rem = notes.reminders || {};
  if (!rem.email || !rem.emailAddr) return { ok: false, skipped: "email reminders not enabled" };
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const r = await fetch(`${SB_URL}/rest/v1/daily_logs?user_id=eq.mifuyu&date=gte.${since}&date=neq.2000-01-01&select=date,notes`, { headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + SB_SERVICE_KEY } });
  const days = await r.json().catch(() => []);
  const facts: string[] = [];
  try {
    const moods = (Array.isArray(days) ? days : []).map((d: any) => d.notes && d.notes.mind && d.notes.mind.mood).filter((v: any) => v != null);
    if (moods.length) facts.push(`Mood avg this week: ${(moods.reduce((a: number, b: number) => a + b, 0) / moods.length).toFixed(1)}/5 over ${moods.length} check-ins`);
    const wl = (notes.weightLog || []).filter((x: any) => x.w != null).sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
    if (wl.length) { const last = wl[wl.length - 1]; const wk = wl.filter((x: any) => x.date >= since); facts.push(`Weight now ${last.w}kg${wk.length > 1 ? ` (${(last.w - wk[0].w).toFixed(1)} this week)` : ""}`); }
    let kcal = 0, prot = 0, fib = 0, fd = 0;
    (Array.isArray(days) ? days : []).forEach((d: any) => { (d.notes && d.notes.food || []).forEach((f: any) => { kcal += +f.kcal || 0; prot += +f.protein || 0; fib += +f.fiber || 0; fd++; }); });
    if (fd) facts.push(`Food logged: ${fd} items (~${Math.round(kcal)} kcal, ${Math.round(prot)}g protein, ${Math.round(fib)}g fibre total)`);
    const jr = (notes.journalEntries || []).filter((e: any) => e.date >= since).length; if (jr) facts.push(`Journaled ${jr} time(s)`);
    const y = new Date().getFullYear(); const tx = (notes.money || []).filter((t: any) => String(t.date || "").startsWith(String(y)));
    const inc = tx.filter((t: any) => t.dir === "in").reduce((a: number, t: any) => a + (+t.amount || 0), 0);
    if (inc) facts.push(`Business income ${y} so far: €${Math.round(inc)}`);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10); const today = new Date().toISOString().slice(0, 10);
    const up = (notes.calendarEvents || []).filter((e: any) => e.date >= today && e.date <= nextWeek).map((e: any) => `${e.date} ${e.title}`).slice(0, 8);
    if (up.length) facts.push("Coming up: " + up.join("; "));
  } catch (_e) {}
  if (!facts.length) facts.push("A quiet week of rest — nothing logged, and that's okay too.");
  const txt = await claudeWith(
    `You are Kiko, Mifuyu's cozy snowfox companion ❄️🦊. Write her a SHORT weekly email letter (120–200 words) in PLAIN TEXT (no markdown), warm and personal, from the FACTS provided — celebrate small wins, be gentle about gaps, peek at the week ahead, sign off as Kiko. Never invent numbers.`,
    "FACTS:\n" + facts.join("\n"), 600);
  await sendEmail(rem.emailAddr, "❄️ Kiko's weekly letter", `<div style="font-family:system-ui,sans-serif;color:#3a3550;white-space:pre-wrap">${escapeHtml(txt)}</div>`);
  return { ok: true };
}

// ===================== WITHINGS (Body Smart scale → weight log) =====================
async function sbGetNotes(userId: string) {
  const r = await fetch(`${SB_URL}/rest/v1/daily_logs?user_id=eq.${encodeURIComponent(userId)}&date=eq.2000-01-01&select=notes`, { headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + SB_SERVICE_KEY } });
  const rows = await r.json(); return (Array.isArray(rows) && rows[0] && rows[0].notes) || {};
}
async function sbSaveNotes(userId: string, notes: any) {
  await fetch(`${SB_URL}/rest/v1/daily_logs?on_conflict=user_id,date`, { method: "POST", headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + SB_SERVICE_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: userId, date: "2000-01-01", notes }) });
}
async function withingsToken(extra: Record<string, string>) {
  const body = new URLSearchParams({ action: "requesttoken", client_id: WITHINGS_ID, client_secret: WITHINGS_SECRET, ...extra });
  const r = await fetch("https://wbsapi.withings.net/v2/oauth2", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json(); if (j.status !== 0) throw new Error("Withings token error: " + (j.error || j.status)); return j.body;
}
function r1(n: number) { return Math.round(n * 10) / 10; }
function withingsAuthUrl(userId: string) {
  if (!WITHINGS_ID) return { error: "Withings client id not set on the server yet." };
  const url = `https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id=${encodeURIComponent(WITHINGS_ID)}&scope=user.metrics&redirect_uri=${encodeURIComponent(WITHINGS_REDIRECT)}&state=${encodeURIComponent(userId || "mifuyu")}`;
  return { url };
}
async function withingsStatus(userId: string) {
  const n = await sbGetNotes(userId); const w = n.withings || {};
  return { connected: !!w.refresh_token, lastSync: w.lastSync || null };
}
function mapWithings(body: any) {
  const byDate: Record<string, any> = {};
  (body.measuregrps || []).forEach((g: any) => {
    const ds = new Intl.DateTimeFormat("en-CA", { timeZone: REMIND_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(g.date * 1000));
    const e = byDate[ds] || { date: ds }; const v: Record<number, number> = {};
    (g.measures || []).forEach((mm: any) => { v[mm.type] = mm.value * Math.pow(10, mm.unit); });
    if (v[1] != null) e.w = r1(v[1]);
    if (v[6] != null) e.fat = r1(v[6]);
    if (v[76] != null) e.muscle = r1(v[76]);
    if (v[88] != null) e.bone = r1(v[88]);
    if (v[77] != null && v[1]) e.water = r1((v[77] / v[1]) * 100);
    if (v[170] != null) e.visceral = r1(v[170]);
    if (v[11] != null) e.hr = Math.round(v[11]);
    byDate[ds] = e;
  });
  return byDate;
}
async function withingsSync(userId: string) {
  if (!SB_URL || !SB_SERVICE_KEY) return { error: "Supabase service env missing" };
  const notes = await sbGetNotes(userId); const w = notes.withings;
  if (!w || !w.refresh_token) return { error: "Withings isn't connected yet." };
  let access = w.access_token;
  if (!w.expires_at || Date.now() > w.expires_at - 60000) {
    const t = await withingsToken({ grant_type: "refresh_token", refresh_token: w.refresh_token });
    access = t.access_token; w.access_token = t.access_token; w.refresh_token = t.refresh_token; w.expires_at = Date.now() + (t.expires_in * 1000);
  }
  const start = w.lastSync ? (w.lastSync - 2 * 86400) : (Math.floor(Date.now() / 1000) - 90 * 86400);
  const body = new URLSearchParams({ action: "getmeas", meastypes: "1,6,76,77,88,170,11", category: "1", startdate: String(start) });
  const r = await fetch("https://wbsapi.withings.net/measure", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Bearer " + access }, body });
  const j = await r.json(); if (j.status !== 0) return { error: "Withings getmeas error: " + (j.error || j.status) };
  const mapped = mapWithings(j.body);
  const wl = (notes.weightLog || []).slice(); let added = 0;
  Object.values(mapped).forEach((e: any) => { const i = wl.findIndex((x: any) => x.date === e.date); if (i >= 0) wl[i] = { ...wl[i], ...e }; else { wl.push(e); added++; } });
  wl.sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  notes.weightLog = wl; w.lastSync = Math.floor(Date.now() / 1000); notes.withings = w;
  await sbSaveNotes(userId, notes);
  return { ok: true, days: Object.keys(mapped).length, added };
}

// ===================== router =====================
Deno.serve(async (req) => {
  // Withings OAuth callback (GET) — exchange the code, store tokens, bounce back to the app
  if (req.method === "GET") {
    const u = new URL(req.url);
    if (u.searchParams.get("withings") === "callback") {
      const code = u.searchParams.get("code") || ""; const state = u.searchParams.get("state") || "mifuyu";
      try {
        const t = await withingsToken({ grant_type: "authorization_code", code, redirect_uri: WITHINGS_REDIRECT });
        const notes = await sbGetNotes(state);
        notes.withings = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000, userid: t.userid, lastSync: 0 };
        await sbSaveNotes(state, notes);
        return new Response(null, { status: 302, headers: { ...cors, Location: SITE_URL + "?withings=ok" } });
      } catch (e) {
        return new Response(null, { status: 302, headers: { ...cors, Location: SITE_URL + "?withings=err" } });
      }
    }
    return new Response("ok", { headers: cors });
  }
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
    if (mode === "journalWrite") return json(await journalWrite(input));
    if (mode === "withingsAuthUrl") return json(withingsAuthUrl(body.userId));
    if (mode === "withingsStatus") return json(await withingsStatus(body.userId || "mifuyu"));
    if (mode === "withingsSync") return json(await withingsSync(body.userId || "mifuyu"));
    if (mode === "food") return json(await foodMode(input));
    if (mode === "digest") return json(await digestMode(input));
    if (mode === "thumbnail") return json(await thumbnail(input));
    if (mode === "channelSnapshot") return json(await channelSnapshot(input));
    return json({ error: "Unknown mode: " + mode }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});
