import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { VaultBackend } from "./vault-backend";

const log = createLogger("vault");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

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
    return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

async function set_file_permissions(path: string): Promise<void> {
    try {
        if (process.platform === "win32") {
            const username = process.env["USERNAME"] ?? process.env["USER"] ?? "";
            await new Promise<void>((resolve, reject) => {
                execFile(
                    "icacls",
                    [path, "/inheritance:r", "/grant:r", `${username}:F`],
                    (error) => {
                        if (error) {
                            reject(new Error(error.message));
                            return;
                        }
                        resolve();
                    },
                );
            });
            return;
        }
        await chmod(path, 0o600);
    } catch (error) {
        log.warn(`Failed to set file permissions on ${path}`, error);
    }
}

async function ensure_master_key(key_path: string): Promise<Buffer> {
    try {
        await access(key_path);
        const key = await readFile(key_path);
        if (key.length === 32) return key;
        throw new Error("Invalid vault key length");
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

    const locks = new Map<string, Promise<void>>();

    async function acquire_lock(key: string): Promise<() => void> {
        const prior = locks.get(key);
        if (prior) await prior;
        let release: (() => void) | undefined;
        const next = new Promise<void>((resolve) => {
            release = resolve;
        });
        locks.set(key, next);
        if (!release) throw new Error("Lock release function not initialized");
        return release;
    }

    async function read_vault(): Promise<Record<string, VaultEntry>> {
        try {
            const raw = await readFile(vault_path, "utf8");
            return JSON.parse(raw) as Record<string, VaultEntry>;
        } catch {
            return {};
        }
    }

    async function write_vault(data: Record<string, VaultEntry>): Promise<void> {
        await mkdir(dirname(vault_path), { recursive: true });
        await writeFile(vault_path, JSON.stringify(data, null, 2), "utf8");
        await set_file_permissions(vault_path);
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
            const release = await acquire_lock(key);
            try {
                const data = await read_vault();
                data[key] = encrypt_value(master_key, value);
                await write_vault(data);
            } finally {
                release();
            }
        },

        async delete(key: string): Promise<void> {
            const release = await acquire_lock(key);
            try {
                const data = await read_vault();
                if (!(key in data)) return;
                const next_data = Object.fromEntries(
                    Object.entries(data).filter(([entry_key]) => entry_key !== key),
                );
                await write_vault(next_data);
            } finally {
                release();
            }
        },

        async has(key: string): Promise<boolean> {
            const data = await read_vault();
            return key in data;
        },

        async list_keys(prefix?: string): Promise<string[]> {
            const data = await read_vault();
            const keys = Object.keys(data);
            if (!prefix) return keys;
            return keys.filter((key) => key.startsWith(prefix));
        },
    };
}
