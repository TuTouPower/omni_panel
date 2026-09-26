import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { safe_random_uuid } from "../../../src/shared/lib/uuid";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("safe_random_uuid (t527)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("在标准环境下生成合法的 RFC 4122 v4 UUID", () => {
        const id = safe_random_uuid();
        expect(id).toMatch(UUID_V4_REGEX);
    });

    it("在 crypto.randomUUID 不可用时降级使用 crypto.getRandomValues 生成合法 v4 UUID", () => {
        const orig_crypto = globalThis.crypto;
        const fake_crypto = {
            getRandomValues: (arr: Uint8Array) => orig_crypto.getRandomValues(arr),
            randomUUID: undefined,
        };
        vi.stubGlobal("crypto", fake_crypto);

        const id1 = safe_random_uuid();
        const id2 = safe_random_uuid();
        expect(id1).toMatch(UUID_V4_REGEX);
        expect(id2).toMatch(UUID_V4_REGEX);
        expect(id1).not.toBe(id2);
    });

    it("在 Web Crypto 完全不可用时（crypto 为 undefined）降级使用伪随机生成合法 v4 UUID", () => {
        vi.stubGlobal("crypto", undefined);

        const id1 = safe_random_uuid();
        const id2 = safe_random_uuid();
        expect(id1).toMatch(UUID_V4_REGEX);
        expect(id2).toMatch(UUID_V4_REGEX);
        expect(id1).not.toBe(id2);
    });
});
