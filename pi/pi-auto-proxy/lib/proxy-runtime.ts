import { EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";

export interface DispatcherHooks {
	getGlobalDispatcher: () => unknown;
	setGlobalDispatcher: (dispatcher: unknown) => void;
	EnvHttpProxyAgent: typeof EnvHttpProxyAgent;
}

interface SavedEnv {
	http?: string;
	https?: string;
}

export const DEFAULT_PROXY_INTERVAL_MS = 15000;

/**
 * 代理状态机：把检测到的代理应用到 pi 的全局 fetch 调度器，并在代理消失时还原。
 *
 * undici 的全局 fetch 每次调用时通过 Symbol.for 共享的 getGlobalDispatcher() 取当前
 * dispatcher，所以运行中 setGlobalDispatcher 立即对所有走全局 fetch 的请求生效
 * （pi.dev 版本检查、npm 包更新、模型请求、web 工具等）。
 */
export class AutoProxyRuntime {
	private readonly hooks: DispatcherHooks;
	private originalDispatcher: unknown | undefined;
	private originalEnv: SavedEnv | undefined;
	activeUrl: string | undefined;
	cycle = 0;

	constructor(hooks: DispatcherHooks) {
		this.hooks = hooks;
	}

	private captureOriginal(): void {
		if (this.originalDispatcher !== undefined) return;
		this.originalDispatcher = this.hooks.getGlobalDispatcher();
		this.originalEnv = {
			http: process.env.HTTP_PROXY,
			https: process.env.HTTPS_PROXY,
		};
	}

	/** 让全部全局流量走指定代理。状态未变时返回 false。 */
	apply(url: string): boolean {
		if (this.activeUrl === url) return false;
		this.captureOriginal();
		process.env.HTTP_PROXY = url;
		process.env.HTTPS_PROXY = url;
		// EnvHttpProxyAgent 在构造时读取环境变量，必须先设环境再构造。
		this.hooks.setGlobalDispatcher(new this.hooks.EnvHttpProxyAgent({ allowH2: false }));
		this.activeUrl = url;
		return true;
	}

	/** 还原原始 dispatcher 与环境变量（含用户 shell 里原有的代理配置）。状态未变时返回 false。 */
	clear(): boolean {
		if (this.activeUrl === undefined) return false;
		if (this.originalEnv) {
			if (this.originalEnv.http === undefined) delete process.env.HTTP_PROXY;
			else process.env.HTTP_PROXY = this.originalEnv.http;
			if (this.originalEnv.https === undefined) delete process.env.HTTPS_PROXY;
			else process.env.HTTPS_PROXY = this.originalEnv.https;
		}
		if (this.originalDispatcher !== undefined) {
			this.hooks.setGlobalDispatcher(this.originalDispatcher);
		}
		this.activeUrl = undefined;
		return true;
	}
}
