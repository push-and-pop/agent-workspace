# pi 配置

pi 的自定义 agent 工作流配置。安装方式见仓库根 `README.md` / `AGENTS.md`。

| 文件 | 说明 |
|---|---|
| `settings.json` | 主题 `volcanic-bubblegum`（来自 awesome-pi-themes）、packages 列表（rpiv-* 系列 + subagents + zentui + awesome-pi-themes + cc-switch fork）、默认 provider/model |
| `cc-switch-provider.json` | 中转 provider 的 `routingMode`（fixed/live）与 `hideRoutingStatus` |
| `agents/` | 自定义 agent（rpiv 那批：codebase-*、artifact-* 等）。**快照**，由 `@juicesharp/rpiv-pi` 包自动生成并写入 `~/.pi/agent/agents/`（含 `.rpiv-managed.json` 哈希校验），装包后自动同步 |

## 注意

- `defaultProvider: "cc-switch-codex"` 依赖 **cc-switch**（Windows 专属 GUI 中转工具）。Mac 上无 cc-switch 时该 provider 不会注册，需修改 `defaultProvider`/`defaultModel`。
- 本目录无任何密钥，可放心提交。
