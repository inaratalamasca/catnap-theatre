#requires -Version 5.1
<#
SCRIPT_VERSION 0.6.0
Change summary: compile an auditable per-user native launcher with built-in
Windows PowerShell/.NET Framework, then register one exact extension origin.
Requires Node.js 22+ already installed; downloads nothing and requires no admin.
#>
[CmdletBinding()]
param(
    [string]$ExtensionId,
    [ValidateSet('chrome','brave','chromium','all')][string]$Browser = 'all',
    # Smoke-test mode builds the launcher/manifest in the caller's temporary
    # LOCALAPPDATA but never writes native-host registrations to HKCU.
    [switch]$NoRegister
)
$ErrorActionPreference = 'Stop'
$SCRIPT_VERSION = '0.6.0'
if ($PSVersionTable.PSEdition -ne 'Desktop') {
    throw 'Run this installer with Windows PowerShell 5.1, not PowerShell 7/pwsh. The supplied .cmd uses the built-in Windows PowerShell.'
}
if (-not $ExtensionId) { $ExtensionId = Read-Host 'Paste the exact Catnap extension ID from your browser extensions page' }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'The extension ID must be exactly 32 lowercase letters a-p.' }
# More than one Node installation can be present on PATH (including hosted CI).
# Get-Command may return an array; use the first resolved executable explicitly.
$nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
$node = $nodeCommand.Source
$nodeMajor = & $node -p 'process.versions.node.split(".")[0]'
if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 22) { throw 'Install Node.js 22 or later first (Node.js 24 LTS is recommended).' }
$sourceDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$destination = Join-Path $env:LOCALAPPDATA 'Catnap-Suno-MCP'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$hostScript = Join-Path $destination 'catnap-suno-host.mjs'
Copy-Item -LiteralPath (Join-Path $sourceDirectory 'catnap-suno-host.mjs') -Destination $hostScript -Force
$launcher = Join-Path $destination 'Catnap.Suno.Launcher.exe'
$template = [IO.File]::ReadAllText((Join-Path $sourceDirectory 'CatnapSunoLauncher.cs'))
$code = $template.Replace('__CATNAP_NODE_PATH__', $node.Replace('"','""')).Replace('__CATNAP_HOST_PATH__', $hostScript.Replace('"','""'))
# Add-Type uses Windows' existing compiler. This produces the launcher locally
# from the supplied source instead of asking the host to trust a downloaded exe.
# Compile to a fresh temporary filename so a failed update leaves the old launcher.
$temporaryLauncher = Join-Path $destination ('Catnap.Suno.Launcher.' + [Guid]::NewGuid().ToString('N') + '.exe')
try {
    Add-Type -TypeDefinition $code -Language CSharp -OutputAssembly $temporaryLauncher -OutputType ConsoleApplication -ReferencedAssemblies @('System.dll','System.Core.dll')
    Move-Item -LiteralPath $temporaryLauncher -Destination $launcher -Force
} finally {
    if (Test-Path -LiteralPath $temporaryLauncher) { Remove-Item -LiteralPath $temporaryLauncher -Force }
}
$manifestPath = Join-Path $destination 'com.catnap.suno_mcp.json'
$manifest = @{
    name = 'com.catnap.suno_mcp'
    description = 'Catnap restricted Suno playlist MCP client'
    path = $launcher
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))
$registryPaths = @{
    chrome = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.catnap.suno_mcp'
    brave = 'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.catnap.suno_mcp'
    chromium = 'HKCU:\Software\Chromium\NativeMessagingHosts\com.catnap.suno_mcp'
}
foreach ($name in @('chrome','brave','chromium')) {
    if ($Browser -ne 'all' -and $Browser -ne $name) { continue }
    if ($NoRegister) { Write-Host "Smoke-test build only: skipped $name registry registration."; continue }
    $registry = $registryPaths[$name]
    New-Item -Path $registry -Force | Out-Null
    Set-Item -Path $registry -Value $manifestPath
    if ((Get-Item -Path $registry).GetValue('') -ne $manifestPath) { throw "Could not verify $name native-host registration." }
    Write-Host "Registered Catnap Suno companion $SCRIPT_VERSION for $name."
}
if ($NoRegister) { Write-Host 'Smoke-test launcher and manifest built. No browser registration was created.' }
else { Write-Host 'Return to Catnap Inbox and choose Connect Suno. Complete your own Suno authorization.' }
