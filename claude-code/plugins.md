# Claude Code 插件 / Marketplace

本目录记录 Claude Code 的插件配置（不含任何密钥/中转地址，安装时自行补充）。

## 已注册的 Marketplace

当前机器注册了官方插件市场：

```bash
claude plugin marketplace add anthropics/claude-plugins-official
```

安装后可查看已装插件：

```bash
claude plugin list
```

## 需要在新机器手动补充的环境变量（不在本仓库）

`~/.claude/settings.json` 的 `env` 里，以下两项**必须在新机器手动配置**（本仓库刻意不收录）：

| 变量 | 用途 |
|---|---|
| `ANTHROPIC_AUTH_TOKEN` | 中转/官方 API 的访问令牌 |
| `ANTHROPIC_BASE_URL` | 中转地址（API base URL） |

写入方式：

```bash
claude config set --global env.ANTHROPIC_AUTH_TOKEN "sk-xxxx"
claude config set --global env.ANTHROPIC_BASE_URL "https://your-relay/v1"
```

> 提示：`install.sh` / `install.ps1` 会交互式提示你输入这两项并写入 `~/.claude/settings.json`，可省略手动步骤。

## 代理说明

`HTTP_PROXY` / `HTTPS_PROXY = http://127.0.0.1:10808` 是当前机器的本地代理端口，按新机器实际代理填写，没有代理可删除。
