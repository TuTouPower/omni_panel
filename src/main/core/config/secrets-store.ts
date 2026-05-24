import { readFile, writeFile, mkdir, rename, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import type { CryptoBackend } from "./crypto-backend";

export interface SecretsStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export function createSecretsStore(filePath: string, crypto: CryptoBackend): SecretsStore {
    async function readAll(): Promise<Record<string, string>> {
        try {
            const raw = await readFile(filePath, "utf8");
            return JSON.parse(raw) as Record<string, string>;
        } catch {
            return {};
        }
    }

    async function writeAll(data: Record<string, string>): Promise<void> {
        await mkdir(dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
        await rename(tmpPath, filePath);
        await chmod(filePath, 0o600);
    }

    return {
        async get(key: string): Promise<string | null> {
            const data = await readAll();
            const encrypted = data[key];
            if (encrypted === undefined) {
                return null;
            }
            return crypto.decrypt(encrypted);
        },

        async set(key: string, value: string): Promise<void> {
            const data = await readAll();
            data[key] = crypto.encrypt(value);
            await writeAll(data);
        },

        async delete(key: string): Promise<void> {
            const data = await readAll();
            const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));
            await writeAll(filtered);
        },
    };
}
