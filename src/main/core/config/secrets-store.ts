import { readFile, writeFile, mkdir, rename, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import type { CryptoBackend } from "./crypto-backend";
import { createLogger } from "../../../shared/lib/logger";

function shouldLogRawStorage(): boolean {
    return process.env.NODE_ENV === "development";
}

export interface SecretsStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    exportAll(): Promise<Record<string, string>>;
    importAll(decrypted: Record<string, string>): Promise<void>;
}

export function createSecretsStore(filePath: string, crypto: CryptoBackend): SecretsStore {
    const log = createLogger("secrets-store");
    let writeQueue: Promise<void> = Promise.resolve();

    async function readAll(): Promise<Record<string, string>> {
        try {
            const raw = await readFile(filePath, "utf8");
            return JSON.parse(raw) as Record<string, string>;
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                log.error(`Failed to read secrets file (${filePath}): ${String(err)}`);
            }
            return {};
        }
    }

    async function doWriteAll(data: Record<string, string>): Promise<void> {
        await mkdir(dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
        await rename(tmpPath, filePath);
        await chmod(filePath, 0o600);
    }

    async function queuedWrite(data: Record<string, string>): Promise<void> {
        writeQueue = writeQueue.then(() => doWriteAll(data));
        await writeQueue;
    }

    return {
        async get(key: string): Promise<string | null> {
            const data = await readAll();
            const encrypted = data[key];
            if (encrypted === undefined) {
                return null;
            }
            try {
                const value = crypto.decrypt(encrypted);
                if (shouldLogRawStorage()) {
                    log.debug("secret get raw", { key, encrypted, value });
                }
                return value;
            } catch {
                log.warn(
                    `Failed to decrypt secret ${key.split(":")[0] ?? key}:***, treating as missing`,
                );
                return null;
            }
        },

        async set(key: string, value: string): Promise<void> {
            const data = await readAll();
            const isNew = !(key in data);
            data[key] = crypto.encrypt(value);
            if (shouldLogRawStorage()) {
                log.debug("secret set raw", { key, value, encrypted: data[key] });
            }
            await queuedWrite(data);
            if (isNew) {
                log.info(`Secret stored: ${key.split(":")[0] ?? key}:***`);
            }
        },

        async delete(key: string): Promise<void> {
            const data = await readAll();
            if (!(key in data)) {
                log.debug(`Secret delete requested but not found: ${key}`);
                return;
            }
            if (shouldLogRawStorage()) {
                log.debug("secret delete raw", { key, encrypted: data[key] });
            }
            const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));
            await queuedWrite(filtered);
            log.info(`Secret deleted: ${key}`);
        },

        async exportAll(): Promise<Record<string, string>> {
            const data = await readAll();
            const result: Record<string, string> = {};
            for (const [key, encrypted] of Object.entries(data)) {
                try {
                    result[key] = crypto.decrypt(encrypted);
                } catch {
                    log.warn(`Failed to decrypt secret ${key.split(":")[0] ?? key}:***, skipping`);
                }
            }
            if (shouldLogRawStorage()) {
                log.debug("secret export raw", { result });
            }
            return result;
        },

        async importAll(decrypted: Record<string, string>): Promise<void> {
            const data: Record<string, string> = {};
            for (const [key, value] of Object.entries(decrypted)) {
                data[key] = crypto.encrypt(value);
            }
            if (shouldLogRawStorage()) {
                log.debug("secret import raw", { decrypted, encrypted: data });
            }
            await queuedWrite(data);
            log.info(`Imported ${String(Object.keys(data).length)} secrets`);
        },
    };
}
