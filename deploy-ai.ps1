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
Write-Host "Open https://supabase.com/dashboard/account/tokens and generate a token." -ForegroundColor Cyan
$token = Read-Host "Paste your Supabase access token (starts with sbp_)"
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "No token entered. Run again with a token." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"; exit 1
}
$env:SUPABASE_ACCESS_TOKEN = $token.Trim()

# 3) Collect the keys (typed into YOUR terminal; sent only to YOUR Supabase project).
Write-Host ""
Write-Host "Paste your keys. They are stored as Supabase secrets - never saved to a file." -ForegroundColor Magenta
$anthropic = Read-Host "Claude (Anthropic) API key  [sk-ant-...]"
$youtube   = Read-Host "YouTube Data API key"

if ([string]::IsNullOrWhiteSpace($anthropic) -or [string]::IsNullOrWhiteSpace($youtube)) {
  Write-Host "Both keys are needed. Run again when you have them." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"; exit 1
}

# Optional: Resend key for EMAIL reminders (leave blank to skip - browser reminders still work).
Write-Host ""
Write-Host "Optional - email reminders. Get a free key at https://resend.com (API Keys)." -ForegroundColor Magenta
$resend = Read-Host "Resend API key  [re_...]  (press Enter to skip)"

# 4) Store secrets + deploy the function (both use $env:SUPABASE_ACCESS_TOKEN).
Write-Host "Saving secrets to your Supabase project..." -ForegroundColor Cyan
supabase secrets set "ANTHROPIC_API_KEY=$anthropic" "YOUTUBE_API_KEY=$youtube" "YT_HANDLE=@mifuyu" --project-ref $ProjectRef
if (-not [string]::IsNullOrWhiteSpace($resend)) {
  supabase secrets set "RESEND_API_KEY=$($resend.Trim())" --project-ref $ProjectRef
  Write-Host "Resend key saved - finish email setup with REMINDERS-EMAIL-SETUP.md (schedule the daily cron)." -ForegroundColor Green
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
