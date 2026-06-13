import vm from "node:vm";
import { describe, expect, it } from "vitest";

function create_frozen_context(values: Record<string, unknown> = {}): vm.Context {
    return vm.createContext(Object.freeze({ ...values }));
}

describe("sandbox poc", () => {
    it("can run script in frozen context", () => {
        const context = create_frozen_context();
        const result: unknown = vm.runInContext("1 + 2", context, { timeout: 5000 }) as unknown;
        expect(result).toBe(3);
    });

    it("can inject host function and call from script", async () => {
        const context = create_frozen_context({
            host_fetch: (url: string) => Promise.resolve(`response:${url}`),
        });
        const result: unknown = (await vm.runInContext(
            `(async () => await host_fetch("https://example.com"))()`,
            context,
            { timeout: 5000 },
        )) as unknown;
        expect(result).toBe("response:https://example.com");
    });

    it("times out on infinite loop", () => {
        const context = create_frozen_context();
        expect(() => {
            vm.runInContext("while(true){}", context, { timeout: 100 });
        }).toThrow();
    });

    it("cannot access require or process", () => {
        const context = create_frozen_context();
        const result: unknown = vm.runInContext(
            `typeof require !== "undefined" || typeof process !== "undefined"`,
            context,
            { timeout: 5000 },
        ) as unknown;
        expect(result).toBe(false);
    });

    it("can pass complex object through frozen context", () => {
        const context = create_frozen_context({ data: { items: [1, 2, 3] } });
        const result: unknown = vm.runInContext("data.items.length", context, {
            timeout: 5000,
        }) as unknown;
        expect(result).toBe(3);
    });

    it("script can return array that host can read", () => {
        const context = create_frozen_context();
        const result: unknown = vm.runInContext(`[{ provider: "test", used: 100 }]`, context, {
            timeout: 5000,
        }) as unknown;
        expect(Array.isArray(result)).toBe(true);
        expect((result as { provider: string }[])[0]?.provider).toBe("test");
    });
});
