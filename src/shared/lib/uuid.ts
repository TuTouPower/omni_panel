/**
 * RFC 4122 v4 UUID generator safe across both secure and insecure browser contexts.
 *
 * In insecure contexts (e.g. plain HTTP over LAN IP or .local domain),
 * `crypto.randomUUID` is undefined in Chromium/WebKit.
 * `crypto.getRandomValues` remains available across all contexts and is used to
 * construct a high-entropy v4 UUID. A pseudo-random fallback is provided if
 * Web Crypto is completely unavailable.
 */
export function safe_random_uuid(): string {
    if (typeof crypto !== "undefined") {
        if (typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        if (typeof crypto.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            const b6 = bytes[6] ?? 0;
            const b8 = bytes[8] ?? 0;
            bytes[6] = (b6 & 0x0f) | 0x40;
            bytes[8] = (b8 & 0x3f) | 0x80;
            const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
