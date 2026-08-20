# pi 配置

pi 的自定义 agent 工作流配置。安装方式见仓库根 `README.md` / `AGENTS.md`。

| 文件 | 说明 |
|---|---|
| `settings.json` | 主题 `volcanic-bubblegum`（来自 awesome-pi-themes）、packages 列表（rpiv-* 系列 + subagents + zentui + awesome-pi-themes + remote-pi + **本地聚合插件 `./pi/pi-*`**）、默认 provider/model |
| `cc-switch-provider.json` | 中转 provider 的 `routingMode`（fixed/live）与 `hideRoutingStatus` |
| `agents/` | 自定义 agent（rpiv 那批：codebase-*、artifact-* 等）。**快照**，由 `@juicesharp/rpiv-pi` 包自动生成并写入 `~/.pi/agent/agents/`（含 `.rpiv-managed.json` 哈希校验），装包后自动同步 |
| `pi-spoof-headers/` | 独立 pi 包：伪装请求头（Codex CLI / Claude Code persona），含 `extensions/spoof-headers.ts`、README、package.json |
| `pi-cc-switch-provider/` | cc-switch provider 扩展的**源码副本**（来自 `git:github.com/push-and-pop/pi-cc-switch-provider`，含 `mergeTransformedHeaders` 补丁，未推送） |

## 注意

- `defaultProvider: "cc-switch-codex"` 依赖 **cc-switch**（Windows 专属 GUI 中转工具）。Mac 上无 cc-switch 时该 provider 不会注册，需修改 `defaultProvider`/`defaultModel`。
- `packages` 中 `./pi/pi-*` 为本地路径包源（相对 `~/.pi/agent/` 解析，即 `~/.pi/agent/pi/<name>/`）。安装时需将本目录下三个插件子目录复制到 `~/.pi/agent/pi/` 并各自 `npm install`（见仓库根 `AGENTS.md` 步骤 A）。
- 本目录无任何密钥，可放心提交。
