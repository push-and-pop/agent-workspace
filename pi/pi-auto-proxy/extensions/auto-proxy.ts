import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { detectProxyCandidates } from "../lib/proxy-detect.ts";
import { AutoProxyRuntime, DEFAULT_PROXY_INTERVAL_MS } from "../lib/proxy-runtime.ts";
import { parseVerifyUrlEnv, verifyProxyUrl } from "../lib/proxy-verify.ts";

const PROCESS_STATE_KEY = Symbol.for("pi-auto-proxy.process-state");
const REVERIFY_EVERY_CYCLES = 10;
const STATUS_KEY = "auto-proxy";

interface ProcessState {
	runtime: AutoProxyRuntime | undefined;
	timer: ReturnType<typeof setInterval> | undefined;
	probeInFlight: boolean;
	debug: boolean;
	/** 由 session_start 回调注入的 UI 上下文，用于在 footer 显示当前代理状态。 */
	ui: ExtensionUIContext | undefined;
	/** 当前 footer 状态文本，供会话重启时重放。 */
	lastStatus: string | undefined;
}

/**
 * 进程级状态放在 Symbol.for 上：扩展工厂可能随每个会话重新执行（jiti 缓存模块），
 * Symbol.for 保证多个加载实例共享同一份运行时，不会重复起定时器或互相覆盖。
 */
function processState(): ProcessState {
	const globalScope = globalThis as typeof globalThis & { [PROCESS_STATE_KEY]?: ProcessState };
	globalScope[PROCESS_STATE_KEY] ??= {
		runtime: undefined,
		timer: undefined,
		probeInFlight: false,
		debug: false,
		ui: undefined,
		lastStatus: undefined,
	};
	return globalScope[PROCESS_STATE_KEY];
}

function positiveIntEnv(name: string): number | undefined {
	const raw = process.env[name];
	if (!raw) return undefined;
	const value = Number.parseInt(raw, 10);
	if (Number.isFinite(value) && value > 0) return value;
	return undefined;
}

/** 日志优先走 footer 状态栏（不污染输入栏）；console 仅 debug 时输出。 */
function log(state: ProcessState, message: string): void {
	if (state.debug) console.info(`[auto-proxy] ${message}`);
}

function renderStatus(state: ProcessState, text: string | undefined): void {
	state.lastStatus = text;
	state.ui?.setStatus(STATUS_KEY, text);
	if (state.debug) console.info(`[auto-proxy] status: ${text ?? "(cleared)"}`);
}

function startAutoProxy(): void {
	const state = processState();
	if (state.runtime) return;
	state.debug = process.env.PI_AUTO_PROXY_DEBUG === "1";

	const runtime = new AutoProxyRuntime({ getGlobalDispatcher, setGlobalDispatcher, EnvHttpProxyAgent });
	state.runtime = runtime;
	const intervalMs = positiveIntEnv("PI_AUTO_PROXY_INTERVAL_MS") ?? DEFAULT_PROXY_INTERVAL_MS;
	const verifyUrl = parseVerifyUrlEnv(process.env.PI_AUTO_PROXY_VERIFY_URL);
	const verifyTimeoutMs = positiveIntEnv("PI_AUTO_PROXY_VERIFY_TIMEOUT_MS") ?? 3000;

	const probe = async (): Promise<void> => {
		if (state.probeInFlight) return;
		state.probeInFlight = true;
		try {
			const candidates = await detectProxyCandidates();
			const active = runtime.activeUrl;
			const sameActive = candidates.some((candidate) => candidate.url === active);
			const shouldReverifyActive =
				verifyUrl !== undefined && active !== undefined && runtime.cycle > 0 && runtime.cycle % REVERIFY_EVERY_CYCLES === 0;

			// 状态没变且不到定期复验周期：直接跳过，避免每轮都发验证请求。
			if (sameActive && !shouldReverifyActive) {
				runtime.cycle++;
				return;
			}

			let applied: { url: string; source: string } | undefined;
			let activeFailed = false;
			for (const candidate of candidates) {
				const needsVerify =
					verifyUrl !== undefined && (candidate.url !== active || shouldReverifyActive);
				if (needsVerify) {
					const ok = await verifyProxyUrl(candidate.url, verifyUrl, { timeoutMs: verifyTimeoutMs });
					if (!ok) {
						if (candidate.url === active) activeFailed = true;
						log(state, `candidate ${candidate.url} (${candidate.source}) failed verification; skipping`);
						continue;
					}
				}
				applied = { url: candidate.url, source: candidate.source };
				break;
			}

			if (applied) {
				if (runtime.activeUrl !== applied.url && runtime.apply(applied.url)) {
					renderStatus(state, `enabled: ${applied.url} (${applied.source})`);
				}
				// 已启用且复验通过：无需动作。
			} else if (runtime.activeUrl !== undefined) {
				runtime.clear();
				log(state, activeFailed ? `active proxy ${active} failed verification` : "no proxy detected");
				renderStatus(state, undefined);
			}
			runtime.cycle++;
		} catch (error) {
			log(state, `probe error: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			state.probeInFlight = false;
		}
	};

	// 立即探测一次但不阻塞启动（pi 会 await 返回 Promise 的工厂）。
	void probe();
	state.timer = setInterval(() => void probe(), intervalMs);
	state.timer.unref?.();
	log(state, `started (interval ${intervalMs}ms, verify: ${verifyUrl ?? "off"})`);
}

function stopAutoProxy(): void {
	const state = processState();
	if (state.timer) {
		clearInterval(state.timer);
		state.timer = undefined;
	}
	if (state.runtime?.clear()) {
		log(state, "stopped; restored direct connection");
		renderStatus(state, undefined);
	}
	state.runtime = undefined;
	state.probeInFlight = false;
}

export default function (pi: ExtensionAPI): void {
	const raw = process.env.PI_AUTO_PROXY?.trim();
	if (raw && /^(0|false|no|off)$/i.test(raw)) return;

	startAutoProxy();
	// UI 上下文只在事件回调里可用：在这里拿到 setStatus，之后定时器/探测都能写 footer。
	pi.on("session_start", (_event, ctx) => {
		const state = processState();
		state.ui = ctx.ui;
		// 会话开始时若代理已启用，把状态补推到 footer。
		if (state.lastStatus) {
			state.ui.setStatus(STATUS_KEY, state.lastStatus);
		}
	});
	pi.on("session_shutdown", () => stopAutoProxy());
}
