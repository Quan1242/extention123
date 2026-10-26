param([string]$ExtensionId, [string]$PythonPath)
$ErrorActionPreference = 'Stop'
if (!$PythonPath) { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
if (!(Test-Path -LiteralPath $PythonPath)) { throw 'Python 3.10+ executable not found. Use -PythonPath with its full path.' }
& $PythonPath -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ required.' }
$PythonPath = (& $PythonPath -c 'import sys; print(sys.executable)').Trim()
if (!(Test-Path -LiteralPath $PythonPath)) { throw 'Could not resolve the actual Python runtime.' }
$installRoot = Join-Path $env:LOCALAPPDATA 'CVAT-3D-Tool'
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Managed root must not be a junction/symlink.' }
$target = Join-Path $installRoot 'extension'
if (Test-Path -LiteralPath $target) {
    if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Extension directory must not be a junction/symlink.' }
    if (!(Test-Path -LiteralPath (Join-Path $installRoot 'managed-install.json'))) { throw 'Existing directory is not a managed installation; preserve it and choose a clean install.' }
    Write-Host 'Existing managed extension is preserved. Only updater registration/runtime will be refreshed.'
} else {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'extension') -Destination $target -Recurse
    @{ allowed_origins = @(); installed = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installRoot 'managed-install.json') -Encoding UTF8
}
Write-Host ''
Write-Host '1. In Edge/Chrome Extensions, enable Developer mode and Load unpacked:'
Write-Host $target
Write-Host '2. Disable the old CVAT 3D TOOL copy to avoid two HUDs.'
Write-Host '3. Copy the ID of this managed copy (also shown by HUD > Cai updater).'
if (!$ExtensionId) { $ExtensionId = Read-Host 'Managed extension ID (32 letters a-p)' }
if ($ExtensionId -cnotmatch '^[a-p]{32}$') { throw 'Invalid extension ID. Use the managed copy ID.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'updater.py') -Destination (Join-Path $installRoot 'updater.py') -Force
$wrapper = Join-Path $installRoot 'host.cmd'
$wrapperText = @('@echo off', 'chcp 65001 >nul', ('"' + $PythonPath + '" -u "' + (Join-Path $installRoot 'updater.py') + '" %*')) -join "`r`n"
[IO.File]::WriteAllText($wrapper, $wrapperText + "`r`n", (New-Object Text.UTF8Encoding($false)))
$origin = 'chrome-extension://' + $ExtensionId + '/'
@{ allowed_origins = @($origin); installed = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installRoot 'managed-install.json') -Encoding UTF8
$hostName = 'net.vantix.cvat3dtool.updater'
$hostManifest = Join-Path $installRoot ($hostName + '.json')
@{ name = $hostName; description = 'CVAT 3D TOOL GitHub release updater'; path = $wrapper; type = 'stdio'; allowed_origins = @($origin) } | ConvertTo-Json | Set-Content -LiteralPath $hostManifest -Encoding UTF8
foreach ($browser in @('Microsoft\Edge', 'Google\Chrome')) {
    $registryPath = 'HKCU:\Software\' + $browser + '\NativeMessagingHosts\' + $hostName
    New-Item -Path $registryPath -Force | Out-Null
    Set-Item -LiteralPath $registryPath -Value $hostManifest
}
Write-Host 'Updater installed for this Windows user. No administrator privileges needed.'
Write-Host 'Reload the managed extension, reopen CVAT, and use Reload to check GitHub Releases.'
Write-Host ('Managed files: ' + $installRoot)
