# =====================================================================
#  deploy-ai.ps1  —  Deploy the Optimize tab's AI helper (Edge Function)
#  Your Claude + YouTube keys go straight into your Supabase project as
#  SECRETS. They never get written to a file or committed to GitHub.
#
#  RUN:  right-click -> Run with PowerShell
#  (or:  Set-ExecutionPolicy -Scope Process Bypass ; .\deploy-ai.ps1 )
# =====================================================================

Set-Location -Path $PSScriptRoot
$ProjectRef = "ahneitzrgiwjufqyzttl"   # your Supabase project ref (the part before .supabase.co)

Write-Host ""
Write-Host "Deploy the Optimize AI helper" -ForegroundColor Magenta
Write-Host ""

# 1) Need the Supabase CLI.
$sb = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $sb) {
  Write-Host "The Supabase CLI isn't installed. Install it, then re-run this:" -ForegroundColor Yellow
  Write-Host "    winget install --id Supabase.CLI" -ForegroundColor Cyan
  Write-Host "(Close & reopen PowerShell after installing.)"
  Read-Host "Press Enter to exit"; exit 1
}

# 2) Auth. We use a Supabase ACCESS TOKEN (not 'supabase login'), because
#    'secrets set' needs the token explicitly - this is what fixes the
#    "Access token not provided" error.
#    Get one (30 seconds): https://supabase.com/dashboard/account/tokens
#    -> "Generate new token" -> copy it.
# Reuse a saved token if we have one (so you only enter it once, ever).
$tokenFile = Join-Path $PSScriptRoot ".supabase-token"
$token = ""
if (Test-Path $tokenFile) { $token = (Get-Content $tokenFile -Raw).Trim() }
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "Open https://supabase.com/dashboard/account/tokens and generate a token." -ForegroundColor Cyan
  $token = (Read-Host "Paste your Supabase access token (starts with sbp_)").Trim()
  if ([string]::IsNullOrWhiteSpace($token)) { Write-Host "No token entered. Run again with a token." -ForegroundColor Yellow; Read-Host "Press Enter to exit"; exit 1 }
  [System.IO.File]::WriteAllText($tokenFile, $token)
  Write-Host "Token saved to .supabase-token — you won't be asked again." -ForegroundColor Green
}
$env:SUPABASE_ACCESS_TOKEN = $token

# 3) Collect the keys. Your keys are stored ONCE in Supabase and persist — so on later
#    runs you can press Enter to SKIP any key you don't want to change. (For a plain code
#    update with no key changes, just use update-ai.ps1 instead — no prompts at all.)
Write-Host ""
Write-Host "Paste keys to set/replace them. Press Enter to KEEP the one already stored." -ForegroundColor Magenta
$anthropic = Read-Host "Claude (Anthropic) API key  [sk-ant-...]  (Enter = keep existing)"
$youtube   = Read-Host "YouTube Data API key                      (Enter = keep existing)"

# Optional: Resend key for EMAIL reminders (leave blank to skip - browser reminders still work).
Write-Host ""
Write-Host "Optional - email reminders. Get a free key at https://resend.com (API Keys)." -ForegroundColor Magenta
$resend = Read-Host "Resend API key  [re_...]  (press Enter to skip)"

# Optional: Withings (Body Smart scale) API. Create an app at https://developer.withings.com
# and set the callback URL to:  https://ahneitzrgiwjufqyzttl.supabase.co/functions/v1/ai?withings=callback
Write-Host ""
Write-Host "Optional - Withings Body Smart scale. From https://developer.withings.com (your app)." -ForegroundColor Magenta
$withId = Read-Host "Withings Client ID      (press Enter to skip)"
$withSecret = ""
if (-not [string]::IsNullOrWhiteSpace($withId)) { $withSecret = Read-Host "Withings Client Secret" }

# 4) Store ONLY the secrets you actually entered (blank = keep what's already in Supabase).
$pairs = @("YT_HANDLE=@mifuyu")
if (-not [string]::IsNullOrWhiteSpace($anthropic)) { $pairs += "ANTHROPIC_API_KEY=$($anthropic.Trim())" }
if (-not [string]::IsNullOrWhiteSpace($youtube))   { $pairs += "YOUTUBE_API_KEY=$($youtube.Trim())" }
Write-Host "Saving secrets to your Supabase project..." -ForegroundColor Cyan
supabase secrets set @pairs --project-ref $ProjectRef
if (-not [string]::IsNullOrWhiteSpace($resend)) {
  supabase secrets set "RESEND_API_KEY=$($resend.Trim())" --project-ref $ProjectRef
  Write-Host "Resend key saved - finish email setup with REMINDERS-EMAIL-SETUP.md (schedule the daily cron)." -ForegroundColor Green
}
if (-not [string]::IsNullOrWhiteSpace($withId) -and -not [string]::IsNullOrWhiteSpace($withSecret)) {
  supabase secrets set "WITHINGS_CLIENT_ID=$($withId.Trim())" "WITHINGS_CLIENT_SECRET=$($withSecret.Trim())" "SITE_URL=https://eggieweggievt.github.io/Mifuyu-Health-OS/" --project-ref $ProjectRef
  Write-Host "Withings keys saved. In your Withings app, set the callback URL to:" -ForegroundColor Green
  Write-Host "  https://ahneitzrgiwjufqyzttl.supabase.co/functions/v1/ai?withings=callback" -ForegroundColor White
  Write-Host "Then open the Weight tab and tap 'Connect Withings'. (See WITHINGS-SETUP.md)" -ForegroundColor Green
}

Write-Host "Deploying the 'ai' Edge Function..." -ForegroundColor Cyan
# --no-verify-jwt is required because the new publishable keys aren't legacy JWTs.
supabase functions deploy ai --no-verify-jwt --project-ref $ProjectRef

Write-Host ""
Write-Host "Done! The Optimize tab on your live site will now work." -ForegroundColor Green
Write-Host "  https://eggieweggievt.github.io/Mifuyu-Health-OS/  ->  Optimize tab" -ForegroundColor White
Write-Host ""
Write-Host "Reminder: since you pasted the Claude key in chat earlier, regenerate it in"
Write-Host "the Anthropic Console and re-run this script with the fresh key when you can." -ForegroundColor Yellow
Read-Host "Press Enter to close"
