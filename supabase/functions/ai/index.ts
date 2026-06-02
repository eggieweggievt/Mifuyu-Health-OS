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

// ===================== router =====================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const mode = body.mode, input = body.input || {}, vidiq = body.vidiq;
    if (mode === "optimize") return json(await optimize(input, vidiq));
    if (mode === "analyze") return json(await analyze(input, vidiq));
    if (mode === "ask") return json(await ask(input));
    if (mode === "thumbnail") return json(await thumbnail(input));
    if (mode === "channelSnapshot") return json(await channelSnapshot(input));
    return json({ error: "Unknown mode: " + mode }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});
