import { fetch as undiciFetch, ProxyAgent } from "undici";

export const DEFAULT_VERIFY_URL = "http://www.gstatic.com/generate_204";
export const DEFAULT_VERIFY_TIMEOUT_MS = 3000;

/** "off"/"0"/"none"/"false"/"no" → undefined（不验证）；空 → 默认 URL。 */
export function parseVerifyUrlEnv(raw: string | undefined): string | undefined {
	const value = raw?.trim();
	if (!value) return DEFAULT_VERIFY_URL;
	if (/^(0|off|none|false|no)$/i.test(value)) return undefined;
	return value;
}

export interface VerifyOptions {
	timeoutMs?: number;
	/** 测试注入用。 */
	fetchImpl?: typeof undiciFetch;
}

/** 通过候选代理发一次小请求，确认它能访问公网。成功返回 true。 */
export async function verifyProxyUrl(url: string, verifyUrl: string, options: VerifyOptions = {}): Promise<boolean> {
	const fetchImpl = options.fetchImpl ?? undiciFetch;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS);
	let agent: ProxyAgent | undefined;
	try {
		agent = new ProxyAgent(url);
		const response = await fetchImpl(verifyUrl, {
			dispatcher: agent,
			signal: controller.signal,
			redirect: "follow",
		});
		return response.status >= 200 && response.status < 400;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
		void agent?.close().catch(() => undefined);
	}
}
