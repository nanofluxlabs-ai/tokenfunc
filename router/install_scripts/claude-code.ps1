
# ---- Claude Code ----
# 把地址、密钥、默认模型合并进 %USERPROFILE%\.claude\settings.json 的 env，保留文件里的其他设置

function Write-TfClaudeSettings([string]$Key, [string]$Model) {
  $dir = Join-Path $env:USERPROFILE '.claude'
  $file = Join-Path $dir 'settings.json'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Backup-TfFile $file

  $settings = New-Object PSObject
  if ((Test-Path $file) -and (Get-Item $file).Length -gt 0) {
    $text = [IO.File]::ReadAllText($file)
    if ($text.Trim()) {
      try {
        $settings = $text | ConvertFrom-Json
      } catch {
        throw "无法解析已有的 $file（不是合法 JSON），请按文档手动把配置合并进 env"
      }
    }
  }
  if (-not ($settings.PSObject.Properties.Name -contains 'env') -or -not ($settings.env -is [PSCustomObject])) {
    $settings | Add-Member -NotePropertyName env -NotePropertyValue (New-Object PSObject) -Force
  }
  $settings.env | Add-Member -NotePropertyName ANTHROPIC_BASE_URL -NotePropertyValue $TfBaseUrl -Force
  $settings.env | Add-Member -NotePropertyName ANTHROPIC_AUTH_TOKEN -NotePropertyValue $Key -Force
  $settings.env | Add-Member -NotePropertyName ANTHROPIC_MODEL -NotePropertyValue $Model -Force
  $settings.env.PSObject.Properties.Remove('ANTHROPIC_API_KEY')

  Write-TfFile $file (($settings | ConvertTo-Json -Depth 32) + "`n")
  Write-TfInfo "已写入 $file"
}

try {
  Write-TfInfo "$TfSiteName · Claude Code 一键配置"
  $key = Read-TfKey
  $models = Get-TfModels $key
  $model = Select-TfModel $models 'claude' ' Claude '
  Install-TfTool 'claude' 'https://claude.ai/install.ps1' '@anthropic-ai/claude-code'
  Write-TfClaudeSettings $key $model

  Write-Host ''
  Write-TfInfo "配置完成：地址 $TfBaseUrl，默认模型 $model"
  Write-TfInfo "在项目目录运行 claude，输入 /status 确认 Anthropic base URL 为 $TfBaseUrl"
  if (-not (Test-TfCommand 'git')) {
    Write-TfWarn 'Claude Code 在 Windows 上执行命令需要 Git Bash，请安装 Git for Windows：https://git-scm.com/download/win'
  }
  if (-not (Test-TfCommand 'claude')) {
    Write-TfWarn '当前终端还找不到 claude 命令，请新开一个终端再运行'
  }
} catch {
  Write-Host "[x] $($_.Exception.Message)" -ForegroundColor Red
}
