$ErrorActionPreference = "Stop"

$repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$suffix = [string][char]0x041F + [char]0x0443 + [char]0x0442 + [char]0x044C
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-io-ps51-" + [guid]::NewGuid().ToString() + "-" + $suffix)

try {
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    $file = Join-Path $root ("instruction-" + $suffix + ".md")
    [System.IO.File]::WriteAllText($file, "safe-read-ok", [System.Text.UTF8Encoding]::new(0))

    $reader = Join-Path $repository "skills\safe-text-io\scripts\read-text.mjs"
    $output = & node $reader -- $file
    if ($LASTEXITCODE -ne 0) { throw "read-text.mjs failed with exit code $LASTEXITCODE" }
    if ($output -ne "safe-read-ok") { throw "unexpected reader output" }

    $target = Join-Path $root "project with spaces"
    [System.IO.Directory]::CreateDirectory($target) | Out-Null
    $deploy = Join-Path $repository "scripts\deploy.mjs"
    $doctor = Join-Path $repository "scripts\doctor.mjs"
    & node $deploy --target $target --profile core | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "deploy failed with exit code $LASTEXITCODE" }
    & node $doctor --target $target | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "doctor failed with exit code $LASTEXITCODE" }
    & node $deploy --target $target --uninstall | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "uninstall failed with exit code $LASTEXITCODE" }

    Write-Output "PowerShell 5.1 smoke passed"
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $resolvedRoot = [System.IO.Path]::GetFullPath($root)
    if ($resolvedRoot.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
        [System.IO.Path]::GetFileName($resolvedRoot).StartsWith("agent-io-ps51-")) {
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
