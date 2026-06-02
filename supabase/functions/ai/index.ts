// =====================================================================
//  Mifuyu Health OS — "ai" Edge Function (powers the Optimize tab)
//  Anthropic (Claude) + YouTube keys live here as SERVER-SIDE secrets.
//  They are NEVER sent to the browser or committed to the repo.
//  Deploy:   supabase functions deploy ai --no-verify-jwt
//  Secrets:  ANTHROPIC_API_KEY, YOUTUBE_API_KEY, YT_HANDLE, AI_MODEL
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
const MODEL = Deno.env.get("AI_MODEL") || "claude-3-5-haiku-latest";

// Mifu's brand + her ACTUAL stream-title style (learned from her Twitch titles).
const BRAND =
  "You are Mifuyu (Mifu), a cozy, sweet, slightly chaotic VTuber and snowfox shrine maiden. " +
  "You stream story-rich anime-style gacha games (Genshin, Zenless Zone Zero, Honkai Star Rail, Wuthering Waves, " +
  "NTE, Nikke, Arknights), plus watchalongs, cover songs and cozy hand-cam streams. Audience: 18-34, into " +
  "gaming/anime/cozy lifestyle. Tone: warm, cute, welcoming, high-energy but never mean or clickbait-y.";

// Real examples of her titles so generated ones match her voice exactly:
const TITLE_STYLE =
  "Her livestream title style, study it closely:\n" +
  "- \"❄️ BACK FROM TWITCHCON !! Let's yap and play some gamus together~ | !discord !gg !lootbar ❄️\"\n" +
  "- \"DROPS ✨ WUWA STORY + LIVESTREAM WATCHALONG BEFORE TWITCHCON EU !!! | !discord !gg !lootbar ❄️\"\n" +
  "- \"DROPS ✨ NTE GRIND AND CHARACTER BUILDS !! Let's play some gamus and do our Dailies together! ^o^ | !discord !gg !lootbar ❄️\"\n" +
  "- \"✨ FINISHING NIKKE CHAPTER 46 & WATCHING NEVERNESS TO EVERNESS 1.1 !! | !discord !gg !lootbar ❄️\"\n" +
  "- \"✨ REACTFUYU & CHILL !! ✨ Watching recommendations from Chatto and my Manager Eggie !! | !discord !gg !lootbar ❄️\"\n" +
  "- \"🌊 SUBNAUTICA 2 IS FINALLY HERE !!! WE'VE WAITED SO LONG AAAA 🌊 Joined by my mod @xelitematrix !! | !discord !gg !lootbar ❄️\"\n" +
  "Rules: bookend with a theme emoji (default ❄️; match the game's vibe, e.g. 🌊 water, 🔥 action). " +
  "MAIN GAME/TOPIC IN CAPS. Lots of energy (!!). Often 'Let's ... together'. She says 'gamus' for games sometimes. " +
  "End livestream titles with ' | !discord !gg !lootbar ❄️'. Occasional kaomoji (^o^, ~). " +
  "Add 'DROPS ✨' prefix ONLY if the user says drops are active.";

const LINK_FOOTER =
  "\n\n🔗 Find me everywhere:\n" +
  "▸ Twitch: https://twitch.tv/mifuyu\n" +
  "▸ YouTube: https://youtube.com/@mifuyu\n" +
  "▸ Discord: https://discord.gg/mifuyu\n" +
  "▸ X / TikTok / Instagram: @mifuyuvt\n\n" +
  "💜 GamerSupps — code MIFUYU for 10% off: https://gamersupps.gg/mifuyu";

async function youtubeChannel() {
  if (!YT_KEY) throw new Error("YouTube key isn't set on the server.");
  const h = HANDLE.replace(/^@/, "");
  const cRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails,snippet&forHandle=@${h}&key=${YT_KEY}`,
  );
  const cJson = await cRes.json();
  const ch = cJson.items && cJson.items[0];
  if (!ch) throw new Error("Couldn't find the YouTube channel for " + HANDLE);
  const subs = Number(ch.statistics?.subscriberCount || 0);
  const views = Number(ch.statistics?.viewCount || 0);
  const videos = Number(ch.statistics?.videoCount || 0);
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  let recent: Array<{ title: string; views: number }> = [];
  try {
    if (uploads) {
      const pRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${uploads}&key=${YT_KEY}`,
      );
      const pJson = await pRes.json();
      const ids = (pJson.items || []).map((i: any) => i.contentDetails.videoId).join(",");
      if (ids) {
        const vRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${YT_KEY}`,
        );
        const vJson = await vRes.json();
        recent = (vJson.items || []).map((v: any) => ({
          title: v.snippet?.title || "(untitled)",
          views: Number(v.statistics?.viewCount || 0),
        }));
      }
    }
  } catch (_) { /* recent videos optional */ }
  return { subs, views, videos, recent };
}

async function claude(messages: any[], maxTokens = 1100): Promise<string> {
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

function parseJSON(text: string): any {
  try { return JSON.parse(text); } catch (_) { /* try to extract */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* */ } }
  return null;
}

async function optimizeVideo(p: any) {
  const user =
    `Optimize this ${p.platform || "YouTube"} ${p.format || "long form"} video for Mifu.\n` +
    `Working title: "${p.title || "(none yet)"}"\n` +
    `What it's about: "${p.about || ""}"\n\n` +
    TITLE_STYLE + "\n\n" +
    `Return ONLY a JSON object with keys:\n` +
    `  "score": number 0-100 rating the working title's strength,\n` +
    `  "scoreNote": one short sentence on why,\n` +
    `  "titles": array of 5 stronger title options in her voice,\n` +
    `  "tags": array of ~10 lowercase YouTube tags,\n` +
    `  "hashtags": { "small": [1 niche hashtag], "medium": [2 mid-size hashtags], "large": [2 big hashtags] },\n` +
    `  "description": a full, ready-to-paste description in her warm voice (2-3 short paragraphs, no links section - that's added automatically).\n` +
    `No text outside the JSON.`;
  const out = parseJSON(await claude([{ role: "user", content: user }]));
  if (!out) throw new Error("Couldn't parse the AI response, try again.");
  out.description = (out.description || "").trim() + LINK_FOOTER;
  return out;
}

async function optimizeStream(p: any) {
  const user =
    `Set up a YouTube/Twitch livestream for Mifu.\n` +
    `Game / focus: "${p.game || ""}"\n` +
    `Anything special: "${p.special || ""}"\n\n` +
    TITLE_STYLE + "\n\n" +
    `Return ONLY a JSON object with keys:\n` +
    `  "titles": array of 5 stream title options in her EXACT style (with the | !discord !gg !lootbar ❄️ ending),\n` +
    `  "tags": array of ~8 lowercase tags,\n` +
    `  "goingLive": a short, excited going-live social post (1-2 lines, her voice, fits X/Discord),\n` +
    `  "description": a ready-to-paste stream description in her warm voice (no links section - added automatically).\n` +
    `No text outside the JSON.`;
  const out = parseJSON(await claude([{ role: "user", content: user }]));
  if (!out) throw new Error("Couldn't parse the AI response, try again.");
  out.description = (out.description || "").trim() + LINK_FOOTER;
  return out;
}

async function thumbnailRead(p: any) {
  if (!p.image) throw new Error("No thumbnail image received.");
  const m = String(p.image).match(/^data:(image\/\w+);base64,(.*)$/);
  if (!m) throw new Error("Thumbnail image format not recognized.");
  const media_type = m[1], data = m[2];
  const text =
    `This is a ${p.kind === "stream" ? "stream/VOD" : "video"} thumbnail for Mifu (cozy snowfox VTuber). ` +
    `Give a short, kind, practical "click-potential read": what works, what could be clearer at small sizes, ` +
    `and 2-3 specific tweaks. Keep it warm and encouraging, ~120 words.`;
  const reply = await claude([{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type, data } },
      { type: "text", text },
    ],
  }], 500);
  return { read: reply.trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const mode = body.mode;
    if (mode === "channel") return json(await youtubeChannel());
    if (mode === "video") return json(await optimizeVideo(body));
    if (mode === "stream") return json(await optimizeStream(body));
    if (mode === "thumbnail") return json(await thumbnailRead(body));
    return json({ error: "Unknown mode" }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});
