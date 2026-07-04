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
            // Snapshot existing values first so we can roll back. Without this,
            // a failure after delete-all leaves the vault empty (data loss).
            const existing_keys = await vault.list_keys();
            const snapshot = new Map<string, string>();
            for (const key of existing_keys) {
                const value = await vault.get(key);
                if (value !== null) snapshot.set(key, value);
            }
            try {
                for (const key of existing_keys) {
                    await vault.delete(key);
                }
                for (const [key, value] of Object.entries(decrypted)) {
                    await vault.set(key, value);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error(`importAll failed, rolling back ${String(snapshot.size)} keys: ${msg}`);
                const partial_keys = await vault.list_keys();
                for (const key of partial_keys) {
                    await vault.delete(key);
                }
                for (const [key, value] of snapshot) {
                    await vault.set(key, value);
                }
                throw err;
            }
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
