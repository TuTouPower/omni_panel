import { describe, expect, it } from "vitest";

import {
    remove_account_label,
    set_account_label,
} from "../../../src/renderer/lib/account-overrides";
import type { AccountLabels } from "../../../src/shared/types/config";

describe("set_account_label", () => {
    it("adds a label into empty labels", () => {
        const r = set_account_label(undefined, "glm", "default", "工作账号");
        expect(r.glm?.["default"]).toBe("工作账号");
    });

    it("overwrites an existing label for the same account", () => {
        const r = set_account_label({ glm: { default: "旧名" } }, "glm", "default", "新名");
        expect(r.glm?.["default"]).toBe("新名");
    });

    it("adds a second account under the same provider without dropping the first", () => {
        const r = set_account_label({ glm: { default: "工作" } }, "glm", "bob@x.com", "Bob");
        expect(r.glm).toEqual({ default: "工作", "bob@x.com": "Bob" });
    });

    it("adds a second provider without dropping the first", () => {
        const r = set_account_label({ glm: { default: "工作" } }, "deepseek", "default", "DS");
        expect(r.glm?.["default"]).toBe("工作");
        expect(r.deepseek?.["default"]).toBe("DS");
    });

    it("does not mutate the input", () => {
        const orig: AccountLabels = { glm: { default: "工作" } };
        set_account_label(orig, "glm", "default", "新名");
        expect(orig.glm?.["default"]).toBe("工作");
    });
});

describe("remove_account_label", () => {
    it("removes one account among several under the same provider", () => {
        const r = remove_account_label({ glm: { a: "1", b: "2" } }, "glm", "a");
        expect(r.glm).toEqual({ b: "2" });
    });

    it("drops the provider key when its last account is removed", () => {
        const r = remove_account_label({ glm: { a: "1" } }, "glm", "a");
        expect(r.glm).toBeUndefined();
        expect(Object.keys(r)).not.toContain("glm");
    });

    it("is a no-op when the provider does not exist", () => {
        const orig: AccountLabels = { glm: { a: "1" } };
        const r = remove_account_label(orig, "deepseek", "a");
        expect(r).toBe(orig);
    });

    it("is a no-op when the account does not exist", () => {
        const orig: AccountLabels = { glm: { a: "1" } };
        const r = remove_account_label(orig, "glm", "missing");
        expect(r).toBe(orig);
    });

    it("preserves other providers when dropping a provider key", () => {
        const r = remove_account_label({ glm: { a: "1" }, deepseek: { b: "2" } }, "glm", "a");
        expect(r.glm).toBeUndefined();
        expect(r.deepseek).toEqual({ b: "2" });
    });
});
