export interface CryptoBackend {
    encrypt(plaintext: string): string;
    decrypt(ciphertext: string): string;
}
