$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distDirectory = Join-Path $projectDirectory 'dist'
$packageDirectory = Join-Path $distDirectory 'extension'
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeBin = if ($nodeCmd) { 'node' } elseif (Test-Path "C:\Users\LeManh\AppData\Local\OpenAI\Codex\runtimes\cua_node\cfb32733c877621e\bin\node.exe") { "C:\Users\LeManh\AppData\Local\OpenAI\Codex\runtimes\cua_node\cfb32733c877621e\bin\node.exe" } else { throw 'Node.js not found' }
& $nodeBin (Join-Path $PSScriptRoot 'build-extension.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Extension build failed' }
$manifestVersion = (Get-Content -LiteralPath (Join-Path $projectDirectory 'extension/manifest.json') -Raw | ConvertFrom-Json).version
$packageFiles = @('manifest.json','copilot_main.js','copilot_panel.js','geometry_math.js','cvat_adapter.js','main_world_bridge.js','content_script.js','shortcut_settings.js','styles.css','session_transport.js','session_worker.js','session.html','session.css','session.js','batch_math.js','batch_cloud.js','batch_controller.js','batch_ui.js','THIRD_PARTY_LICENSES.txt','cvat_annotations.py','update_service.js','update_client.js','updater_setup.html','updater_setup.js')
foreach ($packageFile in $packageFiles) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory ('extension/' + $packageFile)) -Destination (Join-Path $packageDirectory $packageFile) -Force
}
$archiveFiles = $packageFiles | ForEach-Object { Join-Path $packageDirectory $_ }
Compress-Archive -LiteralPath $archiveFiles -DestinationPath (Join-Path $distDirectory ('CVAT-3D-Tool-Extension-' + $manifestVersion + '.zip')) -Force
Write-Output ('Packaged extension ' + $manifestVersion + ' (no cached job or credentials).')
$updaterDirectory = Join-Path $distDirectory 'windows-updater'
New-Item -ItemType Directory -Path $updaterDirectory -Force | Out-Null
foreach ($updaterFile in @('updater.py','install.ps1','README.md')) {
    Copy-Item -LiteralPath (Join-Path $projectDirectory ('updater/' + $updaterFile)) -Destination (Join-Path $updaterDirectory $updaterFile) -Force
}
$bootstrapDirectory = Join-Path $updaterDirectory 'extension'
New-Item -ItemType Directory -Path $bootstrapDirectory -Force | Out-Null
foreach ($packageFile in $packageFiles) { Copy-Item -LiteralPath (Join-Path $packageDirectory $packageFile) -Destination (Join-Path $bootstrapDirectory $packageFile) -Force }
$unexpectedBootstrapFiles = @(Get-ChildItem -LiteralPath $bootstrapDirectory -Force | Where-Object { $_.PSIsContainer -or $_.Name -notin $packageFiles })
if ($unexpectedBootstrapFiles.Count) { throw 'Unexpected files in updater bootstrap build directory; inspect before packaging.' }
Compress-Archive -LiteralPath @((Join-Path $updaterDirectory 'updater.py'),(Join-Path $updaterDirectory 'install.ps1'),(Join-Path $updaterDirectory 'README.md'),$bootstrapDirectory) -DestinationPath (Join-Path $distDirectory 'CVAT-3D-Tool-Updater-Windows.zip') -Force
$releaseArchives = @((Join-Path $distDirectory ('CVAT-3D-Tool-Extension-' + $manifestVersion + '.zip')),(Join-Path $distDirectory 'CVAT-3D-Tool-Updater-Windows.zip'))
$checksumLines = foreach ($releaseArchive in $releaseArchives) {
    $archiveHasher = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($archiveHasher.ComputeHash([IO.File]::ReadAllBytes($releaseArchive)))).Replace('-','').ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($releaseArchive) }
    finally { $archiveHasher.Dispose() }
}
$checksumLines | Set-Content -LiteralPath (Join-Path $distDirectory 'SHA256SUMS.txt') -Encoding ASCII
Write-Output 'Packaged Windows updater and SHA256SUMS.txt for GitHub Release.'
