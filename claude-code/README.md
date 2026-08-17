# Claude Code 配置

安装方式见仓库根 `README.md` / `AGENTS.md`；插件与密钥细节见 `plugins.md`。

| 文件 | 说明 |
|---|---|
| `settings.json` | **脱敏版**：模型映射（opus-5[1M] 等）、`ENABLE_TOOL_SEARCH`、本地代理、`model: opus` 等。**已删除** `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_BASE_URL`（安装时补齐） |
| `plugins.md` | 已注册的 marketplace、需手动补充的 env 变量说明 |

## 注意

- 密钥（token / 中转地址）不入库，安装脚本会交互式补齐。
- 代理 `127.0.0.1:10808` 是源机器的本地代理端口，新机器按实际情况调整。
