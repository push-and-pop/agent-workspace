#!/usr/bin/env bash
# =============================================================================
# agent-workspace 安装脚本（macOS / Linux，Windows 可用 Git Bash 跑，或直接用 install.ps1）
#
# 作用：把本仓库的 pi / Claude Code / Codex 配置复制到本机对应目录，
#       安装 pi 的 packages，并交互式补齐"不收录在仓库里的密钥/中转地址"。
# 幂等：已存在的目标文件先备份到 <目标>.bak.<时间戳>，可重复执行。
#
# 用法：
#   bash install.sh                 # 全量安装（含交互式密钥询问）
#   bash install.sh --no-secrets    # 跳过密钥询问（只复制配置+装包）
#   bash install.sh --pi            # 只装 pi 部分
#   bash install.sh --claude        # 只装 Claude Code 部分
#   bash install.sh --codex         # 只装 Codex 部分
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PWD_HOME="${HOME:-$USERPROFILE}"

# ---- 参数解析 ----
DO_PI=true; DO_CLAUDE=true; DO_CODEX=true; DO_SECRETS=true
for arg in "$@"; do
  case "$arg" in
    --no-secrets) DO_SECRETS=false ;;
    --pi) DO_CLAUDE=false; DO_CODEX=false ;;
    --claude) DO_PI=false; DO_CODEX=false ;;
    --codex) DO_PI=false; DO_CLAUDE=false ;;
    -h|--help) sed -n '1,14p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

# ---- 工具函数 ----
has() { command -v "$1" >/dev/null 2>&1; }

# 备份并复制单个文件（文件已存在且内容相同则跳过）
install_file() { # src dst
  local src="$1" dst="$2"
  if [ -f "$src" ]; then
    if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
      echo "  · 已是最新: $dst"
    else
      if [ -f "$dst" ]; then
        local bak="${dst}.bak.$(date +%Y%m%d%H%M%S)"
        cp "$dst" "$bak" && echo "  · 备份旧配置 -> $bak"
      fi
      mkdir -p "$(dirname "$dst")"
      cp "$src" "$dst"
      echo "  · 写入: $dst"
    fi
  fi
}

# 用 node 合并 JSON：把 key=value 写进 obj 的 env 段
json_set_env() { # file key value
  local file="$1" key="$2" value="$3"
  node -e '
    const fs = require("fs");
    const [file, key, value] = process.argv.slice(1);
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    j.env = j.env || {};
    j.env[key] = value;
    fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  ' "$file" "$key" "$value"
}

# ---- 主流程 ----
echo "== agent-workspace 安装 =="
echo "仓库目录: $REPO_DIR"
echo "目标 HOME: $PWD_HOME"
echo

# ---------- pi ----------
if $DO_PI; then
  echo "[1/3] pi"
  PI_DIR="$PWD_HOME/.pi/agent"
  install_file "$REPO_DIR/pi/settings.json"            "$PI_DIR/settings.json"
  install_file "$REPO_DIR/pi/cc-switch-provider.json"  "$PI_DIR/cc-switch-provider.json"
  mkdir -p "$PI_DIR/agents"
  for f in "$REPO_DIR"/pi/agents/*; do
    [ -e "$f" ] || continue
    install_file "$f" "$PI_DIR/agents/$(basename "$f")"
  done

  if has pi; then
    echo "  · 安装 pi packages (来自 pi/settings.json):"
    if has node; then
      while IFS= read -r pkg; do
        [ -n "$pkg" ] || continue
        echo "    → pi install $pkg"
        pi install "$pkg" || echo "    ⚠ 安装失败（可稍后手动重试）: $pkg"
      done < <(node -e 'const s=require(process.argv[1]); (s.packages||[]).forEach(p=>console.log(p))' "$REPO_DIR/pi/settings.json")
    else
      echo "    ⚠ 未检测到 node，无法自动安装 packages。请手动执行 pi/settings.json 里的安装列表。"
    fi
    if [[ "$(uname -s)" == "Darwin" || "$(uname -s)" == "Linux" ]]; then
      echo "  · 提示: 当前非 Windows 系统，pi 默认 provider 是 cc-switch-codex，"
      echo "    需要 cc-switch 环境（Windows GUI 工具）。若无则请改 pi 的 defaultProvider/defaultModel。"
    fi
  else
    echo "  · 未检测到 pi，跳过包安装。安装 pi: npm install -g @earendil-works/pi-coding-agent"
  fi
  echo
fi

# ---------- Claude Code ----------
if $DO_CLAUDE; then
  echo "[2/3] Claude Code"
  CLAUDE_DIR="$PWD_HOME/.claude"
  install_file "$REPO_DIR/claude-code/settings.json" "$CLAUDE_DIR/settings.json"

  # 密钥（不收录在仓库）：优先读环境变量，其次交互式询问
  if $DO_SECRETS; then
    AUTH="${ANTHROPIC_AUTH_TOKEN:-}"
    BASE="${ANTHROPIC_BASE_URL:-}"
    if [ -z "$AUTH" ]; then
      read -r -p "    输入 ANTHROPIC_AUTH_TOKEN（留空跳过）: " AUTH
    fi
    if [ -z "$BASE" ]; then
      read -r -p "    输入 ANTHROPIC_BASE_URL（如 https://your-relay/v1，留空跳过）: " BASE
    fi
    if [ -n "$AUTH" ] && has node; then
      json_set_env "$CLAUDE_DIR/settings.json" ANTHROPIC_AUTH_TOKEN "$AUTH"
      echo "  · 已写入 ANTHROPIC_AUTH_TOKEN（不会出现在仓库里）"
    fi
    if [ -n "$BASE" ] && has node; then
      json_set_env "$CLAUDE_DIR/settings.json" ANTHROPIC_BASE_URL "$BASE"
      echo "  · 已写入 ANTHROPIC_BASE_URL（不会出现在仓库里）"
    fi
  else
    echo "  · 跳过密钥询问（--no-secrets）。请稍后手动设置 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL。"
  fi

  if has claude; then
    echo "  · 注册官方插件市场:"
    claude plugin marketplace add anthropics/claude-plugins-official 2>/dev/null \
      && echo "    ✓ marketplace 已注册" || echo "    ⚠ marketplace 注册失败，可稍后手动执行"
  else
    echo "  · 未检测到 claude CLI，跳过插件市场注册。"
  fi
  echo
fi

# ---------- Codex ----------
if $DO_CODEX; then
  echo "[3/3] Codex"
  CODEX_DIR="$PWD_HOME/.codex"
  install_file "$REPO_DIR/codex/config.toml"      "$CODEX_DIR/config.toml"
  install_file "$REPO_DIR/codex/model-catalog.json" "$CODEX_DIR/cc-switch-model-catalog.json"
  mkdir -p "$CODEX_DIR/rules"
  install_file "$REPO_DIR/codex/rules/default.rules" "$CODEX_DIR/rules/default.rules"

  # 中转地址（不收录在仓库）：替换 config.toml 里的占位符
  if $DO_SECRETS; then
    RELAY="${CODEX_RELAY_URL:-}"
    if [ -z "$RELAY" ]; then
      read -r -p "    输入 Codex 中转地址（如 https://your-relay/v1，留空跳过）: " RELAY
    fi
    if [ -n "$RELAY" ]; then
      sed -i.bak "s|https://YOUR-RELAY-PLACEHOLDER/v1|$RELAY|g" "$CODEX_DIR/config.toml"
      echo "  · 已替换 config.toml 中转占位符（不会出现在仓库里）"
    fi
  else
    echo "  · 跳过中转询问（--no-secrets）。请把 ~/.codex/config.toml 的 YOUR-RELAY-PLACEHOLDER 替换为真实地址。"
  fi

  if has codex; then
    echo "  · 提示: 运行 codex login 配置鉴权；codex/rules/default.rules 是 xtrader 项目专属规则，新机器可跳过。"
  fi
  echo
fi

echo "== 完成 =="
echo "下一步：重启/重开 pi、claude、codex 让配置生效；codex 记得 codex login。"
