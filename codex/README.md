# Codex 配置

安装方式见仓库根 `README.md` / `AGENTS.md`。

| 文件 | 说明 |
|---|---|
| `config.toml` | **脱敏版**：自定义 provider（中转地址为占位符 `YOUR-RELAY-PLACEHOLDER`）、模型 `deepseek-v4-flash-0731`、`model_catalog_json` 指向 catalog、`[windows]` 段（Mac 忽略）。已删除项目级 `[projects]` trust 配置 |
| `model-catalog.json` | cc-switch 导入的模型 catalog（45KB，无密钥） |
| `rules/default.rules` | xtrader 项目的 Windows 专属沙箱允许规则（含 `C:\Program Files\WindowsApps...` 路径），**新机器/ Mac 可跳过** |

## 注意

- 中转地址需替换占位符；鉴权用 `codex login` 配置（`auth.json` 不入库）。
- 项目级信任在新机器上用 codex 交互式确认，不随仓库分发。
