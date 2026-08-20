import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
	formatCcSwitchProviderName,
	readCurrentCcSwitchProviderNames,
} from "../lib/cc-switch-provider-names.ts";

function withTempDirectory(run) {
	const directory = mkdtempSync(join(tmpdir(), "pi-cc-switch-names-"));
	try {
		run(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function createProvidersDb(dbPath, rows) {
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE providers (
			id TEXT NOT NULL,
			app_type TEXT NOT NULL,
			name TEXT NOT NULL,
			settings_config TEXT NOT NULL,
			website_url TEXT,
			category TEXT,
			created_at INTEGER,
			sort_index INTEGER,
			notes TEXT,
			icon TEXT,
			icon_color TEXT,
			meta TEXT NOT NULL DEFAULT '{}',
			is_current BOOLEAN NOT NULL DEFAULT 0,
			in_failover_queue BOOLEAN NOT NULL DEFAULT 0,
			PRIMARY KEY (id, app_type)
		)
	`);
	const insert = db.prepare(
		"INSERT INTO providers (id, app_type, name, settings_config, is_current) VALUES (?, ?, ?, ?, ?)",
	);
	for (const row of rows) {
		insert.run(row.id, row.appType, row.name, row.settingsConfig ?? "{}", row.isCurrent ? 1 : 0);
	}
	db.close();
}

test("reads the current claude and codex provider names from the cc-switch db", () => {
	withTempDirectory((directory) => {
		const dbPath = join(directory, "cc-switch.db");
		createProvidersDb(dbPath, [
			{ id: "claude-active", appType: "claude", name: "anyrouter", isCurrent: true },
			{ id: "claude-other", appType: "claude", name: "FC", isCurrent: false },
			{ id: "codex-active", appType: "codex", name: "基元律动", isCurrent: true },
			{ id: "gemini", appType: "gemini", name: "Google", isCurrent: true },
		]);
		assert.deepEqual(readCurrentCcSwitchProviderNames(dbPath), {
			claude: "anyrouter",
			codex: "基元律动",
		});
	});
});

test("ignores non-current providers and other app types", () => {
	withTempDirectory((directory) => {
		const dbPath = join(directory, "cc-switch.db");
		createProvidersDb(dbPath, [
			{ id: "claude-inactive", appType: "claude", name: "FC", isCurrent: false },
			{ id: "opencode-active", appType: "opencode", name: "DeepSeek", isCurrent: true },
		]);
		assert.deepEqual(readCurrentCcSwitchProviderNames(dbPath), {});
	});
});

test("only current provider present per app type is returned", () => {
	withTempDirectory((directory) => {
		const dbPath = join(directory, "cc-switch.db");
		createProvidersDb(dbPath, [
			{ id: "claude-active", appType: "claude", name: "  anyrouter  ", isCurrent: true },
		]);
		assert.deepEqual(readCurrentCcSwitchProviderNames(dbPath), { claude: "anyrouter" });
	});
});

test("missing database file returns an empty result", () => {
	withTempDirectory((directory) => {
		assert.deepEqual(readCurrentCcSwitchProviderNames(join(directory, "does-not-exist.db")), {});
	});
});

test("corrupted database file returns an empty result", () => {
	withTempDirectory((directory) => {
		const dbPath = join(directory, "cc-switch.db");
		writeFileSync(dbPath, "this is not a sqlite database", "utf8");
		assert.deepEqual(readCurrentCcSwitchProviderNames(dbPath), {});
	});
});

test("formatCcSwitchProviderName wraps a name with a middot separator", () => {
	assert.equal(formatCcSwitchProviderName("anyrouter"), " · anyrouter");
	assert.equal(formatCcSwitchProviderName(" 基元律动 "), " · 基元律动");
	assert.equal(formatCcSwitchProviderName(undefined), "");
	assert.equal(formatCcSwitchProviderName(""), "");
	assert.equal(formatCcSwitchProviderName("   "), "");
});
