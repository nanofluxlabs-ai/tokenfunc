# tokenfunc 一键配置脚本（Windows PowerShell 5.1 / PowerShell 7）。由站点按请求生成，站点地址已填好。
# 用法：irm <站点地址>/install/<工具>.ps1 | iex
# 可选环境变量：
#   TOKENFUNC_API_KEY       跳过密钥输入（适合自动化）
#   TOKENFUNC_MODEL         指定默认模型，跳过模型选择
#   TOKENFUNC_SKIP_INSTALL  设为 1 时不自动安装工具，只写配置
# 脚本在用户自己的 PowerShell 会话里执行（iex），因此不能调用 exit，出错时抛异常由最外层捕获。

$ErrorActionPreference = 'Stop'
$TfBaseUrl = '__TF_BASE_URL__'
$TfSiteName = '__TF_SITE_NAME__'

# Windows PowerShell 5.1 默认可能不启用 TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Write-TfInfo([string]$Message) { Write-Host "==> $Message" -ForegroundColor Green }
function Write-TfWarn([string]$Message) { Write-Host "[!] $Message" -ForegroundColor Yellow }

function Test-TfCommand([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# 输入被重定向（自动化、CI）时没法交互，Read-Host 会一直阻塞
function Test-TfInteractive {
  return [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
}

# 写 UTF-8（无 BOM）：Windows PowerShell 5.1 的 Set-Content -Encoding UTF8 会带 BOM，部分工具解析会失败
function Write-TfFile([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding $false))
}

function Backup-TfFile([string]$Path) {
  if ((Test-Path $Path) -and (Get-Item $Path).Length -gt 0) {
    $backup = "$Path.bak.$(Get-Date -Format yyyyMMddHHmmss)"
    Copy-Item $Path $backup
    Write-TfInfo "已备份原配置：$backup"
  }
}

function Read-TfKey {
  if ($env:TOKENFUNC_API_KEY) {
    Write-TfInfo '使用环境变量 TOKENFUNC_API_KEY 中的密钥'
    return $env:TOKENFUNC_API_KEY.Trim()
  }
  if (-not (Test-TfInteractive)) { throw '无法读取输入，请先设置环境变量 TOKENFUNC_API_KEY 再运行' }
  $secure = Read-Host -AsSecureString "请粘贴 $TfSiteName 的 API 密钥（输入时不显示）"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  $key = ($key -replace '\s', '')
  if (-not $key) { throw "密钥不能为空。可在 $TfBaseUrl/keys 创建或复制密钥" }
  return $key
}

# 用 /v1/models 校验地址与密钥（不扣费），同时拿到这把密钥可用的模型
function Get-TfModels([string]$Key) {
  try {
    $response = Invoke-RestMethod -Uri "$TfBaseUrl/v1/models" -Headers @{ Authorization = "Bearer $Key" } -TimeoutSec 20
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 401 -or $status -eq 403) { throw "密钥无效或已停用（HTTP $status），请到 $TfBaseUrl/keys 检查" }
    if ($status) { throw "校验密钥失败（HTTP $status）" }
    throw "无法连接 $TfBaseUrl，请检查网络或代理：$($_.Exception.Message)"
  }
  Write-TfInfo '密钥有效'
  return @($response.data | ForEach-Object { $_.id })
}

# 选默认模型：$Pattern 为优先匹配的正则，$Family 为提示里的系列名
function Select-TfModel([string[]]$Models, [string]$Pattern, [string]$Family) {
  if ($env:TOKENFUNC_MODEL) { return $env:TOKENFUNC_MODEL }
  $candidates = @($Models | Where-Object { $_ -match $Pattern })
  if ($candidates.Count -eq 0) { $candidates = @($Models) }
  if ($candidates.Count -eq 0) { throw '这把密钥没有可用的模型，请检查密钥分组或联系管理员' }
  if ($candidates.Count -eq 1 -or -not (Test-TfInteractive)) {
    Write-TfInfo "默认模型：$($candidates[0])"
    return $candidates[0]
  }
  Write-Host ''
  Write-Host "可用的${Family}模型："
  $shown = [Math]::Min($candidates.Count, 30)
  for ($i = 0; $i -lt $shown; $i++) { Write-Host ('  {0,2}. {1}' -f ($i + 1), $candidates[$i]) }
  $choice = Read-Host '选择默认模型（输入序号或模型名，直接回车选 1）'
  if (-not $choice) { $choice = '1' }
  if ($choice -match '^\d+$') {
    $index = [int]$choice - 1
    if ($index -lt 0 -or $index -ge $candidates.Count) { throw '选择无效' }
    $model = $candidates[$index]
  } else {
    $model = $choice.Trim()
  }
  Write-TfInfo "默认模型：$model"
  return $model
}

# 安装工具：$Name 命令名，$Installer 官方安装脚本地址，$NpmPackage npm 包名
function Install-TfTool([string]$Name, [string]$Installer, [string]$NpmPackage) {
  if (Test-TfCommand $Name) {
    Write-TfInfo "已安装 $Name"
    return
  }
  if ($env:TOKENFUNC_SKIP_INSTALL -eq '1') {
    Write-TfWarn "未检测到 $Name，按 TOKENFUNC_SKIP_INSTALL=1 跳过安装"
    return
  }
  Write-TfInfo "未检测到 $Name，正在用官方方式安装…"
  try {
    Invoke-RestMethod $Installer | Invoke-Expression
    Write-TfInfo "$Name 安装完成"
    return
  } catch {
    Write-TfWarn "官方安装脚本失败：$($_.Exception.Message)"
  }
  if (Test-TfCommand 'npm') {
    Write-TfWarn "改用 npm 安装 $NpmPackage"
    npm install -g $NpmPackage
    if ($LASTEXITCODE -eq 0) { return }
  }
  throw "$Name 安装失败，请按 $TfBaseUrl/docs 中的手动步骤安装后重新运行本脚本"
}
