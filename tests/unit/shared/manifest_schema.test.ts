import { describe, expect, it } from "vitest";
import { manifest_schema } from "../../../src/shared/schemas/manifest";

describe("manifest_schema strict validation", () => {
    const valid_base = {
        id: "test",
        provider: "claude" as const,
        capabilities: ["poll" as const],
        poll: {
            request: { endpoint: "default", path: "/api", method: "GET" as const },
            map: {},
        },
    };

    it("accepts a valid manifest", () => {
        const result = manifest_schema.safeParse(valid_base);
        expect(result.success).toBe(true);
    });

    it("rejects unknown top-level fields", () => {
        const result = manifest_schema.safeParse({
            ...valid_base,
            unknown_field: "oops",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toContain("unrecognized");
        }
    });

    it("rejects typos in field names", () => {
        const result = manifest_schema.safeParse({
            ...valid_base,
            parametrs: [],
        });
        expect(result.success).toBe(false);
    });

    it("rejects poll.map used/limit/remaining that are not $ JSON-paths", () => {
        const result = manifest_schema.safeParse({
            ...valid_base,
            poll: {
                request: { endpoint: "default", path: "/api", method: "GET" },
                map: { used: "0", limit: "1000" },
            },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toContain("must be a JSON path");
        }
    });

    it("accepts poll.map with $-paths plus a literal window", () => {
        const result = manifest_schema.safeParse({
            ...valid_base,
            poll: {
                request: { endpoint: "default", path: "/api", method: "GET" },
                map: { used: "$.u", limit: "$.l", remaining: "$.r", window: "month" },
            },
        });
        expect(result.success).toBe(true);
    });
});
