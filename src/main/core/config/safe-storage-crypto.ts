import { safeStorage } from "electron";
import type { CryptoBackend } from "./crypto-backend";

type StorageBackend = ReturnType<typeof safeStorage.getSelectedStorageBackend>;

const SECURE_BACKENDS: ReadonlySet<string> = new Set([
    "gnome_libsecret",
    "kwallet",
    "kwallet5",
    "kwallet6",
]);

export function isSecureBackend(backend: StorageBackend): boolean {
    return SECURE_BACKENDS.has(backend);
}

function assertEncryptionReady(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("System keychain encryption is not available");
    }
    if (process.platform === "linux" && !isSecureBackend(safeStorage.getSelectedStorageBackend())) {
        throw new Error(
            `Refusing to store secrets using '${safeStorage.getSelectedStorageBackend()}' backend. ` +
                "Configure a system keychain (gnome-libsecret / kwallet).",
        );
    }
}

export function createSafeStorageCrypto(): CryptoBackend {
    return {
        encrypt(plaintext: string): string {
            assertEncryptionReady();
            return safeStorage.encryptString(plaintext).toString("base64");
        },
        decrypt(ciphertext: string): string {
            assertEncryptionReady();
            const buffer = Buffer.from(ciphertext, "base64");
            return safeStorage.decryptString(buffer);
        },
    };
}
