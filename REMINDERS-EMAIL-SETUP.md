# ✉️ Email reminders — one-time setup

Browser pop-up reminders work the moment you publish (no setup). **Email** reminders need three quick steps, because sending email requires a server-side service. Total time: ~5 minutes.

The in-app reminder settings live on the **Calendar tab → 🔔 Reminders** card: turn on **✉️ Email**, type your address, hit **save email**, and pick how far ahead you want nudges.

---

## Step 1 — Get a free Resend API key

1. Go to https://resend.com and sign up (free tier is plenty — 100 emails/day).
2. In the dashboard, open **API Keys → Create API Key**, copy it (starts with `re_…`).
3. *(Testing note:* Resend lets you send from `onboarding@resend.dev` to **your own** account email with no domain setup — perfect for personal reminders. To send to other addresses or use a custom "from", verify a domain in Resend later and set the `RESEND_FROM` secret.)*

## Step 2 — Add the key + redeploy the function

Run **`deploy-ai.ps1`** again. It now asks for the Resend key after the Claude/YouTube keys — paste it (or press Enter to skip). It saves `RESEND_API_KEY` as a Supabase secret and redeploys.

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically by Supabase — you do **not** need to set those.

## Step 3 — Schedule the daily check

In the Supabase dashboard open **SQL Editor**, paste this, and **Run** it once:

```sql
-- enable the schedulers (safe to run repeatedly)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- run every day at 06:00 UTC (~07:00–08:00 CET). Change the time if you like.
select cron.schedule(
  'mifu-daily-reminders',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := 'https://ahneitzrgiwjufqyzttl.supabase.co/functions/v1/ai',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"mode":"remind"}'::jsonb
  );
  $$
);
```

That's it. Each morning the function looks at your calendar events + birthdays, finds anything matching your chosen lead times (same day / 1 day / 3 days / 1 week before), and emails you a tidy list — but only if **✉️ Email** is on and your address is saved.

---

### Handy extras

**Send yourself a test right now** (SQL Editor → Run):
```sql
select net.http_post(
  url     := 'https://ahneitzrgiwjufqyzttl.supabase.co/functions/v1/ai',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body    := '{"mode":"remind"}'::jsonb
);
```
(You'll only get an email if something falls within your lead-time window today.)

**Turn the daily job off:**
```sql
select cron.unschedule('mifu-daily-reminders');
```

**Custom "from" address** (after verifying a domain in Resend) — add a secret:
```
supabase secrets set "RESEND_FROM=Mifuyu <hello@yourdomain.com>" --project-ref ahneitzrgiwjufqyzttl
```

**Timezone of the date math** defaults to `Europe/Amsterdam` (CET). To change it:
```
supabase secrets set "REMIND_TZ=America/New_York" --project-ref ahneitzrgiwjufqyzttl
```
