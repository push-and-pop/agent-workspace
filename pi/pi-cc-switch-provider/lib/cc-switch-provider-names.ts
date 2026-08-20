import { createRequire } from "node:module";

export interface CcSwitchProviderNames {
	/** 当前 cc-switch Claude 供应商名称（providers 表的 name 列），未找到时缺省。 */
	claude?: string;
	/** 当前 cc-switch Codex 供应商名称，未找到时缺省。 */
	codex?: string;
}

interface SqliteRow {
	appType: string;
	name: unknown;
}

interface SqliteDatabaseLike {
	prepare(sql: string): { all(): unknown[] };
	close(): void;
}

interface SqliteModuleLike {
	DatabaseSync?: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabaseLike;
	Database?: new (path: string, options?: { readonly?: boolean }) => SqliteDatabaseLike;
}

/**
 * 只读打开 cc-switch SQLite 数据库（~/.cc-switch/cc-switch.db）。
 *
 * 扩展跑在 pi（bun + jiti）里、测试跑在 node 里，两个运行时各自只支持一种
 * SQLite 内建模块：
 *   - node 22.5+：`node:sqlite`（DatabaseSync）
 *   - bun：`bun:sqlite`（Database）
 * 这里按 createRequire 逐个尝试，失败即返回 undefined，绝不让 Provider 注册流程崩掉。
 */
function openCcSwitchDbReadonly(dbPath: string): SqliteDatabaseLike | undefined {
	const require = createRequire(import.meta.url);

	let module: SqliteModuleLike | undefined;
	try {
		module = require("node:sqlite") as SqliteModuleLike;
	} catch {
		try {
			module = require("bun:sqlite") as SqliteModuleLike;
		} catch {
			return undefined;
		}
	}
	if (!module) return undefined;

	try {
		if (typeof module.DatabaseSync === "function") {
			return new module.DatabaseSync(dbPath, { readOnly: true });
		}
		if (typeof module.Database === "function") {
			return new module.Database(dbPath, { readonly: true });
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * 读取 cc-switch 当前激活的 Claude/Codex 供应商名称。
 *
 * 供应商名称是用户在当前 cc-switch Provider 上自定义的显示名（如 "anyrouter"、
 * "基元律动"），只存在 cc-switch 的 SQLite 数据库里，写出的 CLI 配置文件中不包含。
 * 数据库缺失/损坏/被占用时返回空对象，调用方决定是否展示。
 */
export function readCurrentCcSwitchProviderNames(dbPath: string): CcSwitchProviderNames {
	const db = openCcSwitchDbReadonly(dbPath);
	if (!db) return {};
	try {
		const rows = db
			.prepare(
				"SELECT app_type AS appType, name FROM providers WHERE is_current = 1 AND app_type IN ('claude', 'codex')",
			)
			.all() as SqliteRow[];
		const names: CcSwitchProviderNames = {};
		for (const row of rows) {
			if (row.appType !== "claude" && row.appType !== "codex") continue;
			const name = typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : undefined;
			if (!name) continue;
			if (names[row.appType] === undefined) names[row.appType] = name;
		}
		return names;
	} catch {
		return {};
	} finally {
		try {
			db.close();
		} catch {
			// 只读连接关闭失败可忽略。
		}
	}
}

/** 供应商名称的展示包装：读不到时返回空串（调用方直接拼到文案后面）。 */
export function formatCcSwitchProviderName(name: string | undefined): string {
	return name && name.trim().length > 0 ? ` · ${name.trim()}` : "";
}
