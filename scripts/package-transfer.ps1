param([string]$Date = '20261014')
$ErrorActionPreference = 'Stop'
if ($Date -notmatch '^\d{8}$') { throw 'Date must be YYYYMMDD.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $paths = @(git -c core.quotepath=false ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
    $paths = @($paths | Where-Object { $_ -notmatch '^transfer/' -and $_ -notmatch '\.zip$' })
    if ($paths.Count -eq 0) { throw 'No tracked files.' }
    foreach ($path in $paths) {
        if ($path -match '(^|/)(\.git|node_modules|\.tooling|artifacts|dist-mobile|\.gradle|build)(/|$)' -or
            $path -match '(^|/)\.env($|\.)' -and $path -notmatch '(^|/)\.env\.example$' -or
            $path -match '\.(jks|keystore|apk|ipa)$' -or $path -match '(^|/)local\.properties$') {
            throw "Excluded or secret file is tracked: $path"
        }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing tracked file: $path" }
    }
    $outDir = Join-Path $projectRoot 'transfer'
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $zipPath = Join-Path $outDir "어디가지_작업이전_$Date.zip"
    if (Test-Path -LiteralPath $zipPath) { throw "Output already exists: $zipPath" }
    Add-Type -AssemblyName System.IO.Compression
    $archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    $manifest = @()
    try {
        foreach ($path in $paths) {
            $absolute = Join-Path $projectRoot $path
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $absolute, "eodigaji-app/$path", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            $manifest += [ordered]@{ path = $path; sha256 = (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant() }
        }
        $revision = git rev-parse HEAD
        $changes = @(git -c core.quotepath=false status --short)
        $metadata = @{
            'SOURCE-REVISION.txt' = "Base commit: $revision`nWorking tree changes included:`n$($changes -join "`n")`nArchive excludes transfer/ and ZIP files.`n"
            'TRANSFER-MANIFEST.json' = ($manifest | ConvertTo-Json -Depth 4)
        }
        foreach ($name in $metadata.Keys) {
            $entry = $archive.CreateEntry("eodigaji-app/$name")
            $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
            try { $writer.Write($metadata[$name]) } finally { $writer.Dispose() }
        }
    } finally { $archive.Dispose() }
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        if ($archive.Entries.Count -ne $paths.Count + 2) { throw 'Archive file count mismatch.' }
        foreach ($item in $manifest) {
            $entry = $archive.GetEntry("eodigaji-app/$($item.path)")
            if ($null -eq $entry) { throw "Archive missing: $($item.path)" }
            $stream = $entry.Open()
            $hasher = [System.Security.Cryptography.SHA256]::Create()
            try { $hash = [Convert]::ToHexString($hasher.ComputeHash($stream)).ToLowerInvariant() }
            finally { $stream.Dispose(); $hasher.Dispose() }
            if ($hash -ne $item.sha256) { throw "Hash mismatch: $($item.path)" }
        }
    } finally { $archive.Dispose() }
    Write-Output "Verified $($paths.Count) source files plus two metadata files."
    Get-Item -LiteralPath $zipPath | Select-Object FullName, Length
    Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
} finally { Pop-Location }
