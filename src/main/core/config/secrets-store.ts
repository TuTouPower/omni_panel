import { createLogger } from "../../../shared/lib/logger";
import type { VaultBackend } from "../vault/vault-backend";

const log = createLogger("secrets-store");

export interface SecretsStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    exportAll(): Promise<Record<string, string>>;
    importAll(decrypted: Record<string, string>): Promise<void>;
}

export function createSecretsStore(vault: VaultBackend): SecretsStore {
    return {
        get(key: string): Promise<string | null> {
            return vault.get(key);
        },

        async set(key: string, value: string): Promise<void> {
            await vault.set(key, value);
            log.debug(`set: ${key}`);
        },

        async delete(key: string): Promise<void> {
            await vault.delete(key);
            log.debug(`delete: ${key}`);
        },

        async exportAll(): Promise<Record<string, string>> {
            const keys = await vault.list_keys();
            const entries = await Promise.all(
                keys.map(async (key) => [key, await vault.get(key)] as const),
            );
            return Object.fromEntries(
                entries.filter((entry): entry is readonly [string, string] => entry[1] !== null),
            );
        },

        async importAll(decrypted: Record<string, string>): Promise<void> {
            log.warn(
                `importAll: replacing vault contents with ${String(Object.keys(decrypted).length)} keys`,
            );
            // 原子整体替换：vault 单次加密全量、单次写盘，无「先删后写」中间态。
            // 失败时 vault 保持旧态，天然回滚（无需快照）。
            await vault.replaceAll(decrypted);
            log.info(`importAll: imported ${String(Object.keys(decrypted).length)} keys`);
        },
    };
}

/**
 * The vault key for a secret. Owns the instance-namespacing format so callers
 * never build `${instanceId}:${name}` inline (and so the format can change in
 * one place). Pure module-level helper — usable without a SecretsStore instance.
 */
export function keyFor(instanceId: string, name: string): string {
    return `${instanceId}:${name}`;
}
