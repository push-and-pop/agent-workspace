# =============================================================================
# agent-workspace 安装脚本（Windows PowerShell；macOS/Linux 请用 install.sh）
#
# 作用：把本仓库的 pi / Claude Code / Codex 配置复制到本机对应目录，
#       安装 pi 的 packages，并交互式补齐"不收录在仓库里的密钥/中转地址"。
# 幂等：目标文件内容相同则跳过；配置源在本仓库（git），覆盖前不做 .bak 备份。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1          # 全量安装
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoSecrets
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Pi / -Claude / -Codex
# =============================================================================
param(
  [switch]$NoSecrets,
  [switch]$Pi,
  [switch]$Claude,
  [switch]$Codex
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HomeDir = $HOME

# 默认全装；指定了任一 agent 开关则只装指定部分
if ($Pi -or $Claude -or $Codex) {
  if (-not $Pi)    { $DoPi = $false } else { $DoPi = $true }
  if (-not $Claude){ $DoClaude = $false } else { $DoClaude = $true }
  if (-not $Codex) { $DoCodex = $false } else { $DoCodex = $true }
} else {
  $DoPi = $true; $DoClaude = $true; $DoCodex = $true
}
$DoSecrets = -not $NoSecrets

function Install-File([string]$Src, [string]$Dst) {
  if (-not (Test-Path $Src)) { return }
  if (Test-Path $Dst) {
    $same = (Get-FileHash $Src -Algorithm SHA256).Hash -eq (Get-FileHash $Dst -Algorithm SHA256).Hash
    if ($same) { Write-Host "  · 已是最新: $Dst"; return }
  }
  $dir = Split-Path -Parent $Dst
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item $Src $Dst -Force
  Write-Host "  · 写入: $Dst"
}

function Set-JsonEnv([string]$File, [string]$Key, [string]$Value) {
  $j = Get-Content $File -Raw | ConvertFrom-Json
  if (-not $j.env) { $j | Add-Member -NotePropertyName env -NotePropertyValue @{} }
  $j.env | Add-Member -NotePropertyName $Key -NotePropertyValue $Value -Force
  $j | ConvertTo-Json -Depth 10 | Set-Content $File -Encoding utf8
}

Write-Host "== agent-workspace 安装 =="
Write-Host "仓库目录: $RepoDir"
Write-Host "目标 HOME: $HomeDir"
Write-Host ""

if ($DoPi) {
  Write-Host "[1/3] pi"
  $PiDir = Join-Path $HomeDir ".pi\agent"
  Install-File (Join-Path $RepoDir "pi\settings.json")           (Join-Path $PiDir "settings.json")
  Install-File (Join-Path $RepoDir "pi\cc-switch-provider.json") (Join-Path $PiDir "cc-switch-provider.json")
  New-Item -ItemType Directory -Force -Path (Join-Path $PiDir "agents") | Out-Null
  Get-ChildItem (Join-Path $RepoDir "pi\agents") -File | ForEach-Object {
    Install-File $_.FullName (Join-Path $PiDir "agents\$($_.Name)")
  }

  if (Get-Command pi -ErrorAction SilentlyContinue) {
    Write-Host "  · 安装 pi packages:"
    if (Get-Command node -ErrorAction SilentlyContinue) {
      $pkgs = node -e "const s=require(process.argv[1]); (s.packages||[]).forEach(p=>{ if (typeof p === 'string') console.log(p); else if (p && typeof p.source === 'string') console.log(p.source); })" (Join-Path $RepoDir "pi\settings.json")
      foreach ($pkg in $pkgs) {
        if (-not $pkg) { continue }
        Write-Host "    -> pi install $pkg"
        pi install $pkg | Out-Host
      }
    } else {
      Write-Host "    ⚠ 未检测到 node，请手动安装 pi/settings.json 里的 packages。"
    }
  } else {
    Write-Host "  · 未检测到 pi，跳过包安装。安装: npm install -g @earendil-works/pi-coding-agent"
  }
  Write-Host ""
}

if ($DoClaude) {
  Write-Host "[2/3] Claude Code"
  $ClaudeDir = Join-Path $HomeDir ".claude"
  Install-File (Join-Path $RepoDir "claude-code\settings.json") (Join-Path $ClaudeDir "settings.json")

  if ($DoSecrets) {
    $auth = $env:ANTHROPIC_AUTH_TOKEN
    if (-not $auth) { $auth = Read-Host "    输入 ANTHROPIC_AUTH_TOKEN（留空跳过）" }
    $base = $env:ANTHROPIC_BASE_URL
    if (-not $base) { $base = Read-Host "    输入 ANTHROPIC_BASE_URL（如 https://your-relay/v1，留空跳过）" }
    if ($auth -and (Get-Command node -ErrorAction SilentlyContinue)) {
      Set-JsonEnv (Join-Path $ClaudeDir "settings.json") "ANTHROPIC_AUTH_TOKEN" $auth
      Write-Host "  · 已写入 ANTHROPIC_AUTH_TOKEN"
    }
    if ($base -and (Get-Command node -ErrorAction SilentlyContinue)) {
      Set-JsonEnv (Join-Path $ClaudeDir "settings.json") "ANTHROPIC_BASE_URL" $base
      Write-Host "  · 已写入 ANTHROPIC_BASE_URL"
    }
  } else {
    Write-Host "  · 跳过密钥询问。请稍后手动设置 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL。"
  }

  if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "  · 注册官方插件市场:"
    claude plugin marketplace add anthropics/claude-plugins-official 2>$null | Out-Host
    Write-Host "    ✓ 已执行 marketplace add（如失败请手动重试）"
  } else {
    Write-Host "  · 未检测到 claude CLI，跳过插件市场注册。"
  }
  Write-Host ""
}

if ($DoCodex) {
  Write-Host "[3/3] Codex"
  $CodexDir = Join-Path $HomeDir ".codex"
  Install-File (Join-Path $RepoDir "codex\config.toml")        (Join-Path $CodexDir "config.toml")
  Install-File (Join-Path $RepoDir "codex\model-catalog.json") (Join-Path $CodexDir "cc-switch-model-catalog.json")
  New-Item -ItemType Directory -Force -Path (Join-Path $CodexDir "rules") | Out-Null
  Install-File (Join-Path $RepoDir "codex\rules\default.rules") (Join-Path $CodexDir "rules\default.rules")

  if ($DoSecrets) {
    $relay = $env:CODEX_RELAY_URL
    if (-not $relay) { $relay = Read-Host "    输入 Codex 中转地址（如 https://your-relay/v1，留空跳过）" }
    if ($relay) {
      $cfg = Get-Content (Join-Path $CodexDir "config.toml") -Raw
      $cfg = $cfg -replace [regex]::Escape("https://YOUR-RELAY-PLACEHOLDER/v1"), $relay
      Set-Content (Join-Path $CodexDir "config.toml") $cfg -Encoding utf8
      Write-Host "  · 已替换 config.toml 中转占位符"
    }
  } else {
    Write-Host "  · 跳过中转询问。请把 ~/.codex/config.toml 的 YOUR-RELAY-PLACEHOLDER 替换为真实地址。"
  }

  if (Get-Command codex -ErrorAction SilentlyContinue) {
    Write-Host "  · 提示: 运行 codex login 配置鉴权；codex/rules/default.rules 是 xtrader 项目专属规则，可跳过。"
  }
  Write-Host ""
}

Write-Host "== 完成 =="
Write-Host "下一步：重启/重开 pi、claude、codex 让配置生效；codex 记得 codex login。"
