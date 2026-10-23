param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
if ($cfg.Env) {
    foreach ($item in $cfg.Env.PSObject.Properties) {
        Set-Item -Path "Env:$($item.Name)" -Value ([string]$item.Value)
    }
}
$startParams = @{
    FilePath = $cfg.File
    RedirectStandardInput = $cfg.Stdin
    RedirectStandardOutput = $cfg.Stdout
    RedirectStandardError = $cfg.Stderr
    WindowStyle = 'Hidden'
    PassThru = $true
}
if ($cfg.Arguments) { $startParams.ArgumentList = $cfg.Arguments } else { $startParams.ArgumentList = '' }
$p = Start-Process @startParams
$p.WaitForExit()
for ($i = 0; $i -lt 20; $i++) {
    if ($null -ne $p.ExitCode) { break }
    Start-Sleep -Milliseconds 50
}
$code = $p.ExitCode
if ($null -eq $code) { $code = 0 }
exit $code
