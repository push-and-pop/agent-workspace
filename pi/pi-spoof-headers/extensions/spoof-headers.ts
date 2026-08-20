import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext, BeforeProviderHeadersEvent } from "@earendil-works/pi-coding-agent";

/**
 * pi-spoof-headers
 *
 * Makes pi's provider HTTP requests carry the request headers of the real
 * Codex CLI (for OpenAI-compatible APIs) or Claude Code (for Anthropic APIs),
 * so transits / relay stations that sniff agent identity treat pi as if it
 * were those CLIs.
 *
 * Works through the built-in `before_provider_headers` event. The event fires
 * for every provider request pi makes; handlers mutate `event.headers` in
 * place (set a string to override, `null` to delete). The result becomes the
 * provider SDK's default headers, so overriding `user-agent` here beats the
 * openai / anthropic SDK's own user agent.
 *
 * Routing (per active model's `api`):
 *   - openai-completions / openai-responses / openai-codex-responses → Codex CLI persona
 *   - anthropic-messages / cc-switch-anthropic                      → Claude Code persona
 *
 * cc-switch-provider coverage: that extension registers *custom* stream APIs
 * (`cc-switch-codex-responses`, `cc-switch-anthropic`) that build their own
 * header maps. It has been patched to merge `options.headers` (which carry
 * this event's mutations) into those maps after building them, so the spoof
 * also applies on cc-switch routes. The merge skips `authorization` /
 * `x-api-key` so each route's own credentials always win.
 *
 * Configuration (env vars, all optional):
 *   PI_SPOOF_HEADERS=0|off|false         master switch, default enabled
 *   PI_SPOOF_CODEX_USER_AGENT            default "codex-cli/0.147.0"
 *   PI_SPOOF_CODEX_STAINLESS=1|0         mimic rust SDK x-stainless-* (default 0)
 *   PI_SPOOF_CLAUDE_USER_AGENT           default "claude-cli/2.1.185 (external, cli)"
 *   PI_SPOOF_CLAUDE_X_APP                default "cli"
 *   PI_SPOOF_CLAUDE_BETAS                comma list to (re)write anthropic-beta,
 *                                        default mirrors ohmypi models.yml's Claude Code
 *                                        beta set (incl. context-1m-2025-08-07)
 */

type ProviderHeaders = Record<string, string | null>;

const CODEX_APIS = new Set([
	"openai-completions",
	"openai-responses",
	"openai-codex-responses",
	"cc-switch-codex-responses",
]);

const CLAUDE_APIS = new Set([
	"anthropic-messages",
	"cc-switch-anthropic",
]);

const DEFAULT_CODEX_USER_AGENT = "codex-cli/0.147.0";
const DEFAULT_CLAUDE_USER_AGENT = "claude-cli/2.1.185 (external, cli)";
const DEFAULT_CLAUDE_X_APP = "cli";
// Beta 集对齐 ~/.omp/agent/models.yml anyrouter-claude 的 anthropic-beta 头，
// 其中 context-1m-2025-08-07 是 1M 上下文变体（[1m] 后缀模型）能否过网关的开关。
const DEFAULT_CLAUDE_BETAS = [
	"claude-code-20250219",
	"context-1m-2025-08-07",
	"interleaved-thinking-2025-05-14",
	"redact-thinking-2026-02-12",
	"thinking-token-count-2026-05-13",
	"context-management-2025-06-27",
	"prompt-caching-scope-2026-01-05",
	"mid-conversation-system-2026-04-07",
	"advanced-tool-use-2025-11-20",
	"effort-2025-11-24",
];

function envValue(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value && value.length > 0 ? value : undefined;
}

function envFlag(name: string, defaultValue: boolean): boolean {
	const value = envValue(name);
	if (!value) return defaultValue;
	return !/^(0|false|no|off)$/i.test(value);
}

function readConfig() {
	return {
		enabled: envFlag("PI_SPOOF_HEADERS", true),
		codexUserAgent: envValue("PI_SPOOF_CODEX_USER_AGENT") ?? DEFAULT_CODEX_USER_AGENT,
		codexStainless: envFlag("PI_SPOOF_CODEX_STAINLESS", false),
		claudeUserAgent: envValue("PI_SPOOF_CLAUDE_USER_AGENT") ?? DEFAULT_CLAUDE_USER_AGENT,
		claudeXApp: envValue("PI_SPOOF_CLAUDE_X_APP") ?? DEFAULT_CLAUDE_X_APP,
		claudeBetas: envValue("PI_SPOOF_CLAUDE_BETAS") ?? DEFAULT_CLAUDE_BETAS.join(","),
	};
}

type SpoofConfig = ReturnType<typeof readConfig>;

let config: SpoofConfig | undefined;

// Real codex-cli 0.147.0 (Rust) sends `user-agent: codex-cli/<version>` and
// `authorization` only — no x-stainless-* headers at all. pi's openai-node SDK
// injects x-stainless-lang: js etc. after our hook runs, so we can't fully
// delete them; optionally override them to rust-flavored values so the wire
// doesn't scream "openai-node/js".
function applyCodexHeaders(headers: ProviderHeaders, cfg: SpoofConfig): void {
	headers["user-agent"] = cfg.codexUserAgent;
	headers["originator"] = null; // pi's codex-responses transport sets "originator: pi"; real codex doesn't send it
	if (cfg.codexStainless) {
		headers["x-stainless-lang"] = "rust";
		headers["x-stainless-runtime"] = "rustc";
		headers["x-stainless-runtime-version"] = "1.85.1";
		headers["x-stainless-os"] = platformOs();
		headers["x-stainless-arch"] = process.arch === "x64" ? "x64" : process.arch;
		headers["x-stainless-package-version"] = "0.36.0";
		headers["x-stainless-async"] = "false";
	}
}

// Header set observed from a real Claude Code / pi OAuth capture
// (pi-cc-switch-debug-request.json): claude-cli UA, x-app, session id,
// anthropic-version, stainless js headers. anthropic-beta defaults to the
// full ohmypi models.yml beta list unless PI_SPOOF_CLAUDE_BETAS overrides it.
function applyClaudeHeaders(headers: ProviderHeaders, cfg: SpoofConfig, sessionId: string): void {
	headers["user-agent"] = cfg.claudeUserAgent;
	headers["x-app"] = cfg.claudeXApp;
	headers["x-claude-code-session-id"] = sessionId;
	headers["anthropic-version"] = "2023-06-01";
	headers["anthropic-dangerous-direct-browser-access"] = "true";
	// Match the real claude-cli stack (JS SDK) instead of whatever pi set.
	headers["x-stainless-lang"] = "js";
	headers["x-stainless-runtime"] = "node";
	headers["x-stainless-runtime-version"] = process.versions.node ?? "v24.3.0";
	headers["x-stainless-os"] = platformOs();
	headers["x-stainless-arch"] = process.arch === "x64" ? "x64" : process.arch;
	headers["x-stainless-package-version"] = "0.81.0";
	headers["x-stainless-retry-count"] = "0";
	headers["x-stainless-timeout"] = "600";
	// anthropic-beta 默认对齐 ohmypi models.yml 的完整 Claude Code beta 集，
	// PI_SPOOF_CLAUDE_BETAS 可整体覆盖。
	headers["anthropic-beta"] = cfg.claudeBetas.split(",").map((b) => b.trim()).filter(Boolean).join(",");
}

function platformOs(): string {
	const platform = process.platform;
	if (platform === "win32") return "Windows";
	if (platform === "darwin") return "MacOS";
	if (platform === "linux") return "Linux";
	return platform;
}

export default function (pi: ExtensionAPI) {
	config ??= readConfig();

	pi.on("before_provider_headers", (event: BeforeProviderHeadersEvent, ctx: ExtensionContext) => {
		if (!config?.enabled) return;
		const api = ctx.model?.api;
		if (!api) return;

		if (CODEX_APIS.has(api)) {
			applyCodexHeaders(event.headers, config);
			return;
		}
		if (CLAUDE_APIS.has(api)) {
			const sessionId = ctx.sessionManager.getSessionId() ?? randomUUID();
			applyClaudeHeaders(event.headers, config, sessionId);
		}
	});

	pi.registerCommand("spoof-headers", {
		description: "Show pi-spoof-headers configuration and current persona mapping",
		handler: async (_args, ctx) => {
			const cfg = config ?? readConfig();
			const api = ctx.model?.api;
			const persona = CODEX_APIS.has(api ?? "") ? "codex-cli" : CLAUDE_APIS.has(api ?? "") ? "claude-code" : "none";
			ctx.ui.notify(
				[
					`pi-spoof-headers: ${cfg.enabled ? "enabled" : "disabled"}`,
					`  codex  user-agent: ${cfg.codexUserAgent}${cfg.codexStainless ? " (+rust stainless)" : ""}`,
					`  claude user-agent: ${cfg.claudeUserAgent}  x-app: ${cfg.claudeXApp}`,
					`  current model api: ${api ?? "(none)"} → persona: ${persona}`,
					`  override with PI_SPOOF_* env vars (see README)`,
				].join("\n"),
				"info",
			);
		},
	});
}
