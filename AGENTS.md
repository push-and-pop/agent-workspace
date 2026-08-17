# AGENTS.md — 本仓库安装指令（对任意 agent）

> 你是接到"安装这个 agent-workspace 仓库"指令的 agent。请按下面的清单逐项执行。
> 本仓库是个人多 agent 工作流的可移植配置；你的任务是把这些配置装到**当前这台新机器**上。

## 0. 先读这些约束（重要）

- **绝不把真实密钥/中转地址写进仓库**：本仓库只含脱敏配置。密钥用环境变量或交互式询问补齐，写入的是目标机器上的配置（`~/.claude/settings.json`、`~/.codex/config.toml`），不是仓库文件。
- **目标是本机用户目录**，不是仓库目录。路径映射见下表。
- 目标文件已存在且内容相同则跳过；配置源在本仓库（git），覆盖前**不做备份**。
- 不要复制本仓库的 `.git`、文档、脚本自身；只复制各 `*/` 目录下的配置文件。

## 1. 路径映射

| agent | 仓库内 | macOS / Linux 目标 | Windows 目标 |
|---|---|---|---|
| pi | `pi/settings.json` | `~/.pi/agent/settings.json` | `%USERPROFILE%\.pi\agent\settings.json` |
| pi | `pi/cc-switch-provider.json` | `~/.pi/agent/cc-switch-provider.json` | `%USERPROFILE%\.pi\agent\cc-switch-provider.json` |
| pi | `pi/agents/*` | `~/.pi/agent/agents/` | `%USERPROFILE%\.pi\agent\agents\` |
| Claude Code | `claude-code/settings.json` | `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json` |
| Codex | `codex/config.toml` | `~/.codex/config.toml` | `%USERPROFILE%\.codex\config.toml` |
| Codex | `codex/model-catalog.json` | `~/.codex/cc-switch-model-catalog.json` | `%USERPROFILE%\.codex\cc-switch-model-catalog.json` |
| Codex | `codex/rules/default.rules` | `~/.codex/rules/default.rules` | `%USERPROFILE%\.codex\rules\default.rules` |

（Windows 下 `$HOME`/`$USERPROFILE` 等价，可用通用用户目录写法。）

## 2. 安装步骤

### A. pi

1. 确保 `pi` 已安装（没有则 `npm install -g @earendil-works/pi-coding-agent`）。
2. 复制 `pi/settings.json`、`pi/cc-switch-provider.json` 到目标（见映射表）。
3. 复制 `pi/agents/*.md` 与 `pi/agents/.rpiv-managed.json` 到 `~/.pi/agent/agents/`。
   - 注：这些 agent 由 `@juicesharp/rpiv-pi` 包自动生成，装包后若不一致会以包为准，属正常。
4. 读取 `pi/settings.json` 的 `packages` 数组，对每一项执行 `pi install <package>`。
   - 例如：`pi install npm:@juicesharp/rpiv-pi`、`pi install git:github.com/push-and-pop/pi-cc-switch-provider` 等。
   - 某包安装失败时提示用户，不中断其余包。
5. 平台提示：当前若是 macOS/Linux，且默认 provider 是 `cc-switch-codex`（依赖 Windows 的 cc-switch GUI），告知用户需另行配置或修改 `defaultProvider`。

### B. Claude Code

1. 复制 `claude-code/settings.json` 到 `~/.claude/settings.json`。
2. 密钥补齐（二选一，**不要写进仓库**）：
   - 若环境变量 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 已设置：把值合并进 `~/.claude/settings.json` 的 `env` 段；
   - 否则**向用户交互式询问**这两项（允许留空），再写入 `env` 段。
3. 若 `claude` CLI 存在：执行 `claude plugin marketplace add anthropics/claude-plugins-official`（失败则提示用户手动执行）。
4. 提示用户：`HTTP_PROXY/HTTPS_PROXY=127.0.0.1:10808` 是源机器的本地代理，按新机器情况调整或删除。

### C. Codex

1. 复制 `codex/config.toml` 到 `~/.codex/config.toml`。
2. 复制 `codex/model-catalog.json` 到 `~/.codex/cc-switch-model-catalog.json`。
3. 复制 `codex/rules/default.rules` 到 `~/.codex/rules/default.rules`（可选：这是 xtrader 项目专属规则，可跳过并在提示中说明）。
4. 中转地址补齐：把 `~/.codex/config.toml` 中的占位符 `https://YOUR-RELAY-PLACEHOLDER/v1` 替换为真实中转地址——
   - 用环境变量 `CODEX_RELAY_URL`，否则交互式询问用户。
5. 提示用户运行 `codex login` 配置鉴权（token 不入库）。

## 3. 收尾

- 汇总报告：列出已复制/已安装/已跳过的项；明确告知哪些密钥需要用户自己确认。
- 让用户**重启对应 agent** 使配置生效。
- 全程不要修改仓库内任何文件（除非用户明确要求"更新仓库"）。

## 4. 更新仓库（用户显式要求时才做）

把源机器上的最新配置**脱敏后**拷回仓库对应目录再提交（token / 中转地址必须清掉）。`pi/agents` 由 rpiv 包生成，一般不必手动更新。
