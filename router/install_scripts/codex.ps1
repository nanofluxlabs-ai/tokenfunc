
# ---- Codex ----
# 在 %USERPROFILE%\.codex\config.toml 写入自定义提供方 tokenfunc，密钥保存为用户级环境变量 TOKENFUNC_API_KEY

function Write-TfCodexConfig([string]$Model) {
  $dir = Join-Path $env:USERPROFILE '.codex'
  $file = Join-Path $dir 'config.toml'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Backup-TfFile $file

  # model 与 model_provider 必须在任何 [...] 小节之前，否则会被当成小节字段
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("model = `"$Model`"")
  $lines.Add('model_provider = "tokenfunc"')
  $lines.Add('')
  if (Test-Path $file) {
    # 去掉旧的顶层 model / model_provider 与旧的 tokenfunc 提供方小节，其余原样保留
    $top = $true
    $skip = $false
    foreach ($line in [IO.File]::ReadAllLines($file)) {
      if ($line -match '^\s*\[') {
        $top = $false
        $skip = $line -match '^\s*\[model_providers\.tokenfunc\]\s*$'
      }
      if ($top -and $line -match '^\s*(model|model_provider)\s*=') { continue }
      if (-not $skip) { $lines.Add($line) }
    }
  }
  $lines.Add('')
  $lines.Add('[model_providers.tokenfunc]')
  $lines.Add("name = `"$TfSiteName`"")
  $lines.Add("base_url = `"$TfBaseUrl/v1`"")
  $lines.Add('env_key = "TOKENFUNC_API_KEY"')
  $lines.Add('wire_api = "responses"')
  $lines.Add('requires_openai_auth = false')

  # 合并连续空行
  $text = (($lines -join "`n") -replace "(`n\s*){3,}", "`n`n").Trim() + "`n"
  Write-TfFile $file $text
  Write-TfInfo "已写入 $file"
}

try {
  Write-TfInfo "$TfSiteName · Codex 一键配置"
  $key = Read-TfKey
  $models = Get-TfModels $key
  $model = Select-TfModel $models 'gpt|codex' ' GPT '
  Install-TfTool 'codex' 'https://chatgpt.com/codex/install.ps1' '@openai/codex'
  Write-TfCodexConfig $model

  # 用户级环境变量，新开的终端与桌面应用都能读到；当前会话也一并设置
  [Environment]::SetEnvironmentVariable('TOKENFUNC_API_KEY', $key, 'User')
  $env:TOKENFUNC_API_KEY = $key
  Write-TfInfo '已把 TOKENFUNC_API_KEY 保存为用户环境变量'

  Write-Host ''
  Write-TfInfo "配置完成：地址 $TfBaseUrl/v1，默认模型 $model"
  Write-TfInfo '运行 codex，输入 /status 确认 provider 为 tokenfunc（其他已打开的终端需重新打开才能读到密钥）'
} catch {
  Write-Host "[x] $($_.Exception.Message)" -ForegroundColor Red
}
