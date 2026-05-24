import { safeStorage } from "electron";
import type { CryptoBackend } from "./crypto-backend";

export function createSafeStorageCrypto(): CryptoBackend {
    return {
        encrypt(plaintext: string): string {
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error("System keychain encryption is not available");
            }
            return safeStorage.encryptString(plaintext).toString("base64");
        },
        decrypt(ciphertext: string): string {
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error("System keychain encryption is not available");
            }
            const buffer = Buffer.from(ciphertext, "base64");
            return safeStorage.decryptString(buffer);
        },
    };
}
