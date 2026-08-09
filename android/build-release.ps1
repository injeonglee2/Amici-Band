$ErrorActionPreference = 'Stop'

$packageRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\Google Play package')
$infoPath = Join-Path $packageRoot 'signing-key-info.txt'
$keyPath = Join-Path $packageRoot 'signing.keystore'

if (-not (Test-Path -LiteralPath $infoPath) -or -not (Test-Path -LiteralPath $keyPath)) {
    throw 'Google Play package 폴더에서 signing-key-info.txt 또는 signing.keystore를 찾지 못했습니다.'
}

$lines = Get-Content -LiteralPath $infoPath
function Read-SigningValue([string]$label) {
    $line = $lines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($label) + '\s*[:=]') } | Select-Object -First 1
    if (-not $line) { throw "서명 정보에서 '$label' 항목을 찾지 못했습니다." }
    return ($line -replace ('^\s*' + [regex]::Escape($label) + '\s*[:=]\s*'), '').Trim()
}

$env:AMICI_KEYSTORE_FILE = $keyPath
$env:AMICI_KEYSTORE_PASSWORD = Read-SigningValue 'Key store password'
$env:AMICI_KEY_ALIAS = Read-SigningValue 'Key alias'
$env:AMICI_KEY_PASSWORD = Read-SigningValue 'Key password'

Push-Location $PSScriptRoot
try {
    & .\gradlew.bat assembleRelease bundleRelease
    if ($LASTEXITCODE -ne 0) { throw "Android 빌드 실패 (exit $LASTEXITCODE)" }
    Write-Host 'APK: app\build\outputs\apk\release\app-release.apk'
    Write-Host 'AAB: app\build\outputs\bundle\release\app-release.aab'
} finally {
    Pop-Location
    Remove-Item Env:\AMICI_KEYSTORE_FILE -ErrorAction SilentlyContinue
    Remove-Item Env:\AMICI_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\AMICI_KEY_ALIAS -ErrorAction SilentlyContinue
    Remove-Item Env:\AMICI_KEY_PASSWORD -ErrorAction SilentlyContinue
}
