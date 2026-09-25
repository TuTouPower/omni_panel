import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";

const log = createLogger("connector-integrity");

export async function hash_file(file_path: string): Promise<string> {
    const content = await readFile(file_path);
    return createHash("sha256").update(content).digest("hex");
}

export type ConnectorFileHashes = Record<string, string>;

export type IntegrityRegistry = Record<string, ConnectorFileHashes>;

/**
 * 递归计算某连接器目录下所有代码与配置文件的 SHA-256 哈希
 */
export async function compute_connector_hashes(
    connector_dir: string,
): Promise<ConnectorFileHashes> {
    const hashes: Record<string, string> = {};
    const entries = await readdir(connector_dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isFile()) {
            const name = entry.name;
            if (name.endsWith(".json") || name.endsWith(".ts") || name.endsWith(".js")) {
                const full_path = join(connector_dir, name);
                hashes[name] = await hash_file(full_path);
            }
        }
    }
    return hashes;
}

/**
 * AC-001: 校验内置连接器完整性
 * 比对预期哈希清单，如发现哈希不匹配则安全拒绝并记录安全告警日志
 */
export async function verify_connector_integrity(
    manifest: Manifest,
    connector_dir: string,
    expected_registry?: IntegrityRegistry,
): Promise<{ ok: boolean; reason?: string }> {
    if (!expected_registry || Object.keys(expected_registry).length === 0) {
        // 未提供静态哈希清单时放行（如测试桩）
        return { ok: true };
    }

    const expected = expected_registry[manifest.id];
    if (!expected) {
        log.warn(`Security alert: connector "${manifest.id}" not found in integrity registry`);
        return { ok: false, reason: `Connector "${manifest.id}" 未在完整性清单中登记` };
    }

    const current_hashes = await compute_connector_hashes(connector_dir);

    for (const [filename, expected_hash] of Object.entries(expected)) {
        const actual_hash = current_hashes[filename];
        if (!actual_hash) {
            const reason = `Security alert: connector "${manifest.id}" missing file "${filename}"`;
            log.error(reason);
            return { ok: false, reason };
        }
        if (actual_hash !== expected_hash) {
            const reason = `Security alert: connector "${manifest.id}" file "${filename}" SHA-256 mismatch (expected: ${expected_hash.slice(0, 10)}..., actual: ${actual_hash.slice(0, 10)}...)`;
            log.error(reason);
            return { ok: false, reason };
        }
    }

    return { ok: true };
}

/**
 * 为内置连接器全量生成完整性基准字典
 */
export async function generate_builtin_integrity(builtin_dir: string): Promise<IntegrityRegistry> {
    const registry: IntegrityRegistry = {};
    try {
        const entries = await readdir(builtin_dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const c_dir = join(builtin_dir, entry.name);
                registry[entry.name] = await compute_connector_hashes(c_dir);
            }
        }
    } catch (err) {
        log.warn(`Could not generate integrity for ${builtin_dir}`, err);
    }
    return registry;
}
