# agent-workspace

个人多 agent 工作流的**可移植配置仓库**：记录 pi、Claude Code、Codex 的插件/配置/自定义 agent，换机器（比如 Windows → Mac）后直接让 agent 按本仓库把整套工作流装回去。

> ⚠️ **安全约定**：真实 API token、中转地址、代理凭据**一律不进入本仓库**。仓库里的配置文件都是"脱敏版"，密钥在安装时手动/交互式补齐（见下文"安装时的密钥"）。

## 目录结构

```
agent-workspace/
├── README.md            # 本文件：总览 + 换机流程
├── AGENTS.md            # ★ 给任意 agent 的安装指令（换机时"叫 agent 安装"就看它）
├── install.sh           # macOS / Linux 一键引导
├── install.ps1          # Windows PowerShell 一键引导
├── pi/                  # pi 配置
│   ├── settings.json    #   主题、packages 列表、默认 provider/model
│   ├── cc-switch-provider.json  #   中转 provider 的 routingMode / hideRoutingStatus
│   ├── agents/          #   自定义 agent（快照，由 @juicesharp/rpiv-pi 自动管理）
│   └── README.md
├── claude-code/         # Claude Code 配置
│   ├── settings.json    #   脱敏版（无 token / 中转地址）
│   ├── plugins.md       #   marketplace 与需手动补充的 env
│   └── README.md
└── codex/               # Codex 配置
    ├── config.toml      #   脱敏版（中转地址为占位符）
    ├── model-catalog.json      #   cc-switch 导入的模型 catalog
    ├── rules/default.rules     #   xtrader 项目专属沙箱规则（可跳过）
    └── README.md
```

## 在新机器上安装（换机流程）

1. 安装基础工具：Node.js（pi 必需）。
2. 安装各 agent 本体：`npm install -g @earendil-works/pi-coding-agent`、Claude Code、Codex。
3. 克隆本仓库并进入：`git clone <repo-url> && cd agent-workspace`。
4. 二选一：
   - **让 agent 装**：把仓库克隆下来，对任何 agent 说"按 AGENTS.md 安装本仓库"，它会自动复制配置、装 pi 包、交互询问密钥。
   - **脚本装**：`bash install.sh`（Mac/Linux）或 `powershell -ExecutionPolicy Bypass -File .\install.ps1`（Windows）。
5. 按提示填入密钥/中转地址；重启 pi / claude / codex 生效。

## 安装时的密钥（不收录在仓库）

| 项 | 位置 | 说明 |
|---|---|---|
| `ANTHROPIC_AUTH_TOKEN` | `~/.claude/settings.json` | Claude Code 访问令牌 |
| `ANTHROPIC_BASE_URL` | `~/.claude/settings.json` | Claude Code 中转地址 |
| Codex 中转地址 | `~/.codex/config.toml` | 占位符 `YOUR-RELAY-PLACEHOLDER` 需替换 |
| Codex 鉴权 | `~/.codex/auth.json` | 用 `codex login` 配置 |

脚本会用环境变量（`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` / `CODEX_RELAY_URL`）或交互输入来补齐，绝不写入仓库。

## 平台注意

- **pi**：跨平台。但 `defaultProvider: cc-switch-codex` 依赖 **cc-switch**（Windows 专属 GUI 工具）。Mac 上若无 cc-switch，请改 `defaultProvider`/`defaultModel` 或忽略该 provider。
- **Claude Code**：跨平台，`HTTP_PROXY/HTTPS_PROXY=127.0.0.1:10808` 按新机器实际代理调整。
- **Codex**：`config.toml` 里 `[windows]` 段仅 Windows 生效（Mac 忽略）；`rules/default.rules` 是 xtrader 项目的 Windows 专属规则，Mac 上可跳过。
- 目标路径映射：Mac/Linux 均为 `~/.pi/agent`、`~/.claude`、`~/.codex`，Windows 为 `%USERPROFILE%\.pi\agent`、`%USERPROFILE%\.claude`、`%USERPROFILE%\.codex`（脚本已处理）。

## 如何更新本仓库

在"源机器"上改了任一 agent 配置后，把对应文件拷回仓库对应目录（覆盖脱敏版），提交推送即可。例如：

```bash
# 源机器（Windows）
cp %USERPROFILE%\.pi\agent\settings.json  agent-workspace\pi\settings.json
# 更新 claude 脱敏版时记得再次去掉 token / 中转地址，别把密钥提交进去！
```

建议在源机器上维护一个"导出"小脚本，统一把最新配置同步进仓库（`pi/agents` 由 rpiv 包生成，可不手动更新）。
