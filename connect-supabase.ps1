# =====================================================================
#  connect-supabase.ps1  —  Wire your Supabase project into Mifuyu
#  Health OS and re-publish to GitHub Pages.  (run on Windows)
#
#  DO THIS FIRST (one time, in your browser - takes ~2 minutes):
#    1. Go to https://supabase.com  ->  sign in (you can use GitHub).
#    2. "New project". Name it (e.g. mifuyu-health), set a database
#       password (save it somewhere), pick a region, click Create.
#       Wait ~2 min for it to finish setting up.
#    3. Left sidebar -> SQL Editor -> New query. Open setup.sql from
#       this folder, copy ALL of it, paste, and click Run.
#       (It should say success - that builds your data table.)
#    4. Left sidebar -> Project Settings (gear) -> Data API / API Keys.
#       Copy these two things:
#          * Project URL   (looks like  https://abcd1234.supabase.co )
#          * Publishable / anon key  (starts with  sb_publishable_  or  eyJ... )
#
#  THEN run this script:  right-click -> Run with PowerShell
#  (or:  Set-ExecutionPolicy -Scope Process Bypass ; .\connect-supabase.ps1 )
#  Paste the two values when asked. Done.
# =====================================================================

Set-Location -Path $PSScriptRoot
Write-Host ""
Write-Host "Connect Mifuyu Health OS to Supabase" -ForegroundColor Magenta
Write-Host ""

# --- collect the two values ---
$Url = Read-Host "Paste your Supabase Project URL"
$Key = Read-Host "Paste your Supabase publishable/anon key"

$Url = $Url.Trim()
$Key = $Key.Trim()

if ($Url -notmatch '^https://.*\.supabase\.co/?$') {
  Write-Host "Hmm, that URL doesn't look like a Supabase URL (https://....supabase.co)." -ForegroundColor Yellow
  Write-Host "Double-check and run the script again." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"; exit 1
}
$Url = $Url.TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($Key)) {
  Write-Host "No key entered. Run again and paste the publishable/anon key." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"; exit 1
}

# --- patch index.html CONFIG ---
$file = Join-Path $PSScriptRoot "index.html"
# Read as UTF-8 explicitly (avoids mangling emoji / special characters)
$html = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

$before = $html
$html = [regex]::Replace($html, '(url:\s*)"[^"]*"(,\s*//\s*Supabase project URL)', ('${1}"' + $Url + '"${2}'))
$html = [regex]::Replace($html, '(anonKey:\s*)"[^"]*"(,\s*//\s*sb_publishable)', ('${1}"' + $Key + '"${2}'))

if ($html -eq $before) {
  Write-Host "Couldn't find the CONFIG spots to update in index.html." -ForegroundColor Red
  Write-Host "Make sure you're running this in the project folder. No changes made." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}

# Write as UTF-8 WITHOUT a BOM (keeps emoji intact, no encoding corruption)
[System.IO.File]::WriteAllText($file, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "index.html updated with your Supabase URL + key." -ForegroundColor Green

# --- publish ---
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Host "git isn't on your PATH, so I can't auto-publish." -ForegroundColor Yellow
  Write-Host "Run publish.ps1, or upload index.html to GitHub manually." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"; exit 0
}

Write-Host "Publishing the update to GitHub Pages..." -ForegroundColor Cyan
git add index.html
git commit -m "Connect Supabase (live mode)" 2>$null | Out-Null
git push 2>$null
if ($LASTEXITCODE -ne 0) {
  # remote may not be wired up yet - fall back to publish.ps1's flow
  git push -u origin main
}

Write-Host ""
Write-Host "All set!  Your app is now in LIVE mode." -ForegroundColor Green
Write-Host "Give GitHub ~1-2 minutes, then open:" -ForegroundColor Green
Write-Host "    https://eggieweggievt.github.io/Mifuyu-Health-OS/" -ForegroundColor White
Write-Host "The status chip top-right should change from 'demo data' to 'live'." -ForegroundColor Green
Write-Host ""
Write-Host "(Your data now saves to Supabase. The publishable key is safe to be"
Write-Host " public - that's what it's designed for, and your setup.sql row-level"
Write-Host " security keeps the table locked to this app.)"
Read-Host "Press Enter to close"
