# pi-spoof-headers

Pi 扩展：让 pi 发出的 provider HTTP 请求带上 **Codex CLI**（OpenAI 兼容 API）或 **Claude Code**（Anthropic API）的真实请求头，使中转/网关按这两个官方 agent 识别 pi。

## 工作原理

通过 pi 内置的 `before_provider_headers` 事件，在每次 provider 请求发出前原地改写 `event.headers`（设为字符串即覆盖、设为 `null` 即删除）。改写后的 headers 会成为 provider SDK 的 default headers，因此 `user-agent` 覆盖能压过 openai / anthropic SDK 自带的 UA。

按当前模型的 `api` 字段路由：

| api | 伪装 |
|---|---|
| `openai-completions` | Codex CLI |
| `openai-responses` | Codex CLI |
| `openai-codex-responses` | Codex CLI |
| `anthropic-messages` | Claude Code |

## 伪装内容

**Codex CLI（Rust, 0.147.0）**：真实 codex-cli 只发 `user-agent: codex-cli/<version>` + `authorization`，没有 `x-stainless-*`。默认只覆盖 `user-agent`，并删除 pi codex-responses 传输自带的 `originator: pi`（真实 codex 不发）。可选 `PI_SPOOF_CODEX_STAINLESS=1` 把 openai-node SDK 注入的 `x-stainless-*` 覆盖成 rust 风格（注：SDK 在我们 hook 之后才注入这些头，无法彻底删除，只能覆盖）。

**Claude Code**：按真实 claude-cli 捕获（见 `pi-cc-switch-debug-request.json`）设置 `user-agent: claude-cli/2.1.123 (external, cli)`、`x-app: cli`、`x-claude-code-session-id`（取当前 pi session id）、`anthropic-version`、`anthropic-dangerous-direct-browser-access`、`x-stainless-*`（js/node 栈）。`anthropic-beta` 默认保留 pi 自己的列表（避免破坏推理模式），可用 `PI_SPOOF_CLAUDE_BETAS` 覆盖。

## 安装

作为 pi 包（可推 GitHub 后 `pi install git:...`），或直接复制扩展文件到全局：

```
cp extensions/spoof-headers.ts ~/.pi/agent/extensions/spoof-headers.ts
```

重启 pi（或 `/reload`）生效。

## 配置（环境变量，均可选）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PI_SPOOF_HEADERS` | 开启 | `0`/`off`/`false` 关闭 |
| `PI_SPOOF_CODEX_USER_AGENT` | `codex-cli/0.147.0` | codex 伪装 UA |
| `PI_SPOOF_CODEX_STAINLESS` | `0` | `1` 时覆盖为 rust 风格 stainless 头 |
| `PI_SPOOF_CLAUDE_USER_AGENT` | `claude-cli/2.1.123 (external, cli)` | claude 伪装 UA |
| `PI_SPOOF_CLAUDE_X_APP` | `cli` | claude `x-app` 值 |
| `PI_SPOOF_CLAUDE_BETAS` | （保留 pi 的） | 逗号分隔，覆盖 `anthropic-beta` |

会话内可用 `/spoof-headers` 命令查看当前配置与模型路由。

## cc-switch-provider 覆盖说明

`pi-cc-switch-provider` 注册的是自定义 stream API（`cc-switch-codex-responses` / `cc-switch-anthropic`），它们自行构建 header map。要让它俩也带上伪装头，需要在该扩展的 `extensions/cc-switch-provider.ts` 里把 `options.headers`（携带 `before_provider_headers` 的改写）合并进两个 stream 的请求头：

- 新增 `mergeTransformedHeaders(target, source)` 辅助函数（字符串覆盖、`null` 删除、跳过 `authorization` / `x-api-key` 以保护各路由自己的凭据）；
- 在 `streamCcSwitchCodexResponses` 与 `streamCcSwitchAnthropic` 构建完本地 header map 后调用它。

合并后本插件的伪装对 cc-switch 路由同样生效（路由表已含 `cc-switch-codex-responses` / `cc-switch-anthropic`）。该补丁属于 `pi-cc-switch-provider` 仓库（用户本地克隆，未推送）。

## 目录

```
pi-spoof-headers/
├── package.json              # pi 包清单（pi.extensions 指向扩展）
├── README.md
└── extensions/
    └── spoof-headers.ts      # 扩展本体（单文件）
```
