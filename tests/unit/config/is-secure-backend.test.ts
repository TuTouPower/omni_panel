import { describe, it, expect } from "vitest";
import { isSecureBackend } from "../../../src/main/core/config/safe-storage-crypto";

describe("isSecureBackend", () => {
    it("allows gnome_libsecret", () => {
        expect(isSecureBackend("gnome_libsecret")).toBe(true);
    });

    it("allows kwallet variants", () => {
        expect(isSecureBackend("kwallet")).toBe(true);
        expect(isSecureBackend("kwallet5")).toBe(true);
        expect(isSecureBackend("kwallet6")).toBe(true);
    });

    it("rejects basic_text", () => {
        expect(isSecureBackend("basic_text")).toBe(false);
    });

    it("rejects unknown", () => {
        expect(isSecureBackend("unknown")).toBe(false);
    });
});
