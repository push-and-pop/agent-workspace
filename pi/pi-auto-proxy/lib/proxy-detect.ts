import { execFile } from "node:child_process";
import { createConnection } from "node:net";

/**
 * 常见本地 HTTP/混合代理端口，按优先级排序：
 *   7890  Clash / mihomo 混合端口
 *   7897  Clash Verge Rev
 *   10809 v2rayN HTTP 代理
 *   8888  v2ray / v2rayN 备用 HTTP
 *   1080  常见 socks/http 本地端口
 *   2080  sing-box 混合端口
 *   8118  Privoxy
 *   10808 v2rayN SOCKS（HTTP 探测会因验证失败被跳过，放在最后兜底）
 */
export const DEFAULT_PROXY_PORTS = [7890, 7897, 10809, 8888, 1080, 2080, 8118, 10808];

export const PROBE_HOST = "127.0.0.1";

export interface ProxyCandidate {
	url: string;
	source: "registry" | "probe";
	port?: number;
}

/** 把 "host:port" / "http://host:port" 规整为 http 代理 URL；SOCKS 不支持，返回 undefined。 */
export function normalizeProxyUrl(addr: string): string | undefined {
	const trimmed = addr.trim();
	if (!trimmed) return undefined;
	const lower = trimmed.toLowerCase();
	if (lower.startsWith("socks")) return undefined;
	if (lower.startsWith("http://") || lower.startsWith("https://")) return trimmed;
	return `http://${trimmed}`;
}

/**
 * 解析 Windows Internet Settings 的 ProxyServer 值：
 *   "127.0.0.1:7890"
 *   "http=127.0.0.1:7890;https=127.0.0.1:7890"
 *   "https=127.0.0.1:7890"           → 用 https 条目
 *   "socks=127.0.0.1:10808"          → 仅 SOCKS，不支持 → undefined
 */
export function parseProxyServerValue(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (!trimmed.includes("=")) return normalizeProxyUrl(trimmed);

	const entries = new Map<string, string>();
	for (const part of trimmed.split(";")) {
		const idx = part.indexOf("=");
		if (idx <= 0) continue;
		const scheme = part.slice(0, idx).trim().toLowerCase();
		const address = part.slice(idx + 1).trim();
		if (scheme && address) entries.set(scheme, address);
	}
	if (entries.size === 0) return undefined;
	const http = entries.get("http") ?? entries.get("https");
	if (!http) return undefined;
	return normalizeProxyUrl(http);
}

/** 解析 `reg query HKCU\...\Internet Settings` 的输出（含 ProxyEnable 与 ProxyServer）。 */
export function parseRegistryOutput(stdout: string): ProxyCandidate | undefined {
	const enableMatch = stdout.match(/ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/i);
	if (!enableMatch) return undefined;
	if (Number.parseInt(enableMatch[1], 16) === 0) return undefined;

	const serverMatch = stdout.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
	if (!serverMatch) return undefined;
	const url = parseProxyServerValue(serverMatch[1].trim());
	if (!url) return undefined;
	return { url, source: "registry" };
}

const INTERNET_SETTINGS_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

/** 读 Windows 系统代理。非 Windows / 未启用 / 不可读 → undefined。 */
export function readSystemProxyFromRegistry(timeoutMs = 2000): Promise<ProxyCandidate | undefined> {
	if (process.platform !== "win32") return Promise.resolve(undefined);
	return new Promise((resolve) => {
		execFile(
			"reg",
			["query", INTERNET_SETTINGS_KEY],
			{ timeout: timeoutMs, windowsHide: true },
			(error, stdout) => {
				if (error) return resolve(undefined);
				resolve(parseRegistryOutput(stdout));
			},
		);
	});
}

/** 探测单个 TCP 端口是否可连。 */
export function probeTcpPort(host: string, port: number, timeoutMs = 300): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ host, port });
		let settled = false;
		const done = (ok: boolean) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

export interface PortProbeOptions {
	host?: string;
	timeoutMs?: number;
	/** 测试注入用。 */
	connect?: (port: number) => Promise<boolean>;
}

/** 默认端口列表 + 用户额外端口（PI_AUTO_PROXY_PORTS，逗号/空格分隔），去重。 */
export function buildProxyPortList(extraEnv?: string): number[] {
	const ports = [...DEFAULT_PROXY_PORTS];
	const seen = new Set(ports);
	if (extraEnv) {
		for (const raw of extraEnv.split(/[,\s]+/)) {
			const port = Number.parseInt(raw, 10);
			if (Number.isInteger(port) && port > 0 && port <= 65535 && !seen.has(port)) {
				seen.add(port);
				ports.push(port);
			}
		}
	}
	return ports;
}

/** 并行探测全部端口；按输入列表优先级返回可连端口。 */
export async function probeProxyPorts(ports: number[], options: PortProbeOptions = {}): Promise<ProxyCandidate[]> {
	const host = options.host ?? PROBE_HOST;
	const timeoutMs = options.timeoutMs ?? 300;
	const connect = options.connect ?? ((port: number) => probeTcpPort(host, port, timeoutMs));
	const results = await Promise.all(
		ports.map(async (port) => ({ port, ok: await connect(port) })),
	);
	const rank = new Map(ports.map((port, index) => [port, index]));
	const open = results
		.filter((result) => result.ok)
		.sort((a, b) => (rank.get(a.port) ?? 0) - (rank.get(b.port) ?? 0));
	return open.map(({ port }) => ({ url: `http://${host}:${port}`, source: "probe", port }));
}

/** 候选列表：注册表系统代理优先，其次端口探测结果，按 URL 去重。 */
export async function detectProxyCandidates(): Promise<ProxyCandidate[]> {
	const candidates: ProxyCandidate[] = [];
	const seen = new Set<string>();
	const registry = await readSystemProxyFromRegistry();
	if (registry && !seen.has(registry.url)) {
		seen.add(registry.url);
		candidates.push(registry);
	}
	const probed = await probeProxyPorts(buildProxyPortList(process.env.PI_AUTO_PROXY_PORTS));
	for (const candidate of probed) {
		if (seen.has(candidate.url)) continue;
		seen.add(candidate.url);
		candidates.push(candidate);
	}
	return candidates;
}
