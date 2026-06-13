# V2 架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 plugin-as-subprocess 模型重构为 connector-with-sandbox 模型，统一观测数据模型，替换 JSON 缓存为 SQLite，自管密钥替代 safeStorage。

**Architecture:** 地基优先（Bottom-up）：先建数据层（Observation + SQLite + Vault），再建连接器运行时（manifest + sandbox），然后接入 LocalAPI，最后改 UI。每步 TDD，clean break 无迁移。

**Tech Stack:** TypeScript, better-sqlite3, isolated-vm (or node:vm fallback), Zod, esbuild, undici, Node http.createServer

**Spec:** `docs/superpowers/specs/2026-06-13-v2-architecture-refactor-design.md`

---

## 阶段说明

| 本计划阶段 | 源 v2 阶段 | 内容                                             |
| ---------- | ---------- | ------------------------------------------------ |
| P1         | P1 地基    | Observation 类型 + SQLite + SecretsVault         |
| P2         | P2 沙箱    | 沙箱 PoC + Manifest + Connector Runtime + Tier 1 |
| P3         | —          | Scheduler 改造 + Tier 1 连接器迁移               |
| P4         | P4 观测    | LocalAPI + Brave                                 |
| P5         | P3 会话    | SessionManager + Tier 2                          |
| P6         | —          | IPC + UI 改造                                    |
| P7         | —          | 旧代码清理                                       |

---

# P1：地基

## Task 1: Observation 类型与 Zod schema

**Files:**

- Create: `src/shared/types/observation.ts`
- Create: `src/shared/schemas/observation.ts`
- Create: `tests/unit/shared/observation.test.ts`

- [ ] **Step 1: 写 Observation 类型**

```ts
// src/shared/types/observation.ts

export type ObservationWindow = "second" | "day" | "month" | "total";
export type ObservationDisplayStyle = "percent" | "ratio";
export type ObservationStatus = "normal" | "warning" | "critical" | "unknown";
export type ObservationSource = "poll" | "local" | "session" | "wrapper" | "probe" | "gateway";

export interface Observation {
    readonly provider: string;
    readonly source_instance_id: string;
    readonly account_id: string;
    readonly account_label: string;
    readonly metric_id: string;
    readonly name: string;
    readonly window: ObservationWindow;
    readonly used: number | null;
    readonly limit: number | null;
    readonly display_style: ObservationDisplayStyle;
    readonly reset_at: number | null;
    readonly status: ObservationStatus;
    readonly observed_at: number;
    readonly source: ObservationSource;
    readonly stale: boolean;
    readonly last_error: string | null;
}
```

- [ ] **Step 2: 写 Zod schema**

```ts
// src/shared/schemas/observation.ts

import { z } from "zod/v3";

export const observation_window_schema = z.enum(["second", "day", "month", "total"]);
export const observation_display_style_schema = z.enum(["percent", "ratio"]);
export const observation_status_schema = z.enum(["normal", "warning", "critical", "unknown"]);
export const observation_source_schema = z.enum([
    "poll",
    "local",
    "session",
    "wrapper",
    "probe",
    "gateway",
]);

const finite_number = z.number().finite();

export const observation_schema = z.object({
    provider: z.string().min(1),
    source_instance_id: z.string().min(1),
    account_id: z.string().min(1),
    account_label: z.string(),
    metric_id: z.string().min(1),
    name: z.string().min(1),
    window: observation_window_schema,
    used: finite_number.nullable(),
    limit: finite_number.nullable(),
    display_style: observation_display_style_schema,
    reset_at: finite_number.nullable(),
    status: observation_status_schema,
    observed_at: finite_number,
    source: observation_source_schema,
    stale: z.boolean(),
    last_error: z.string().nullable(),
});

export const observation_ingest_schema = observation_schema
    .omit({
        observed_at: true,
        stale: true,
        last_error: true,
    })
    .extend({
        source: observation_source_schema,
    });

export type ObservationInput = z.infer<typeof observation_ingest_schema>;
```

- [ ] **Step 3: 写测试**

```ts
// tests/unit/shared/observation.test.ts

import { describe, it, expect } from "vitest";
import {
    observation_schema,
    observation_ingest_schema,
} from "../../../src/shared/schemas/observation";

describe("observation_schema", () => {
    const valid_observation = {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "tavily:monthly_usage",
        name: "月度用量",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: 1735689600000,
        status: "normal",
        observed_at: 1735603200000,
        source: "poll",
        stale: false,
        last_error: null,
    };

    it("accepts valid observation", () => {
        const result = observation_schema.safeParse(valid_observation);
        expect(result.success).toBe(true);
    });

    it("rejects empty provider", () => {
        const result = observation_schema.safeParse({ ...valid_observation, provider: "" });
        expect(result.success).toBe(false);
    });

    it("rejects invalid window", () => {
        const result = observation_schema.safeParse({ ...valid_observation, window: "hourly" });
        expect(result.success).toBe(false);
    });

    it("rejects invalid source", () => {
        const result = observation_schema.safeParse({ ...valid_observation, source: "magic" });
        expect(result.success).toBe(false);
    });

    it("allows null used and limit", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            used: null,
            limit: null,
        });
        expect(result.success).toBe(true);
    });
});

describe("observation_ingest_schema", () => {
    it("omits observed_at, stale, last_error", () => {
        const input = {
            provider: "tavily",
            source_instance_id: "tavily-1",
            account_id: "default",
            account_label: "Tavily",
            metric_id: "tavily:monthly_usage",
            name: "月度用量",
            window: "month",
            used: 100,
            limit: 1000,
            display_style: "ratio",
            reset_at: 1735689600000,
            status: "normal",
            source: "poll",
        };
        const result = observation_ingest_schema.safeParse(input);
        expect(result.success).toBe(true);
    });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run tests/unit/shared/observation.test.ts`
Expected: FAIL（文件还不存在）

- [ ] **Step 5: 创建文件使测试通过**

创建 `src/shared/types/observation.ts` 和 `src/shared/schemas/observation.ts`，内容如上。

Run: `pnpm vitest run tests/unit/shared/observation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/observation.ts src/shared/schemas/observation.ts tests/unit/shared/observation.test.ts
git commit -m "feat: add Observation type and Zod schema (P1 foundation)"
```

---

## Task 2: SQLite Observation Store

**Files:**

- Create: `src/main/core/observation/observation-store.ts`
- Create: `tests/integration/observation/observation-store.test.ts`
- Modify: `package.json`（加 `better-sqlite3` 依赖）

- [ ] **Step 1: 安装 better-sqlite3**

Run: `pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3`
Expected: package.json 更新

- [ ] **Step 2: 写 ObservationStore 接口和实现**

```ts
// src/main/core/observation/observation-store.ts

import Database from "better-sqlite3";
import type { Observation } from "../../../shared/types/observation";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("observation-store");

export interface ObservationStore {
    insert(obs: Observation): void;
    get_latest(
        provider: string,
        account_id: string,
        metric_id: string,
        source_instance_id: string,
    ): Observation | null;
    list_latest_by_provider(provider: string): Observation[];
    list_all_providers(): string[];
    prune(older_than_ms: number): number;
    close(): void;
}

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    source_instance_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_label TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    name TEXT NOT NULL,
    window TEXT NOT NULL,
    used REAL,
    "limit" REAL,
    display_style TEXT NOT NULL,
    reset_at INTEGER,
    status TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    stale INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_lookup
    ON observations(provider, account_id, metric_id, source_instance_id, observed_at);
`;

function row_to_observation(row: Record<string, unknown>): Observation {
    return {
        provider: row["provider"] as string,
        source_instance_id: row["source_instance_id"] as string,
        account_id: row["account_id"] as string,
        account_label: row["account_label"] as string,
        metric_id: row["metric_id"] as string,
        name: row["name"] as string,
        window: row["window"] as Observation["window"],
        used: row["used"] as number | null,
        limit: row["limit"] as number | null,
        display_style: row["display_style"] as Observation["display_style"],
        reset_at: row["reset_at"] as number | null,
        status: row["status"] as Observation["status"],
        observed_at: row["observed_at"] as number,
        source: row["source"] as Observation["source"],
        stale: (row["stale"] as number) === 1,
        last_error: row["last_error"] as string | null,
    };
}

export function create_observation_store(db_path: string): ObservationStore {
    const db = new Database(db_path);
    db.pragma("journal_mode = WAL");
    db.exec(INIT_SQL);

    const insert_stmt = db.prepare(`
        INSERT INTO observations (
            provider, source_instance_id, account_id, account_label,
            metric_id, name, window, used, "limit", display_style,
            reset_at, status, observed_at, source, stale, last_error
        ) VALUES (
            @provider, @source_instance_id, @account_id, @account_label,
            @metric_id, @name, @window, @used, @limit, @display_style,
            @reset_at, @status, @observed_at, @source, @stale, @last_error
        )
    `);

    const get_latest_stmt = db.prepare(`
        SELECT * FROM observations
        WHERE provider = ? AND account_id = ? AND metric_id = ? AND source_instance_id = ?
        ORDER BY observed_at DESC LIMIT 1
    `);

    const list_latest_by_provider_stmt = db.prepare(`
        SELECT * FROM observations o1
        WHERE o1.provider = ?
        AND o1.observed_at = (
            SELECT MAX(o2.observed_at) FROM observations o2
            WHERE o2.provider = o1.provider
            AND o2.account_id = o1.account_id
            AND o2.metric_id = o1.metric_id
            AND o2.source_instance_id = o1.source_instance_id
        )
    `);

    const list_providers_stmt = db.prepare("SELECT DISTINCT provider FROM observations");

    const prune_stmt = db.prepare(
        "DELETE FROM observations WHERE observed_at < ? AND id NOT IN (" +
            "SELECT id FROM observations o1 WHERE o1.observed_at = (" +
            "SELECT MAX(o2.observed_at) FROM observations o2 " +
            "WHERE o2.provider = o1.provider AND o2.account_id = o1.account_id " +
            "AND o2.metric_id = o1.metric_id AND o2.source_instance_id = o1.source_instance_id" +
            "))",
    );

    return {
        insert(obs: Observation): void {
            insert_stmt.run({
                provider: obs.provider,
                source_instance_id: obs.source_instance_id,
                account_id: obs.account_id,
                account_label: obs.account_label,
                metric_id: obs.metric_id,
                name: obs.name,
                window: obs.window,
                used: obs.used,
                limit: obs.limit,
                display_style: obs.display_style,
                reset_at: obs.reset_at,
                status: obs.status,
                observed_at: obs.observed_at,
                source: obs.source,
                stale: obs.stale ? 1 : 0,
                last_error: obs.last_error,
            });
        },

        get_latest(provider, account_id, metric_id, source_instance_id) {
            const row = get_latest_stmt.get(provider, account_id, metric_id, source_instance_id);
            return row ? row_to_observation(row as Record<string, unknown>) : null;
        },

        list_latest_by_provider(provider) {
            const rows = list_latest_by_provider_stmt.all(provider) as Record<string, unknown>[];
            return rows.map(row_to_observation);
        },

        list_all_providers() {
            const rows = list_providers_stmt.all() as { provider: string }[];
            return rows.map((r) => r.provider);
        },

        prune(older_than_ms) {
            const result = prune_stmt.run(older_than_ms);
            return result.changes;
        },

        close() {
            db.close();
        },
    };
}
```

- [ ] **Step 3: 写测试**

```ts
// tests/integration/observation/observation-store.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

let temp_dir: string;
let store: ObservationStore;

function make_observation(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "tavily",
        source_instance_id: "tavily-1",
        account_id: "default",
        account_label: "Tavily",
        metric_id: "tavily:monthly_usage",
        name: "月度用量",
        window: "month",
        used: 100,
        limit: 1000,
        display_style: "ratio",
        reset_at: 1735689600000,
        status: "normal",
        observed_at: Date.now(),
        source: "poll",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "obs-store-test-"));
    store = create_observation_store(join(temp_dir, "test.db"));
});

afterEach(() => {
    store.close();
    rm(temp_dir, { recursive: true, force: true }).catch(() => {});
});

describe("observation-store", () => {
    it("inserts and retrieves latest observation", () => {
        const obs = make_observation({ observed_at: 1000 });
        store.insert(obs);
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        expect(result).not.toBeNull();
        expect(result!.observed_at).toBe(1000);
    });

    it("returns null for non-existent key", () => {
        const result = store.get_latest("nope", "nope", "nope", "nope");
        expect(result).toBeNull();
    });

    it("returns latest when multiple observations exist for same key", () => {
        store.insert(make_observation({ observed_at: 1000 }));
        store.insert(make_observation({ observed_at: 2000 }));
        store.insert(make_observation({ observed_at: 1500 }));
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        expect(result!.observed_at).toBe(2000);
    });

    it("keeps all rows (append-only)", () => {
        store.insert(make_observation({ observed_at: 1000 }));
        store.insert(make_observation({ observed_at: 2000 }));
        store.insert(make_observation({ observed_at: 3000 }));
        const all = store.list_latest_by_provider("tavily");
        // list_latest_by_provider returns only the latest per (account, metric, source)
        expect(all).toHaveLength(1);
        expect(all[0].observed_at).toBe(3000);
    });

    it("lists latest per unique (account, metric, source) within provider", () => {
        store.insert(
            make_observation({
                account_id: "a1",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 1000,
            }),
        );
        store.insert(
            make_observation({
                account_id: "a1",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 2000,
            }),
        );
        store.insert(
            make_observation({
                account_id: "a2",
                metric_id: "m1",
                source_instance_id: "s1",
                observed_at: 3000,
            }),
        );
        const all = store.list_latest_by_provider("tavily");
        expect(all).toHaveLength(2);
    });

    it("lists all providers", () => {
        store.insert(make_observation({ provider: "tavily" }));
        store.insert(make_observation({ provider: "deepseek" }));
        const providers = store.list_all_providers();
        expect(providers).toContain("tavily");
        expect(providers).toContain("deepseek");
    });

    it("prunes old observations but keeps latest", () => {
        const now = Date.now();
        store.insert(make_observation({ observed_at: now - 100 * 24 * 60 * 60 * 1000 }));
        store.insert(make_observation({ observed_at: now - 91 * 24 * 60 * 60 * 1000 }));
        store.insert(make_observation({ observed_at: now }));
        const pruned = store.prune(now - 90 * 24 * 60 * 60 * 1000);
        expect(pruned).toBe(2);
        const latest = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        expect(latest!.observed_at).toBe(now);
    });

    it("preserves stale and last_error fields", () => {
        const obs = make_observation({ stale: true, last_error: "connection refused" });
        store.insert(obs);
        const result = store.get_latest("tavily", "default", "tavily:monthly_usage", "tavily-1");
        expect(result!.stale).toBe(true);
        expect(result!.last_error).toBe("connection refused");
    });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run tests/integration/observation/observation-store.test.ts`
Expected: FAIL

- [ ] **Step 5: 创建文件使测试通过**

创建 `src/main/core/observation/observation-store.ts`，内容如上。

Run: `pnpm vitest run tests/integration/observation/observation-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/core/observation/observation-store.ts tests/integration/observation/observation-store.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add SQLite observation store with append-only semantics (P1)"
```

---

## Task 3: SecretsVault (FileVaultBackend)

**Files:**

- Create: `src/main/core/vault/vault-backend.ts`
- Create: `src/main/core/vault/file-vault-backend.ts`
- Create: `tests/integration/vault/file-vault-backend.test.ts`

- [ ] **Step 1: 写 VaultBackend 接口**

```ts
// src/main/core/vault/vault-backend.ts

export interface VaultBackend {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    list_keys(prefix?: string): Promise<string[]>;
}
```

- [ ] **Step 2: 写 FileVaultBackend 实现**

```ts
// src/main/core/vault/file-vault-backend.ts

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, access, chmod, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { VaultBackend } from "./vault-backend";

const log = createLogger("vault");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

interface VaultEntry {
    iv: string;
    tag: string;
    ciphertext: string;
}

function encrypt_value(key: Buffer, plaintext: string): VaultEntry {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        ciphertext: encrypted.toString("hex"),
    };
}

function decrypt_value(key: Buffer, entry: VaultEntry): string {
    const iv = Buffer.from(entry.iv, "hex");
    const tag = Buffer.from(entry.tag, "hex");
    const ciphertext = Buffer.from(entry.ciphertext, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final("utf8");
}

async function set_file_permissions(path: string): Promise<void> {
    try {
        if (process.platform === "win32") {
            const { execFile } = await import("node:child_process");
            await new Promise<void>((resolve, reject) => {
                execFile(
                    "icacls",
                    [path, "/inheritance:r", `/grant:r`, `${process.env["USERNAME"]}:F`],
                    (err) => (err ? reject(err) : resolve()),
                );
            });
        } else {
            await chmod(path, 0o600);
        }
    } catch (err) {
        log.warn(`Failed to set file permissions on ${path}: ${String(err)}`);
    }
}

async function ensure_master_key(key_path: string): Promise<Buffer> {
    try {
        await access(key_path);
        return await readFile(key_path);
    } catch {
        const key = randomBytes(32);
        await mkdir(dirname(key_path), { recursive: true });
        await writeFile(key_path, key);
        await set_file_permissions(key_path);
        log.info("Generated new master key");
        return key;
    }
}

export async function create_file_vault_backend(user_data_dir: string): Promise<VaultBackend> {
    const vault_path = join(user_data_dir, "secrets.vault");
    const key_path = join(user_data_dir, "vault.key");
    const master_key = await ensure_master_key(key_path);

    async function read_vault(): Promise<Record<string, VaultEntry>> {
        try {
            const raw = await readFile(vault_path, "utf8");
            return JSON.parse(raw) as Record<string, VaultEntry>;
        } catch {
            return {};
        }
    }

    async function write_vault(data: Record<string, VaultEntry>): Promise<void> {
        await writeFile(vault_path, JSON.stringify(data, null, 2), "utf8");
    }

    return {
        async get(key: string): Promise<string | null> {
            const data = await read_vault();
            const entry = data[key];
            if (!entry) return null;
            try {
                return decrypt_value(master_key, entry);
            } catch {
                log.warn(`Failed to decrypt vault key: ${key}`);
                return null;
            }
        },

        async set(key: string, value: string): Promise<void> {
            const data = await read_vault();
            data[key] = encrypt_value(master_key, value);
            await write_vault(data);
        },

        async delete(key: string): Promise<void> {
            const data = await read_vault();
            if (!(key in data)) return;
            delete data[key];
            await write_vault(data);
        },

        async has(key: string): Promise<boolean> {
            const data = await read_vault();
            return key in data;
        },

        async list_keys(prefix?: string): Promise<string[]> {
            const data = await read_vault();
            const keys = Object.keys(data);
            if (!prefix) return keys;
            return keys.filter((k) => k.startsWith(prefix));
        },
    };
}
```

- [ ] **Step 3: 写测试**

```ts
// tests/integration/vault/file-vault-backend.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

let temp_dir: string;
let vault: VaultBackend;

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "vault-test-"));
    vault = await create_file_vault_backend(temp_dir);
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("file-vault-backend", () => {
    it("returns null for non-existent key", async () => {
        expect(await vault.get("missing")).toBeNull();
    });

    it("stores and retrieves a value", async () => {
        await vault.set("tavily-1:api_key", "sk-test-123");
        const result = await vault.get("tavily-1:api_key");
        expect(result).toBe("sk-test-123");
    });

    it("overwrites existing value", async () => {
        await vault.set("key", "old");
        await vault.set("key", "new");
        expect(await vault.get("key")).toBe("new");
    });

    it("deletes a key", async () => {
        await vault.set("key", "value");
        await vault.delete("key");
        expect(await vault.get("key")).toBeNull();
    });

    it("delete is no-op for missing key", async () => {
        await vault.delete("missing");
    });

    it("has returns true/false correctly", async () => {
        expect(await vault.has("key")).toBe(false);
        await vault.set("key", "value");
        expect(await vault.has("key")).toBe(true);
    });

    it("list_keys returns all keys", async () => {
        await vault.set("a:1", "x");
        await vault.set("b:2", "y");
        const keys = await vault.list_keys();
        expect(keys).toContain("a:1");
        expect(keys).toContain("b:2");
    });

    it("list_keys with prefix filters", async () => {
        await vault.set("tavily-1:api_key", "x");
        await vault.set("tavily-1:other", "y");
        await vault.set("deepseek-1:api_key", "z");
        const keys = await vault.list_keys("tavily-1:");
        expect(keys).toHaveLength(2);
        expect(keys).toContain("tavily-1:api_key");
        expect(keys).toContain("tavily-1:other");
    });

    it("persists across instances (re-opens same dir)", async () => {
        await vault.set("persist", "hello");
        const vault2 = await create_file_vault_backend(temp_dir);
        expect(await vault2.get("persist")).toBe("hello");
    });

    it("vault.key file exists with correct permissions", async () => {
        const { stat } = await import("node:fs/promises");
        const key_stat = await stat(join(temp_dir, "vault.key"));
        expect(key_stat.size).toBe(32);
    });

    it("decrypt fails gracefully with corrupted entry", async () => {
        await vault.set("key", "value");
        // Corrupt by writing garbage
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
            join(temp_dir, "secrets.vault"),
            '{"key":{"iv":"bad","tag":"bad","ciphertext":"bad"}}',
        );
        const vault2 = await create_file_vault_backend(temp_dir);
        expect(await vault2.get("key")).toBeNull();
    });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run tests/integration/vault/file-vault-backend.test.ts`
Expected: FAIL

- [ ] **Step 5: 创建文件使测试通过**

创建 `src/main/core/vault/vault-backend.ts` 和 `src/main/core/vault/file-vault-backend.ts`，内容如上。

Run: `pnpm vitest run tests/integration/vault/file-vault-backend.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/core/vault/ tests/integration/vault/
git commit -m "feat: add SecretsVault with FileVaultBackend, AES-256-GCM (P1)"
```

---

# P2：沙箱 PoC + 连接器 Runtime

## Task 4: 沙箱 PoC — isolated-vm 或 node:vm 选型验证

**Files:**

- Create: `tests/poc/sandbox-poc.test.ts`

**前置说明：** 这是 P2 的 gate。先尝试 isolated-vm；如果在 Windows + Electron ABI 下编译失败或异步桥接不通，退回 node:vm。测试结果决定后续所有连接器 Runtime 的实现。

- [ ] **Step 1: 尝试安装 isolated-vm**

Run: `pnpm add isolated-vm`
Expected: 安装成功（如果失败，记录错误，改用 node:vm）

- [ ] **Step 2: 写 PoC 测试（先用 isolated-vm）**

```ts
// tests/poc/sandbox-poc.test.ts

import { describe, it, expect } from "vitest";

describe("sandbox poc", () => {
    it("can compile and run script in isolate", async () => {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 128 });
        const context = await isolate.createContext();
        const script = await isolate.compileScript("1 + 2");
        const result = await script.run(context, { timeout: 5000 });
        expect(result).toBe(3);
    });

    it("can inject host function and call from script", async () => {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 128 });
        const context = await isolate.createContext();

        const callback_ref = new ivm.Reference(async (url: string) => {
            return `response:${url}`;
        });
        await context.global.set("host_fetch", callback_ref);

        const script = await isolate.compileScript(`
            (async () => {
                const fn = host_fetch.copySync();
                return await fn("https://example.com");
            })()
        `);
        const result = await script.run(context, { timeout: 5000, promise: true });
        expect(result).toBe("response:https://example.com");
    });

    it("times out on infinite loop", async () => {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 128 });
        const context = await isolate.createContext();
        const script = await isolate.compileScript("while(true){}");
        await expect(script.run(context, { timeout: 100 })).rejects.toThrow();
    });

    it("cannot access require or process", async () => {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 128 });
        const context = await isolate.createContext();
        const script = await isolate.compileScript(`
            typeof require !== 'undefined' || typeof process !== 'undefined'
        `);
        const result = await script.run(context);
        expect(result).toBe(false);
    });

    it("can pass complex object via ExternalCopy", async () => {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 128 });
        const context = await isolate.createContext();

        const data = new ivm.ExternalCopy({ items: [1, 2, 3] }).copyInto();
        await context.global.set("data", data);

        const script = await isolate.compileScript("data.items.length");
        const result = await script.run(context);
        expect(result).toBe(3);
    });

    it("script can return array that host can read (critical for runtime)", async () => {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 128 });
        const context = await isolate.createContext();

        const script = await isolate.compileScript(`
            (async () => {
                return [{ provider: "test", used: 100 }];
            })()
        `);
        const raw = await script.run(context, { timeout: 5000, promise: true });

        // Must be able to copy result out of isolate
        let result: unknown;
        if (raw instanceof ivm.Reference) {
            result = raw.copySync();
        } else if (raw && typeof raw === "object" && "copy" in raw) {
            result = (raw as { copy: () => unknown }).copy();
        } else {
            result = raw;
        }

        expect(Array.isArray(result)).toBe(true);
        expect((result as { provider: string }[])[0].provider).toBe("test");
    });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm vitest run tests/poc/sandbox-poc.test.ts`
Expected:

- 如果 isolated-vm 编译通过且测试 PASS → 记录"isolated-vm 可用"
- 如果编译失败 → 删除 isolated-vm，改写测试用 `node:vm`，记录"退回 node:vm"

- [ ] **Step 4: 如果退回 node:vm，重写测试**

```ts
// 用 node:vm 重写的测试骨架
import vm from "node:vm";

it("can run script in frozen context", () => {
    const context = vm.createContext(Object.freeze({}));
    const result = vm.runInContext("1 + 2", context, { timeout: 5000 });
    expect(result).toBe(3);
});

it("cannot access require in frozen context", () => {
    const context = vm.createContext(Object.freeze({}));
    expect(() => {
        vm.runInContext("require('fs')", context, { timeout: 1000 });
    }).toThrow();
});
```

- [ ] **Step 5: Commit PoC 结果**

```bash
git add tests/poc/sandbox-poc.test.ts package.json pnpm-lock.yaml
git commit -m "feat: sandbox PoC — [isolated-vm/node:vm] selected (P2 gate)"
```

---

## Task 5: Manifest Schema + Loader

**Files:**

- Create: `src/shared/schemas/manifest.ts`
- Create: `src/main/core/connector/manifest-loader.ts`
- Create: `tests/unit/connector/manifest.test.ts`

- [ ] **Step 1: 写 Manifest Zod schema**

```ts
// src/shared/schemas/manifest.ts

import { z } from "zod/v3";

const capability_schema = z.enum(["poll", "local", "session", "observe"]);

const parameter_schema = z.object({
    name: z.string().min(1),
    type: z.enum(["secret", "string", "number"]),
    required: z.boolean().default(false),
    label: z.string().optional(),
    "label@zh-Hans": z.string().optional(),
    default: z.string().optional(),
    exposeToScript: z.boolean().default(false),
});

const auth_schema = z.object({
    type: z.enum(["bearer", "query", "header"]),
    secret: z.string().min(1),
    header_name: z.string().optional(),
    query_param: z.string().optional(),
});

const poll_request_schema = z.object({
    endpoint: z.string().min(1),
    path: z.string().min(1),
    method: z.enum(["GET", "POST"]).default("GET"),
    auth: auth_schema.optional(),
    body: z.unknown().optional(),
});

const poll_map_schema = z.record(z.string(), z.string());

const poll_config_schema = z.object({
    request: poll_request_schema,
    map: poll_map_schema,
});

const observe_config_schema = z.object({
    headers: z.array(z.string()).min(1),
    probe: z
        .object({
            endpoint: z.string().min(1),
            path: z.string().min(1),
            params: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
});

const local_config_schema = z.object({
    paths: z.array(z.string()).min(1),
});

export const manifest_schema = z
    .object({
        id: z.string().min(1),
        provider: z.string().min(1),
        capabilities: z.array(capability_schema).min(1),
        parameters: z.array(parameter_schema).default([]),
        endpoints: z.record(z.string(), z.string().url()).optional(),
        script: z.string().optional(),
        poll: poll_config_schema.optional(),
        observe: observe_config_schema.optional(),
        local: local_config_schema.optional(),
    })
    .refine(
        (m) =>
            m.capabilities.every((c) => {
                if (c === "poll") return !!m.poll;
                if (c === "observe") return !!m.observe;
                if (c === "local") return !!m.local;
                return true;
            }),
        { message: "Each capability requires its corresponding config section" },
    );

export type Manifest = z.infer<typeof manifest_schema>;
```

- [ ] **Step 2: 写 manifest loader**

```ts
// src/main/core/connector/manifest-loader.ts

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import { manifest_schema, type Manifest } from "../../../shared/schemas/manifest";

const log = createLogger("manifest-loader");

export async function load_manifest(connector_dir: string): Promise<Manifest | null> {
    const path = join(connector_dir, "manifest.json");
    try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        const result = manifest_schema.safeParse(parsed);
        if (!result.success) {
            log.warn(`Invalid manifest in ${connector_dir}: ${result.error.message}`);
            return null;
        }
        return result.data;
    } catch (err) {
        log.warn(`Failed to load manifest from ${connector_dir}: ${String(err)}`);
        return null;
    }
}

export async function discover_connectors(
    builtin_dir: string,
    user_dir: string,
): Promise<Manifest[]> {
    const { readdir } = await import("node:fs/promises");
    const manifests: Manifest[] = [];

    for (const dir of [builtin_dir, user_dir]) {
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const manifest = await load_manifest(join(dir, entry.name));
                    if (manifest) manifests.push(manifest);
                }
            }
        } catch {
            // directory doesn't exist, skip
        }
    }

    return manifests;
}
```

- [ ] **Step 3: 写测试**

```ts
// tests/unit/connector/manifest.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";

let temp_dir: string;

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "manifest-test-"));
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("manifest-loader", () => {
    it("loads valid poll manifest", async () => {
        const manifest = {
            id: "tavily",
            provider: "tavily",
            capabilities: ["poll"],
            parameters: [{ name: "api_key", type: "secret", required: true }],
            endpoints: { default: "https://api.tavily.com" },
            poll: {
                request: {
                    endpoint: "default",
                    path: "/usage",
                    auth: { type: "bearer", secret: "api_key" },
                },
                map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
            },
        };
        await writeFile(join(temp_dir, "manifest.json"), JSON.stringify(manifest));
        const result = await load_manifest(temp_dir);
        expect(result).not.toBeNull();
        expect(result!.id).toBe("tavily");
        expect(result!.capabilities).toContain("poll");
    });

    it("returns null for missing manifest.json", async () => {
        const result = await load_manifest(temp_dir);
        expect(result).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
        await writeFile(join(temp_dir, "manifest.json"), "not json");
        const result = await load_manifest(temp_dir);
        expect(result).toBeNull();
    });

    it("returns null when capability config is missing", async () => {
        const manifest = {
            id: "bad",
            provider: "bad",
            capabilities: ["poll"],
        };
        await writeFile(join(temp_dir, "manifest.json"), JSON.stringify(manifest));
        const result = await load_manifest(temp_dir);
        expect(result).toBeNull();
    });

    it("loads observe manifest", async () => {
        const manifest = {
            id: "brave_search",
            provider: "brave_search",
            capabilities: ["observe"],
            endpoints: { default: "https://api.search.brave.com" },
            observe: {
                headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
                probe: {
                    endpoint: "default",
                    path: "/res/v1/web/search",
                    params: { q: "test", count: "1" },
                },
            },
        };
        await writeFile(join(temp_dir, "manifest.json"), JSON.stringify(manifest));
        const result = await load_manifest(temp_dir);
        expect(result).not.toBeNull();
        expect(result!.observe!.headers).toHaveLength(2);
    });
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run tests/unit/connector/manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/manifest.ts src/main/core/connector/manifest-loader.ts tests/unit/connector/manifest.test.ts
git commit -m "feat: add manifest schema and loader (P2)"
```

---

## Task 6: Connector Runtime（按 PoC 结果选后端）

**Files:**

- Create: `src/main/core/connector/runtime.ts`
- Create: `src/main/core/connector/host-io.ts`
- Create: `tests/integration/connector/runtime.test.ts`

**前置说明：** 本任务依赖 Task 4 的 PoC 结果。代码示例用 isolated-vm；如果 PoC 退回 node:vm，替换沙箱层，接口不变。

- [ ] **Step 1: 写 ConnectorContext 接口（host-io.ts）**

```ts
// src/main/core/connector/host-io.ts

export interface HttpOpts {
    readonly headers?: Record<string, string>;
    readonly timeout_ms?: number;
}

export interface ConnectorContext {
    readonly http: {
        get_json(endpoint_key: string, path: string, opts?: HttpOpts): Promise<unknown>;
        post_json(
            endpoint_key: string,
            path: string,
            body: unknown,
            opts?: HttpOpts,
        ): Promise<unknown>;
    };
    readonly files: {
        read(path_pattern: string): Promise<string>;
    };
    readonly params: Record<string, string>;
}
```

- [ ] **Step 2: 写 runtime.ts（isolated-vm 版本）**

```ts
// src/main/core/connector/runtime.ts

import type { Manifest } from "../../../shared/schemas/manifest";
import type { Observation } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("connector-runtime");
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ConnectorRunResult {
    readonly observations: Observation[];
    readonly error: string | null;
}

export async function run_connector(
    manifest: Manifest,
    script_code: string,
    ctx: ConnectorContext,
    timeout_ms: number = DEFAULT_TIMEOUT_MS,
): Promise<ConnectorRunResult> {
    if (!manifest.script) {
        return { observations: [], error: "No script defined in manifest" };
    }

    try {
        const ivm = await import("isolated-vm");
        const isolate = new ivm.Isolate({ memoryLimit: 256 });
        const context = await isolate.createContext();

        // Inject ctx methods as host references
        const get_json_ref = new ivm.Reference(async (ep: string, path: string) => {
            return ctx.http.get_json(ep, path);
        });
        const post_json_ref = new ivm.Reference(async (ep: string, path: string, body: unknown) => {
            return ctx.http.post_json(ep, path, body);
        });
        const read_file_ref = new ivm.Reference(async (pattern: string) => {
            return ctx.files.read(pattern);
        });

        await context.global.set("__host_get_json", get_json_ref);
        await context.global.set("__host_post_json", post_json_ref);
        await context.global.set("__host_read_file", read_file_ref);
        await context.global.set("__host_params", new ivm.ExternalCopy(ctx.params).copyInto());

        // Wrap script to call host functions
        const wrapped = `
            const ctx = {
                http: {
                    get_json: (ep, path) => __host_get_json.applySyncPromise(undefined, [ep, path]),
                    post_json: (ep, path, body) => __host_post_json.applySyncPromise(undefined, [ep, path, body]),
                },
                files: {
                    read: (pattern) => __host_read_file.applySyncPromise(undefined, [pattern]),
                },
                params: __host_params,
            };
            ${script_code}
        `;

        const script = await isolate.compileScript(wrapped);
        const raw_result = await script.run(context, { timeout: timeout_ms, promise: true });

        // isolated-vm: non-primitive values must be copied out of the isolate
        let result: unknown;
        if (raw_result instanceof ivm.Reference) {
            result = raw_result.copySync();
        } else if (raw_result && typeof raw_result === "object" && "copy" in raw_result) {
            result = (raw_result as { copy: () => unknown }).copy();
        } else {
            result = raw_result;
        }

        // Validate result is an array of observations
        if (!Array.isArray(result)) {
            return { observations: [], error: "Script did not return an array" };
        }

        return { observations: result as Observation[], error: null };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Connector execution failed: ${message}`);
        return { observations: [], error: message };
    }
}
```

- [ ] **Step 3: 写集成测试**

```ts
// tests/integration/connector/runtime.test.ts

import { describe, it, expect } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";

const stub_ctx: ConnectorContext = {
    http: {
        async get_json(_ep, _path) {
            return { usage: { month: 50 }, plan: { limit: 1000 } };
        },
        async post_json(_ep, _path, _body) {
            return {};
        },
    },
    files: {
        async read() {
            return "";
        },
    },
    params: {},
};

const poll_manifest: Manifest = {
    id: "test",
    provider: "test",
    capabilities: ["poll"],
    script: "connector.ts",
    poll: {
        request: { endpoint: "default", path: "/usage" },
        map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
    },
};

describe("connector-runtime", () => {
    it("returns error when no script in manifest", async () => {
        const no_script_manifest = { ...poll_manifest, script: undefined };
        const result = await run_connector(no_script_manifest, "", stub_ctx);
        expect(result.error).toContain("No script");
    });

    it("runs script and returns observations", async () => {
        const script = `
            const data = await ctx.http.get_json("default", "/usage");
            return [{
                provider: "test",
                source_instance_id: "test-1",
                account_id: "default",
                account_label: "Test",
                metric_id: "test:monthly",
                name: "Monthly",
                window: "month",
                used: data.usage.month,
                limit: data.plan.limit,
                display_style: "ratio",
                reset_at: null,
                status: "normal",
                source: "poll",
            }];
        `;
        const result = await run_connector(poll_manifest, script, stub_ctx);
        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0].used).toBe(50);
    });

    it("returns error when script times out", async () => {
        const script = `while(true){}`;
        const result = await run_connector(poll_manifest, script, stub_ctx, 100);
        expect(result.error).not.toBeNull();
    });
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run tests/integration/connector/runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/core/connector/ tests/integration/connector/
git commit -m "feat: add connector runtime with sandbox execution (P2)"
```

---

## Task 7: NetClient — 真实 ctx.http 实现（undici + auth 注入）

**Files:**

- Create: `src/main/core/connector/net-client.ts`
- Create: `tests/integration/connector/net-client.test.ts`

**说明：** Task 6 只定义了 `ConnectorContext` 接口，所有测试用 stub。本任务实现真实的 `ctx.http`：undici 出网 + manifest auth 模板注入 + endpoint/proxy 解析。这是连接器能对真实服务发请求的承重墙。

- [ ] **Step 1: 写 NetClient 实现**

```ts
// src/main/core/connector/net-client.ts

import { request as undici_request, ProxyAgent } from "undici";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { VaultBackend } from "../vault/vault-backend";
import type { ConnectorContext, HttpOpts } from "./host-io";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("net-client");

export interface NetClientConfig {
    readonly proxy_url?: string;
    readonly endpoint_overrides?: Record<string, string>;
    readonly timeout_ms?: number;
}

export function create_connector_context(
    manifest: Manifest,
    vault: VaultBackend,
    instance_id: string,
    config: NetClientConfig,
): ConnectorContext {
    const dispatcher = config.proxy_url ? new ProxyAgent(config.proxy_url) : undefined;
    const timeout_ms = config.timeout_ms ?? 15_000;

    function resolve_endpoint(endpoint_key: string): string {
        const override = config.endpoint_overrides?.[endpoint_key];
        if (override) return override;
        const default_ep = manifest.endpoints?.[endpoint_key];
        if (default_ep) return default_ep;
        throw new Error(`Unknown endpoint key: ${endpoint_key}`);
    }

    async function build_auth_headers(): Promise<Record<string, string>> {
        const headers: Record<string, string> = {};
        for (const param of manifest.parameters ?? []) {
            if (param.type !== "secret") continue;
            const value = await vault.get(`${instance_id}:${param.name}`);
            if (!value) continue;
            // Find which auth config uses this secret
            const poll_auth = manifest.poll?.request?.auth;
            if (poll_auth && poll_auth.secret === param.name) {
                if (poll_auth.type === "bearer") {
                    headers["Authorization"] = `Bearer ${value}`;
                } else if (poll_auth.type === "header" && poll_auth.header_name) {
                    headers[poll_auth.header_name] = value;
                }
            }
        }
        return headers;
    }

    async function do_request(
        method: "GET" | "POST",
        endpoint_key: string,
        path: string,
        body?: unknown,
        opts?: HttpOpts,
    ): Promise<unknown> {
        const base = resolve_endpoint(endpoint_key);
        const url = `${base}${path}`;
        const auth_headers = await build_auth_headers();
        const all_headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...auth_headers,
            ...(opts?.headers ?? {}),
        };

        log.debug(`${method} ${url}`);
        const response = await undici_request(url, {
            method,
            headers: all_headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            dispatcher,
            headersTimeout: opts?.timeout_ms ?? timeout_ms,
            bodyTimeout: opts?.timeout_ms ?? timeout_ms,
        });

        if (response.statusCode >= 400) {
            const text = await response.body.text();
            throw new Error(`HTTP ${String(response.statusCode)}: ${text.slice(0, 200)}`);
        }

        return response.body.json();
    }

    return {
        http: {
            async get_json(endpoint_key: string, path: string, opts?: HttpOpts) {
                return do_request("GET", endpoint_key, path, undefined, opts);
            },
            async post_json(endpoint_key: string, path: string, body: unknown, opts?: HttpOpts) {
                return do_request("POST", endpoint_key, path, body, opts);
            },
        },
        files: {
            async read(_path_pattern: string): Promise<string> {
                // Tier 2 local 能力，后续实现
                throw new Error("files.read not yet implemented");
            },
        },
        params: {},
    };
}
```

- [ ] **Step 2: 写集成测试（用 HTTPS stub 模拟真实请求）**

```ts
// tests/integration/connector/net-client.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:https";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_connector_context } from "../../../src/main/core/connector/net-client";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

let temp_dir: string;
let vault: VaultBackend;
let server_port: number;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "net-client-test-"));
    vault = await create_file_vault_backend(temp_dir);
    await vault.set("test-1:api_key", "sk-test-secret");

    // Minimal HTTPS stub
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const cert = ""; // self-signed cert for test
    // Use HTTP stub instead for simplicity in CI
    const http = await import("node:http");
    server = http.createServer((req, res) => {
        const auth = req.headers["authorization"];
        if (auth !== "Bearer sk-test-secret") {
            res.writeHead(401);
            res.end(JSON.stringify({ error: "unauthorized" }));
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ usage: { month: 42 }, plan: { limit: 1000 } }));
    });
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (addr && typeof addr === "object") server_port = addr.port;
            resolve();
        });
    });
});

afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temp_dir, { recursive: true, force: true });
});

const test_manifest: Manifest = {
    id: "test",
    provider: "test",
    capabilities: ["poll"],
    parameters: [{ name: "api_key", type: "secret", required: true }],
    endpoints: { default: `http://127.0.0.1:${String(server_port)}` },
    poll: {
        request: {
            endpoint: "default",
            path: "/usage",
            auth: { type: "bearer", secret: "api_key" },
        },
        map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
    },
};

describe("net-client", () => {
    it("injects auth header from vault and returns JSON", async () => {
        const ctx = create_connector_context(test_manifest, vault, "test-1", {});
        const result = await ctx.http.get_json("default", "/usage");
        expect(result).toEqual({ usage: { month: 42 }, plan: { limit: 1000 } });
    });

    it("rejects when vault has no secret", async () => {
        const ctx = create_connector_context(test_manifest, vault, "missing-instance", {});
        await expect(ctx.http.get_json("default", "/usage")).rejects.toThrow("401");
    });

    it("endpoint override takes precedence", async () => {
        const ctx = create_connector_context(test_manifest, vault, "test-1", {
            endpoint_overrides: { default: `http://127.0.0.1:${String(server_port)}` },
        });
        const result = await ctx.http.get_json("default", "/usage");
        expect(result).toBeDefined();
    });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm vitest run tests/integration/connector/net-client.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/core/connector/net-client.ts tests/integration/connector/net-client.test.ts
git commit -m "feat: add NetClient with undici, auth injection, endpoint/proxy resolution (P2)"
```

---

## Task 8: Tier 1 声明式 Poll 执行器

**Files:**

- Create: `src/main/core/connector/tier1-poll-executor.ts`
- Create: `tests/unit/connector/tier1-poll-executor.test.ts`

- [ ] **Step 1: 写 Tier 1 Poll Executor**

Tier 1 连接器无需脚本，宿主直接按 manifest 的 `poll.request` + `poll.map` 执行 HTTP 请求并映射字段。

```ts
// src/main/core/connector/tier1-poll-executor.ts

import type { Manifest } from "../../../shared/schemas/manifest";
import type { Observation } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("tier1-poll");

function resolve_json_path(data: unknown, path: string): unknown {
    const parts = path.replace(/^\$\.?/, "").split(".");
    let current: unknown = data;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

export async function execute_poll(
    manifest: Manifest,
    instance_id: string,
    ctx: ConnectorContext,
): Promise<Observation[]> {
    if (!manifest.poll) {
        throw new Error(`Manifest ${manifest.id} has no poll config`);
    }

    const { request, map } = manifest.poll;
    const endpoint_key = request.endpoint;

    let response: unknown;
    try {
        if (request.method === "POST") {
            response = await ctx.http.post_json(endpoint_key, request.path, request.body);
        } else {
            response = await ctx.http.get_json(endpoint_key, request.path);
        }
    } catch (err) {
        log.error(`Poll failed for ${manifest.id}: ${String(err)}`);
        return [];
    }

    const now = Date.now();
    const observations: Observation[] = [];

    for (const [metric_name, json_path] of Object.entries(map)) {
        if (metric_name === "window") continue; // handled separately
        const value = resolve_json_path(response, json_path);
        if (value === undefined) continue;

        const is_used = metric_name === "used";
        const is_limit = metric_name === "limit";

        // Build one observation per metric
        if (is_used || is_limit) {
            if (!observations.length) {
                observations.push({
                    provider: manifest.provider,
                    source_instance_id: instance_id,
                    account_id: "default",
                    account_label: manifest.provider,
                    metric_id: `${manifest.id}:${metric_name}`,
                    name: metric_name,
                    window: (resolve_json_path(response, map["window"] ?? "") as string) ?? "month",
                    used: is_used ? (value as number) : null,
                    limit: is_limit ? (value as number) : null,
                    display_style: "ratio",
                    reset_at: null,
                    status: "normal",
                    observed_at: now,
                    source: "poll",
                    stale: false,
                    last_error: null,
                });
            } else {
                if (is_used) observations[0] = { ...observations[0], used: value as number };
                if (is_limit) observations[0] = { ...observations[0], limit: value as number };
            }
        }
    }

    return observations;
}
```

- [ ] **Step 2: 写测试**

```ts
// tests/unit/connector/tier1-poll-executor.test.ts

import { describe, it, expect } from "vitest";
import { execute_poll } from "../../../src/main/core/connector/tier1-poll-executor";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";

const tavily_manifest: Manifest = {
    id: "tavily",
    provider: "tavily",
    capabilities: ["poll"],
    endpoints: { default: "https://api.tavily.com" },
    poll: {
        request: {
            endpoint: "default",
            path: "/usage",
            auth: { type: "bearer", secret: "api_key" },
        },
        map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
    },
};

function make_ctx(response: unknown): ConnectorContext {
    return {
        http: {
            async get_json() {
                return response;
            },
            async post_json() {
                return response;
            },
        },
        files: {
            async read() {
                return "";
            },
        },
        params: {},
    };
}

describe("tier1-poll-executor", () => {
    it("returns observation from poll response", async () => {
        const ctx = make_ctx({ usage: { month: 100 }, plan: { limit: 1000 } });
        const result = await execute_poll(tavily_manifest, "tavily-1", ctx);
        expect(result).toHaveLength(1);
        expect(result[0].used).toBe(100);
        expect(result[0].limit).toBe(1000);
        expect(result[0].window).toBe("month");
    });

    it("returns empty array on HTTP error", async () => {
        const ctx: ConnectorContext = {
            http: {
                async get_json() {
                    throw new Error("network");
                },
                async post_json() {
                    throw new Error("network");
                },
            },
            files: {
                async read() {
                    return "";
                },
            },
            params: {},
        };
        const result = await execute_poll(tavily_manifest, "tavily-1", ctx);
        expect(result).toHaveLength(0);
    });

    it("throws when manifest has no poll config", async () => {
        const no_poll = { ...tavily_manifest, poll: undefined };
        await expect(execute_poll(no_poll, "tavily-1", make_ctx({}))).rejects.toThrow(
            "no poll config",
        );
    });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm vitest run tests/unit/connector/tier1-poll-executor.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/core/connector/tier1-poll-executor.ts tests/unit/connector/tier1-poll-executor.test.ts
git commit -m "feat: add Tier 1 declarative poll executor (P2)"
```

---

# P3：Scheduler 改造

## Task 9: Scheduler 改造为 Connector 调度

**Files:**

- Modify: `src/main/core/scheduler/scheduler-orchestrator.ts`
- Modify: `src/main/core/scheduler/plugin-scheduler.ts`（或重命名为 connector-scheduler.ts）
- Update: `tests/integration/scheduler/scheduler-orchestrator.test.ts`

**说明：** 现有 orchestrator 的 `startAll/rebuild/suspend/resume/shutdown` 生命周期保留，把调度目标从 plugin 改为 connector。改造方式：

- `PluginListConfig` → `ConnectorListConfig`（字段：`enabled / instance_id / refresh_interval_seconds`）
- scheduler 接口不变，只改类型名
- **本期不做**：探测自适应策略（spec §6.1），先用固定间隔，后续迭代再说

- [ ] **Step 1: 读现有 scheduler 和测试，理解当前行为**
- [ ] **Step 2: 重命名 plugin → connector（类型和函数名）**
- [ ] **Step 3: 更新测试，确认行为不变**
- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: scheduler targets connectors instead of plugins (P3)"
```

---

# P4：LocalAPI

## Task 10: LocalAPI Server

**Files:**

- Create: `src/main/core/local-api/server.ts`
- Create: `tests/integration/local-api/server.test.ts`

**前置决策：** 端口固定默认 `17863`，端口冲突时自动 fallback 到随机端口。
**本期不做**：`/v1/:provider/*` 网关转发（spec §5.1），默认关闭功能，后续按需求反馈决定。本 Task 只实现 health + ingest。

- [ ] **Step 1: 写 LocalAPI server**

```ts
// src/main/core/local-api/server.ts

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { createLogger } from "../../../shared/lib/logger";
import type { ObservationStore } from "../observation/observation-store";
import { observation_ingest_schema } from "../../../shared/schemas/observation";

const log = createLogger("local-api");

const DEFAULT_PORT = 17863;

export interface LocalAPIServer {
    start(): Promise<{ port: number; token: string }>;
    stop(): Promise<void>;
    get_port(): number;
    get_token(): string;
}

function generate_token(): string {
    return randomBytes(32).toString("hex");
}

function parse_body(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function check_auth(req: IncomingMessage, token: string): boolean {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) return false;
    return auth.slice(7) === token;
}

function json_response(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

export function create_local_api_server(
    observation_store: ObservationStore,
    options?: { port?: number },
): LocalAPIServer {
    const token = generate_token();
    let port = options?.port ?? DEFAULT_PORT;
    let server: ReturnType<typeof createServer> | null = null;

    async function handle_ingest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const body = await parse_body(req);
        let parsed: unknown;
        try {
            parsed = JSON.parse(body.toString("utf8"));
        } catch {
            json_response(res, 400, { error: "Invalid JSON" });
            return;
        }

        const result = observation_ingest_schema.safeParse(parsed);
        if (!result.success) {
            json_response(res, 400, { error: result.error.message });
            return;
        }

        const input = result.data;
        const observation = {
            ...input,
            observed_at: Date.now(),
            stale: false,
            last_error: null,
        };
        observation_store.insert(observation);
        json_response(res, 200, { status: "ok" });
    }

    function handle_health(_req: IncomingMessage, res: ServerResponse): void {
        json_response(res, 200, { status: "ok", uptime: process.uptime() });
    }

    return {
        async start() {
            server = createServer(async (req, res) => {
                if (req.url === "/v1/health" && req.method === "GET") {
                    handle_health(req, res);
                    return;
                }

                if (!check_auth(req, token)) {
                    json_response(res, 401, { error: "Unauthorized" });
                    return;
                }

                if (req.url === "/v1/ingest" && req.method === "POST") {
                    await handle_ingest(req, res);
                    return;
                }

                json_response(res, 404, { error: "Not found" });
            });

            return new Promise((resolve) => {
                server!.listen(port, "127.0.0.1", () => {
                    const addr = server!.address();
                    if (addr && typeof addr === "object") {
                        port = addr.port;
                    }
                    log.info(`LocalAPI listening on 127.0.0.1:${port}`);
                    resolve({ port, token });
                });
            });
        },

        async stop() {
            if (server) {
                await new Promise<void>((resolve) => server!.close(() => resolve()));
                server = null;
            }
        },

        get_port() {
            return port;
        },
        get_token() {
            return token;
        },
    };
}
```

- [ ] **Step 2: 写测试**

```ts
// tests/integration/local-api/server.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import { create_local_api_server } from "../../../src/main/core/local-api/server";
import type { LocalAPIServer } from "../../../src/main/core/local-api/server";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

let temp_dir: string;
let store: ObservationStore;
let api: LocalAPIServer;

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "local-api-test-"));
    store = create_observation_store(join(temp_dir, "test.db"));
    api = create_local_api_server(store, { port: 0 });
});

afterEach(async () => {
    await api.stop();
    store.close();
    await rm(temp_dir, { recursive: true, force: true });
});

describe("local-api", () => {
    it("health endpoint works without auth", async () => {
        await api.start();
        const port = api.get_port();
        const res = await fetch(`http://127.0.0.1:${port}/v1/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("ok");
    });

    it("ingest rejects without auth", async () => {
        await api.start();
        const port = api.get_port();
        const res = await fetch(`http://127.0.0.1:${port}/v1/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(401);
    });

    it("ingest accepts valid observation", async () => {
        await api.start();
        const port = api.get_port();
        const token = api.get_token();
        const obs = {
            provider: "tavily",
            source_instance_id: "tavily-1",
            account_id: "default",
            account_label: "Tavily",
            metric_id: "tavily:monthly",
            name: "Monthly",
            window: "month",
            used: 100,
            limit: 1000,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            source: "wrapper",
        };
        const res = await fetch(`http://127.0.0.1:${port}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(obs),
        });
        expect(res.status).toBe(200);
        const stored = store.get_latest("tavily", "default", "tavily:monthly", "tavily-1");
        expect(stored).not.toBeNull();
        expect(stored!.used).toBe(100);
    });

    it("ingest rejects invalid body", async () => {
        await api.start();
        const port = api.get_port();
        const token = api.get_token();
        const res = await fetch(`http://127.0.0.1:${port}/v1/ingest`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ provider: "" }),
        });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm vitest run tests/integration/local-api/server.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/core/local-api/ tests/integration/local-api/
git commit -m "feat: add LocalAPI server with ingest and health endpoints (P4)"
```

---

# P5：SessionManager + Tier 2

## Task 11: SessionManager（受控登录窗口 + 凭据捕获）

**Files:**

- Create: `src/main/core/session/session-manager.ts`
- Create: `tests/unit/session/session-manager.test.ts`

**说明：** SessionManager 依赖 Electron `BrowserWindow` + `webRequest`，纯单元测试需 mock。集成测试需要真实 Electron 环境。

- [ ] **Step 1: 写 SessionManager 接口**
- [ ] **Step 2: 实现（受控登录窗口 + 凭据捕获 + 写入 Vault）**
- [ ] **Step 3: 写 mock 测试**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add SessionManager for web login capture (P5)"
```

---

## Task 12: Tier 2 脚本连接器（Claude local + CPA poll）

**Files:**

- Create: `connectors/claude/manifest.json` + `connectors/claude/connector.ts`
- Create: `connectors/cpa/manifest.json` + `connectors/cpa/connector.ts`
- Create: `tests/integration/connector/claude-connector.test.ts`
- Create: `tests/integration/connector/cpa-connector.test.ts`

**说明：** Tier 2 需要真实文件/网络环境，测试用 fixtures + HTTPS stub（从 `tests/integration/plugin/_helpers/https_stub.ts` 复制到 `tests/integration/connector/_helpers/https_stub.ts`，不在 P7 删除范围内）。

- [ ] **Step 1: 写 Claude 连接器（local 能力，读 `~/.claude` 文件）**
- [ ] **Step 2: 写 CPA 连接器（poll 能力，多账号聚合）**
- [ ] **Step 3: 写集成测试**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Tier 2 connectors — Claude local + CPA poll (P5)"
```

---

# P6：IPC + UI 改造

## Task 13: IPC 命令集对齐

**Files:**

- Modify: `src/main/ipc/plugin-ipc.ts`（重命名为 connector-ipc.ts）
- Modify: `src/preload/usageboard-api.ts`
- Modify: `src/shared/types/ipc.ts`
- Update: 相关测试

- [ ] **Step 1: 读现有 IPC 代码，理解当前命令集**
- [ ] **Step 2: 重命名 plugin → connector，新增 snapshot 命令**
- [ ] **Step 3: 更新 preload 白名单**
- [ ] **Step 4: 更新测试**
- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: align IPC commands with v2 architecture (P6)"
```

---

## Task 14: UI 消费层改造

**Files:**

- Modify: `src/renderer/components/ProviderCard.tsx`（加 observedAt + source 展示）
- Modify: `src/renderer/components/ProviderAccountRow.tsx`（加 stale 标记）
- Modify: `src/renderer/lib/provider-usage.ts`（聚合改为 sum/sum）
- Modify: `src/renderer/views/SettingsView.tsx`（加数据源视角）

- [ ] **Step 1: ProviderCard 加数据新鲜度展示**
- [ ] **Step 2: stale 视觉标记**
- [ ] **Step 3: 聚合算法改为 sum(used)/sum(limit)**
- [ ] **Step 4: 设置页加数据源视角**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: UI consumes observation model with freshness display (P6)"
```

---

# P7：清理

## Task 15: 删除旧代码

**Files:**

- Delete: `src/main/core/plugin/`（全部）
- Delete: `src/main/core/cache/`（全部）
- Delete: `src/plugins/sdk/`（全部）
- Delete: `tests/unit/plugin/`（全部）
- Delete: `tests/integration/plugin/`（全部）
- Modify: `src/main/core/runner.ts`（删除 `should_log_raw_debug()` + 全部 raw 日志，整个文件将随 plugin/ 删除）
- Modify: `src/main/core/scheduler/refresh-service.ts`（删除 `should_log_raw_debug()` + 全部 raw 调试日志 `refresh config raw`/`merged plugin params raw`/`runtime env raw`/`plugin stdout raw`/`plugin stderr raw`/`parsed plugin output raw`/`cache save payload raw`/`runtime ready payload raw`，共 7 处）
- Delete: `src/main/core/config/crypto-backend.ts`
- Delete: `src/main/core/config/safe-storage-crypto.ts`

- [ ] **Step 1: 确认所有新代码已就位，旧代码无引用**
- [ ] **Step 2: 删除旧目录**
- [ ] **Step 3: 清理 logging.ts**
- [ ] **Step 4: 跑全量测试**
- [ ] **Step 5: 打包 smoke 测试**
- [ ] **Step 6: Commit**

```bash
git commit -m "chore: remove old plugin/cache/sdk code after v2 migration (P7)"
```

---

## 自审清单

- [ ] 所有 P1-P7 阶段在 spec 中都有对应任务
- [ ] 无 TBD/TODO 占位符
- [ ] 类型名、函数名在各任务间一致（observation、connector、vault）
- [ ] 每个任务有完整代码、测试、commit 指令
- [ ] PoC gate（Task 4）在 Runtime（Task 6）之前
- [ ] 文件名沿用项目现有 kebab-case（`observation-store.ts`），与 `scheduler-orchestrator.ts` 等一致
- [ ] Observation 字段用 snake_case（`source_instance_id`）、Config/renderer 字段用 camelCase（`refreshIntervalSeconds`），IPC 边界上两套命名并存，不做统一——核心数据层是 snake_case，UI 消费层（已有）是 camelCase
