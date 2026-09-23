<#
    নাস্তা অর্ডার — পুরো ডেটাবেজের ব্যাকআপ নিজের পিসিতে নামিয়ে রাখে।

    কেন এটা দরকার হলো
    -----------------
    ২৩ সেপ্টেম্বর ২০২৬-এ দেখা গেল ১৭ তারিখের আগের ২৮টা অর্ডার আর ৩ জন ইউজারের
    পুরো হিসাব ডেটাবেজ থেকে নেই — আর ফেরানোর কোনো উপায় ছিল না। MonsterASP-র
    ফ্রি প্ল্যানে DB ব্যাকআপ নেই, IIS-র রিকোয়েস্ট লগও রাখা হয় না।

    ফাইলটা গিটে রাখা হয় না — ইচ্ছে করেই
    ------------------------------------
    itsrahat62/Nasta-Pani রিপোজিটরিটা পাবলিক। ব্যাকআপে সবার নাম, PIN, তলা আর
    টাকার পুরো হিসাব থাকে। ওটা পাবলিক রিপোতে (বা GitHub Actions artifact-এ)
    রাখলে যে কেউ নামিয়ে নিতে পারবে। তাই ব্যাকআপ শুধু আপনার নিজের কাছে থাকে।

    কীভাবে চালাবেন
    --------------
        .\backup-nasta.ps1                       # ডিফল্ট ফোল্ডারে রাখবে
        .\backup-nasta.ps1 -OutDir "E:\NastaBackup"
        .\backup-nasta.ps1 -Pin admin -Password '...'   # নইলে জিজ্ঞেস করবে

    রোজ নিজে থেকে চলুক (Task Scheduler)
    -----------------------------------
    পাসওয়ার্ড যাতে টাস্কে লেখা না থাকে, সেজন্য একবার -SavePassword দিয়ে চালান —
    পাসওয়ার্ডটা শুধু এই উইন্ডোজ ইউজারের জন্য এনক্রিপ্ট হয়ে
    %LOCALAPPDATA%\NastaOrder\admin.cred-এ জমা থাকবে (DPAPI, অন্য কেউ পড়তে পারবে না):

        .\backup-nasta.ps1 -SavePassword

    তারপর রোজ সকাল ১০টায় চালানোর টাস্ক:

        schtasks /create /tn "Nasta DB Backup" /sc daily /st 10:00 ^
          /tr "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Users\PC01\AndroidStudioProjects\NastaOrder\tools\backup-nasta.ps1\""

    ফেরানো লাগলে
    ------------
    ফাইলটা JSON — প্রতিটা টেবিল আলাদা তালিকা। কোন সারি হারিয়েছে সেটা মিলিয়ে
    দেখে আবার বসানো যায়। টাকার সারি নতুন করে বসানোর সময় "সমন্বয়" নয়, আসল
    type/amount/created_at দিয়েই বসাবেন, নইলে তারিখের ক্রম নষ্ট হবে।
#>

[CmdletBinding()]
param(
    [string] $Site = "https://nastapani.runasp.net",
    [string] $Pin = "admin",
    [string] $Password,
    [string] $OutDir = "$env:USERPROFILE\NastaOrder-Backup",
    [int]    $KeepDays = 120,
    [switch] $SavePassword
)

$ErrorActionPreference = "Stop"
$credFile = Join-Path $env:LOCALAPPDATA "NastaOrder\admin.cred"

# ---- পাসওয়ার্ড: প্যারামিটার → সেভ করা ফাইল → জিজ্ঞেস করা
if ($SavePassword) {
    $sec = Read-Host "অ্যাডমিন পাসওয়ার্ড (শুধু এই পিসিতে এনক্রিপ্ট হয়ে জমা থাকবে)" -AsSecureString
    New-Item -ItemType Directory -Force -Path (Split-Path $credFile) | Out-Null
    ConvertFrom-SecureString $sec | Set-Content -Path $credFile -Encoding utf8
    Write-Host "পাসওয়ার্ড জমা রাখা হলো: $credFile" -ForegroundColor Green
    Write-Host "এখন প্যারামিটার ছাড়াই স্ক্রিপ্টটা চলবে।"
    return
}

if (-not $Password) {
    if (Test-Path $credFile) {
        $sec = ConvertTo-SecureString (Get-Content $credFile -Raw)
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    } else {
        $sec = Read-Host "অ্যাডমিন পাসওয়ার্ড" -AsSecureString
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---- লগইন (কুকি ধরে রাখা হয়)
$session = $null
$body = @{ pin = $Pin; password = $Password } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$Site/api/login" -Method Post -Body $body `
        -ContentType "application/json" -SessionVariable session | Out-Null
} catch {
    throw "লগইন হলো না — PIN বা পাসওয়ার্ড মিলছে না? ($($_.Exception.Message))"
}

# ---- ব্যাকআপ নামানো
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$out = Join-Path $OutDir "nasta-backup-$stamp.json"
Invoke-WebRequest -Uri "$Site/api/backup" -WebSession $session -OutFile $out | Out-Null

# ---- যা নামল সেটা সত্যিই ঠিক আছে কি না যাচাই (খালি/ভাঙা ফাইল রাখার মানে নেই)
$data = Get-Content $out -Raw | ConvertFrom-Json
$counts = [ordered]@{
    ইউজার   = $data.users.Count
    দোকান   = $data.shops.Count
    আইটেম   = $data.items.Count
    অর্ডার   = $data.orders.Count
    'অর্ডার লাইন' = $data.order_lines.Count
    'টাকার সারি'  = $data.ledger.Count
}
if ($data.users.Count -lt 1 -or $null -eq $data.taken_at) {
    Remove-Item $out -Force
    throw "ব্যাকআপটা খালি বা ভাঙা — ফাইলটা রাখা হলো না।"
}

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "`nব্যাকআপ হয়ে গেছে ✅  $out  ($kb KB)" -ForegroundColor Green
Write-Host "সময়: $($data.taken_at)"
$counts.GetEnumerator() | ForEach-Object { "  {0,-12} {1}" -f $_.Key, $_.Value }

# ---- পুরোনো ফাইল সরানো
$old = Get-ChildItem $OutDir -Filter "nasta-backup-*.json" |
       Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) }
if ($old) {
    $old | Remove-Item -Force
    Write-Host "$($old.Count) টা পুরোনো ব্যাকআপ ($KeepDays দিনের বেশি) সরানো হলো"
}
