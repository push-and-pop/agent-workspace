# pi-auto-proxy

pi 扩展：自动探测本机 HTTP 代理（Windows 系统代理 + 常见端口探测），在 pi 运行期间把全部网络流量切到代理；代理消失时自动还原直连。

## 原理

undici 的全局 `fetch` 每次调用都通过共享的 `Symbol.for("undici.globalDispatcher.2")` 读取当前全局 dispatcher。扩展运行时 `setGlobalDispatcher(new EnvHttpProxyAgent(...))`，pi 的所有全局 fetch 流量（pi.dev 版本检查、npm 包更新检查、模型请求、web 工具）立即走代理，无需重启。

## 安装

```bash
pi install /path/to/pi-auto-proxy
```

## 行为

1. **探测**（启动后立即执行一次，之后每 15s 一次，`unref` 定时器，不阻塞 pi）：
   - Windows：先读注册表 `HKCU\...\Internet Settings` 的 `ProxyEnable` / `ProxyServer`（系统代理开关 + 地址），优先采用；
   - 再并行 TCP 探测常见本地代理端口（7890 Clash / 7897 Clash Verge / 10809 v2rayN / 8888 / 1080 / 2080 / 8118 / 10808），按列表优先级取第一个可连端口。
2. **验证**：通过候选代理请求 `http://www.gstatic.com/generate_204`，确认代理真的能出网才启用（避免把流量打进死代理 / SOCKS 端口）。
3. **切换**：设置 `HTTP_PROXY` / `HTTPS_PROXY` 并替换全局 dispatcher，日志输出 `[auto-proxy] enabled: <url> (registry|probe)`。
4. **还原**：代理不再可探测 / 复验失败时，还原 pi 原本的 dispatcher 和用户 shell 原有的代理环境变量。
5. **复验**：每 10 个探测周期（约 2.5 分钟）对在用代理做一次真实验证，失败立即还原直连。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PI_AUTO_PROXY` | 启用 | `0` / `false` / `no` / `off` 关闭扩展 |
| `PI_AUTO_PROXY_INTERVAL_MS` | `15000` | 探测间隔（毫秒） |
| `PI_AUTO_PROXY_PORTS` | 见上 | 追加额外探测端口，逗号/空格分隔，自动去重 |
| `PI_AUTO_PROXY_VERIFY_URL` | `http://www.gstatic.com/generate_204` | 验证用 URL；`off` 关闭验证 |
| `PI_AUTO_PROXY_VERIFY_TIMEOUT_MS` | `3000` | 验证请求超时（毫秒） |
| `PI_AUTO_PROXY_DEBUG` | — | `1` 输出每轮探测/跳过详情 |

## 测试

```bash
npm test        # 单元测试（node --experimental-strip-types --test）
npm run check   # TS 语法检查
```
