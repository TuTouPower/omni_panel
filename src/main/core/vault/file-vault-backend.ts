import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createLogger, scrubber } from "../../../shared/lib/logger";
import { get_vault_key_path, get_vault_path } from "../paths";
import { writeJsonAtomic } from "../storage/write-json";
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
        log.error(`Failed to set file permissions on ${path}`, error);
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

function redact_key(key: string): string {
    const colon = key.indexOf(":");
    if (colon < 0) {
        return key.length <= 2 ? "***" : `${key.slice(0, 2)}***`;
    }
    const prefix = key.slice(0, colon + 1);
    const rest = key.slice(colon + 1);
    return `${prefix}${rest.length <= 2 ? "***" : `${rest.slice(0, 2)}***`}`;
}

export async function create_file_vault_backend(user_data_dir: string): Promise<VaultBackend> {
    const vault_path = get_vault_path(user_data_dir);
    const key_path = get_vault_key_path(user_data_dir);
    const master_key = await ensure_master_key(key_path);

    let mutex: Promise<void> = Promise.resolve();

    async function with_lock<T>(fn: () => Promise<T>): Promise<T> {
        const prev = mutex;
        let release_fn: (() => void) | undefined;
        mutex = new Promise<void>((resolve) => {
            release_fn = resolve;
        });
        await prev;
        try {
            return await fn();
        } finally {
            if (release_fn) release_fn();
        }
    }

    async function read_vault(): Promise<Record<string, VaultEntry>> {
        try {
            const raw = await readFile(vault_path, "utf8");
            return JSON.parse(raw) as Record<string, VaultEntry>;
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return {};
            }
            // Try recovering from .bak before throwing
            try {
                const bak_raw = await readFile(`${vault_path}.bak`, "utf8");
                const bak_data = JSON.parse(bak_raw) as Record<string, VaultEntry>;
                log.warn("Vault corrupted, recovered from backup");
                return bak_data;
            } catch {
                // .bak not available or also corrupt
            }
            throw new Error("Failed to parse vault file (possibly corrupted)");
        }
    }

    async function write_vault(data: Record<string, VaultEntry>): Promise<void> {
        // Atomic write (tmp + rename) for the main file so an interrupted write
        // never leaves a truncated JSON — vault corruption would lose every secret.
        await writeJsonAtomic(vault_path, data, { chmod: 0o600 });
        await set_file_permissions(vault_path);
        // Refresh .bak with the now-committed known-good state (best-effort).
        // Written AFTER the main file so a crash here leaves .bak stale but the
        // main file intact, rather than .bak holding newer data than a half-written main.
        try {
            await writeFile(`${vault_path}.bak`, JSON.stringify(data, null, 2), "utf8");
        } catch {
            // non-critical
        }
    }

    return {
        async get(key: string): Promise<string | null> {
            return with_lock(async () => {
                const data = await read_vault();
                const entry = data[key];
                if (!entry) return null;
                try {
                    const plaintext = decrypt_value(master_key, entry);
                    scrubber.register(plaintext);
                    return plaintext;
                } catch {
                    log.warn(`Failed to decrypt vault key: ${redact_key(key)}`);
                    return null;
                }
            });
        },

        async set(key: string, value: string): Promise<void> {
            await with_lock(async () => {
                const data = await read_vault();
                data[key] = encrypt_value(master_key, value);
                await write_vault(data);
            });
        },

        async delete(key: string): Promise<void> {
            await with_lock(async () => {
                const data = await read_vault();
                if (!(key in data)) return;
                const next_data = Object.fromEntries(
                    Object.entries(data).filter(([entry_key]) => entry_key !== key),
                );
                await write_vault(next_data);
            });
        },

        async has(key: string): Promise<boolean> {
            return with_lock(async () => {
                const data = await read_vault();
                return key in data;
            });
        },

        async list_keys(prefix?: string): Promise<string[]> {
            return with_lock(async () => {
                const data = await read_vault();
                const keys = Object.keys(data);
                if (!prefix) return keys;
                return keys.filter((key) => key.startsWith(prefix));
            });
        },
    };
}
