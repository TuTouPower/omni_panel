import type { VaultBackend } from "../vault/vault-backend";

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

        set(key: string, value: string): Promise<void> {
            return vault.set(key, value);
        },

        delete(key: string): Promise<void> {
            return vault.delete(key);
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
            const existing_keys = await vault.list_keys();
            for (const key of existing_keys) {
                await vault.delete(key);
            }
            for (const [key, value] of Object.entries(decrypted)) {
                await vault.set(key, value);
            }
        },
    };
}
