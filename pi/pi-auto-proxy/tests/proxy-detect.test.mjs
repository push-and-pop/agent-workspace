import { test } from "node:test";
import assert from "node:assert/strict";
import {
	normalizeProxyUrl,
	parseProxyServerValue,
	parseRegistryOutput,
	buildProxyPortList,
	probeProxyPorts,
	DEFAULT_PROXY_PORTS,
} from "../lib/proxy-detect.ts";

test("normalizeProxyUrl", () => {
	assert.equal(normalizeProxyUrl("127.0.0.1:7890"), "http://127.0.0.1:7890");
	assert.equal(normalizeProxyUrl("http://127.0.0.1:7890"), "http://127.0.0.1:7890");
	assert.equal(normalizeProxyUrl("  localhost:10809 "), "http://localhost:10809");
	assert.equal(normalizeProxyUrl("socks5://127.0.0.1:10808"), undefined);
	assert.equal(normalizeProxyUrl("   "), undefined);
	assert.equal(normalizeProxyUrl(""), undefined);
});

test("parseProxyServerValue", () => {
	assert.equal(parseProxyServerValue("127.0.0.1:7890"), "http://127.0.0.1:7890");
	assert.equal(
		parseProxyServerValue("http=127.0.0.1:7890;https=127.0.0.1:7890"),
		"http://127.0.0.1:7890",
	);
	assert.equal(parseProxyServerValue("https=127.0.0.1:7890"), "http://127.0.0.1:7890");
	assert.equal(
		parseProxyServerValue("http=proxy.example.com:8080;https=proxy.example.com:8443"),
		"http://proxy.example.com:8080",
	);
	// 仅 SOCKS：不支持
	assert.equal(parseProxyServerValue("socks=127.0.0.1:10808"), undefined);
	assert.equal(parseProxyServerValue(""), undefined);
	assert.equal(parseProxyServerValue("  "), undefined);
});

test("parseRegistryOutput", () => {
	const sample = `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    AutoConfigURL    REG_SZ
    ProxyEnable    REG_DWORD    0x1
    ProxyOverride    REG_SZ    <local>
    ProxyServer    REG_SZ    127.0.0.1:7890`;
	assert.deepEqual(parseRegistryOutput(sample), { url: "http://127.0.0.1:7890", source: "registry" });

	// 未启用
	const disabled = sample.replace("0x1", "0x0");
	assert.equal(parseRegistryOutput(disabled), undefined);

	// 缺 ProxyServer
	assert.equal(parseRegistryOutput("ProxyEnable    REG_DWORD    0x1\n"), undefined);

	// 空输出
	assert.equal(parseRegistryOutput(""), undefined);
});

test("buildProxyPortList", () => {
	assert.deepEqual(buildProxyPortList(), DEFAULT_PROXY_PORTS);
	const extra = buildProxyPortList("9000, 9100 9200");
	assert.ok(extra.includes(9000) && extra.includes(9100) && extra.includes(9200));
	// 去重：默认已有 7890
	assert.equal(extra.filter((p) => p === 7890).length, 1);
	// 非法值被忽略
	assert.deepEqual(buildProxyPortList("abc,-1,70000"), DEFAULT_PROXY_PORTS);
});

test("probeProxyPorts returns open ports in input priority order", async () => {
	const fakeConnect = async (port) => port !== 9999; // 9999 关闭，其余全开
	const candidates = await probeProxyPorts([7890, 10809, 9999, 10808], { connect: fakeConnect });
	assert.deepEqual(
		candidates.map((c) => c.url),
		["http://127.0.0.1:7890", "http://127.0.0.1:10809", "http://127.0.0.1:10808"],
	);
	assert.equal(candidates[0].source, "probe");
	assert.equal(candidates[0].port, 7890);
});

test("probeProxyPorts returns empty when nothing open", async () => {
	const candidates = await probeProxyPorts([1, 2, 3], { connect: async () => false });
	assert.deepEqual(candidates, []);
});
