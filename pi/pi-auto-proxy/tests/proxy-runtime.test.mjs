import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoProxyRuntime } from "../lib/proxy-runtime.ts";
import { parseVerifyUrlEnv, verifyProxyUrl } from "../lib/proxy-verify.ts";

function fakeHooks() {
	const calls = [];
	const state = { dispatcher: { name: "original" } };
	const envHttpProxyAgent = class FakeEnvHttpProxyAgent {
		constructor(opts) {
			calls.push(`construct:${JSON.stringify(opts)}`);
		}
	};
	return {
		hooks: {
			getGlobalDispatcher: () => state.dispatcher,
			setGlobalDispatcher: (d) => {
				state.dispatcher = d;
				calls.push("swap");
			},
			EnvHttpProxyAgent: envHttpProxyAgent,
		},
		calls,
		state,
	};
}

function clearEnvProxies() {
	delete process.env.HTTP_PROXY;
	delete process.env.HTTPS_PROXY;
}

test("apply sets env + swaps dispatcher; clear restores both", () => {
	clearEnvProxies();
	process.env.HTTP_PROXY = "http://user-corporate:8080"; // 用户 shell 原有代理
	process.env.HTTPS_PROXY = "http://user-corporate:8080";
	const { hooks, calls, state } = fakeHooks();
	const original = hooks.getGlobalDispatcher();
	const runtime = new AutoProxyRuntime(hooks);

	assert.equal(runtime.apply("http://127.0.0.1:7890"), true);
	assert.equal(process.env.HTTP_PROXY, "http://127.0.0.1:7890");
	assert.equal(process.env.HTTPS_PROXY, "http://127.0.0.1:7890");
	assert.notEqual(state.dispatcher, original); // dispatcher 已被替换
	assert.equal(runtime.activeUrl, "http://127.0.0.1:7890");
	assert.deepEqual(calls, ['construct:{"allowH2":false}', "swap"]);

	// 同一 URL 重复 apply 是 no-op
	assert.equal(runtime.apply("http://127.0.0.1:7890"), false);
	assert.equal(calls.length, 2);

	// clear 还原用户原有代理环境变量 + 原始 dispatcher
	assert.equal(runtime.clear(), true);
	assert.equal(process.env.HTTP_PROXY, "http://user-corporate:8080");
	assert.equal(process.env.HTTPS_PROXY, "http://user-corporate:8080");
	assert.equal(state.dispatcher, original);
	assert.equal(runtime.activeUrl, undefined);
	// 再 clear 是 no-op
	assert.equal(runtime.clear(), false);
});

test("clear deletes env vars when user had none set", () => {
	clearEnvProxies();
	const { hooks } = fakeHooks();
	const runtime = new AutoProxyRuntime(hooks);
	runtime.apply("http://127.0.0.1:7890");
	runtime.clear();
	assert.equal(process.env.HTTP_PROXY, undefined);
	assert.equal(process.env.HTTPS_PROXY, undefined);
});

test("parseVerifyUrlEnv", () => {
	assert.equal(parseVerifyUrlEnv(undefined), "http://www.gstatic.com/generate_204");
	assert.equal(parseVerifyUrlEnv(""), "http://www.gstatic.com/generate_204");
	assert.equal(parseVerifyUrlEnv("off"), undefined);
	assert.equal(parseVerifyUrlEnv("0"), undefined);
	assert.equal(parseVerifyUrlEnv("FALSE"), undefined);
	assert.equal(parseVerifyUrlEnv("https://example.com/check"), "https://example.com/check");
});

test("verifyProxyUrl passes through the proxy and accepts 2xx", async () => {
	const seen = [];
	const fakeFetch = async (url, opts) => {
		seen.push({ url, opts });
		return { status: 204 };
	};
	assert.equal(
		await verifyProxyUrl("http://127.0.0.1:7890", "http://www.gstatic.com/generate_204", {
			fetchImpl: fakeFetch,
			timeoutMs: 500,
		}),
		true,
	);
	assert.equal(seen.length, 1);
	assert.ok(seen[0].opts.dispatcher); // 使用显式 ProxyAgent
});

test("verifyProxyUrl fails on error status or throw", async () => {
	assert.equal(
		await verifyProxyUrl("http://127.0.0.1:7890", "http://x/", {
			fetchImpl: async () => ({ status: 502 }),
			timeoutMs: 500,
		}),
		false,
	);
	assert.equal(
		await verifyProxyUrl("http://127.0.0.1:7890", "http://x/", {
			fetchImpl: async () => {
				throw new Error("boom");
			},
			timeoutMs: 500,
		}),
		false,
	);
});
