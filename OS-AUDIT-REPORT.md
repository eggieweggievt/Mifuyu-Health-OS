# Mifuyu Health OS — Full Audit (2026-06-10)

Scope: every file in this folder — index.html (4,053 lines), sw.js, setup.sql, the Edge Function, deploy scripts, docs, assets, and the git repo state. Findings verified against the actual code, not guessed.

> ⚠️ This file is gitignored on purpose — it describes security weaknesses and must never be pushed to the public repo.

---

## 🔴 Critical — security & privacy

**1. Mifu's real health data is publicly readable AND writable by anyone.**
`setup.sql` creates RLS policies that allow `anon` to select/insert/update/delete with `using(true)`, and the project URL + publishable key sit in `index.html` (line 406–407) in a **public** GitHub repo. Anyone who views source can read or delete the entire weight log, cycle history, journal entries, tasks, and push subscriptions, or subscribe their own device. The SQL file itself documents the fix ("PRIVACY UPGRADE PATH"): enable Supabase Auth and scope policies to `auth.uid()`. This is the most important item in this report.

**2. The AI Edge Function is open to the internet.**
Deployed with `--no-verify-jwt`, CORS `*`, no shared secret. Anyone can POST `{"mode":"agent",...}` to `https://ahneitzrgiwjufqyzttl.supabase.co/functions/v1/ai` and burn your Anthropic credits (and read the data summaries the agent mode returns). Fix: check a secret header (or Supabase auth token) inside the function before doing any work.

**3. Rotate the Anthropic API key.**
`deploy-ai.ps1` (line 102) reminds you it was pasted into a chat once and should be regenerated — it's still live in `.mifu-secrets.json`. Also consider HTTP-referrer-