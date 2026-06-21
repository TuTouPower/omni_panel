import { describe, expect, it } from "vitest";

// Re-implement deep_freeze for unit testing (private function)
function deep_freeze<T>(value: T, seen = new WeakSet<object>()): T {
    if (value !== null && typeof value === "object") {
        if (seen.has(value)) return value;
        seen.add(value);
        for (const child of Object.values(value as Record<string, unknown>)) {
            deep_freeze(child, seen);
        }
        Object.freeze(value);
    }
    return value;
}

describe("deep_freeze", () => {
    it("freezes a flat object", () => {
        const obj = { a: 1, b: "hello" };
        deep_freeze(obj);
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it("freezes nested objects", () => {
        const obj = { a: { b: { c: 1 } } };
        deep_freeze(obj);
        expect(Object.isFrozen(obj)).toBe(true);
        expect(Object.isFrozen(obj.a)).toBe(true);
        expect(Object.isFrozen(obj.a.b)).toBe(true);
    });

    it("handles circular references without stack overflow", () => {
        const obj: Record<string, unknown> = { a: 1 };
        obj.self = obj;
        expect(() => deep_freeze(obj)).not.toThrow();
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it("handles mutual circular references", () => {
        const a: Record<string, unknown> = { name: "a" };
        const b: Record<string, unknown> = { name: "b" };
        a.ref = b;
        b.ref = a;
        expect(() => deep_freeze(a)).not.toThrow();
        expect(Object.isFrozen(a)).toBe(true);
        expect(Object.isFrozen(b)).toBe(true);
    });

    it("returns the same value (identity)", () => {
        const obj = { x: 1 };
        expect(deep_freeze(obj)).toBe(obj);
    });

    it("handles null and primitives", () => {
        expect(deep_freeze(null)).toBeNull();
        expect(deep_freeze(42)).toBe(42);
        expect(deep_freeze("hello")).toBe("hello");
        // undefined returns void — just ensure no throw
        deep_freeze(undefined as unknown);
    });
});
