// =====================================================================
//  Mifuyu Health OS — "ai" Edge Function (powers the Optimize tab)
//  The Anthropic (Claude) and YouTube API keys live here as SERVER-SIDE
//  secrets — they are NEVER sent to the browser or committed to the repo.
//  Deploy with:  supabase functions deploy ai --no-verify-jwt
//  Secrets:      ANTHROPIC_API_KEY, YOUTUBE_API_KEY, YT_HANDLE, AI_MODEL
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

const BRAND =
  "You are helping Mifuyu (Mifu), a cozy, sweet, slightly chaotic VTuber and snowfox shrine maiden. " +
  "She streams story-rich anime-style gacha games (Genshin, Zenless Zone Zero, Honkai Star Rail, Arknights), " +
  "plus cover songs and cozy hand-cam streams. Audience: 18-34, into gaming/anime/cozy lifestyle. " +
  "Tone: warm, cute, welcoming, a little playful; light kaomoji are fine. Authentic, never clickbait-y or cringe.";

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
  } catch (_) { /* recent videos are optional */ }
  return { subs, views, videos, recent };
}

async function claudeList(user: string, n: number): Promise<string[]> {
  if (!ANTHROPIC_KEY) throw new Error("Claude key isn't set on the server.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: BRAND,
      messages: [{
        role: "user",
        content: user + `\n\nRespond ONLY with a JSON array of exactly ${n} short strings — no preamble, no extra text.`,
      }],
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "Claude error");
  const text = (j.content && j.content[0] && j.content[0].text) || "[]";
  let arr: string[] = [];
  try { arr = JSON.parse(text); } catch (_) {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch (_) { /* fall through */ } }
  }
  if (!Array.isArray(arr) || !arr.length) {
    arr = String(text).split("\n").map((s) => s.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean);
  }
  return arr.slice(0, n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { mode, input } = await req.json();
    if (mode === "channel") return json(await youtubeChannel());
    if (mode === "titles") {
      const items = await claudeList(
        `Suggest YouTube title options for this video:\n"${input}"\nCozy, curiosity-sparking, true to her vibe.`, 6);
      return json({ items });
    }
    if (mode === "ideas") {
      const items = await claudeList(
        `Suggest gentle video/short content ideas for this theme:\n"${input}"`, 7);
      return json({ items });
    }
    return json({ error: "Unknown mode" }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});
