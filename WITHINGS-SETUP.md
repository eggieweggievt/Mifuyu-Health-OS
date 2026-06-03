# ⚖️ Withings Body Smart — connect your scale

Once you have Withings API access, this links the scale so every weigh-in (weight, BMI, body fat %, muscle, bone, body water %, visceral fat, heart rate) flows straight into the Weight tab — and into Kiko's journal write-ups. Until then, you can log all the same metrics by hand under **Weight → Body Smart metrics → Log metrics by hand**.

## Step 1 — Create your Withings app

1. Go to https://developer.withings.com and sign in, then create a **public** application (request "Withings API" / production access if prompted — this is the part you're waiting on).
2. You'll get a **Client ID** and **Client Secret**.
3. Set the app's **Callback URI** to exactly:
   ```
   https://ahneitzrgiwjufqyzttl.supabase.co/functions/v1/ai?withings=callback
   ```
4. Scope needed: **user.metrics**.

## Step 2 — Add the keys + redeploy

Run **`deploy-ai.ps1`** again. After the Claude/YouTube/Resend prompts it now asks for the **Withings Client ID** and **Client Secret** — paste them. It saves them as Supabase secrets (`WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`, `SITE_URL`) and redeploys the function. `SUPABASE_URL` and the service key are injected automatically.

## Step 3 — Link it from the app

1. Open the live site → **Weight** tab → **📊 Body Smart metrics** → **🔗 Connect Withings**.
2. A Withings page opens — log in and approve access.
3. It bounces you back to Mifuyu Health OS and automatically pulls the last ~90 days of measurements. After that, tap **↻ Sync from scale** anytime (it only fetches what's new).

## What gets tracked

The scale's measures are mapped like so → your weight entries: weight (kg), body fat %, muscle mass (kg), bone mass (kg), body water % (from hydration ÷ weight), visceral fat, and heart rate. BMI is computed from weight + the height you set in the manual-entry box. Everything shows as tiles in the Body Smart card with day-over-day deltas, feeds the weight trend, and is available to the daily journal write-up.

## Notes

- One entry per day: a sync (or a manual save) merges into that day's row, so re-syncing won't create duplicates.
- The scale tokens are stored in your own Supabase row (used only by the server function to fetch your data). To unlink, clear the `withings` object from your sentinel row, or revoke access in your Withings account settings.
- Want auto-sync each morning without opening the app? You can reuse the reminder cron — add a second `cron.schedule` that POSTs `{"mode":"withingsSync","userId":"mifuyu"}` to the same function URL. Ask me and I'll wire it in.
