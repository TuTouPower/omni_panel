import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

export function parse_builder_fuses(yaml_content: string): Record<string, boolean> {
    const lines = yaml_content.split(/\r?\n/);
    const fuses: Record<string, boolean> = {};
    let in_fuses_section = false;

    for (const line of lines) {
        if (/^\s*electronFuses:\s*$/.test(line)) {
            in_fuses_section = true;
            continue;
        }
        if (in_fuses_section) {
            const match = /^\s+([a-zA-Z0-9_]+):\s*(true|false)\s*$/.exec(line);
            if (match?.[1] && match[2]) {
                fuses[match[1]] = match[2] === "true";
            } else if (/^[^\s]/.test(line)) {
                break;
            }
        }
    }
    return fuses;
}

export function assert_no_cookie_encryption_fuses(
    fuses: Record<string, boolean>,
    context_name = "fuses",
): void {
    if (!("enableCookieEncryption" in fuses)) {
        throw new Error(`Missing enableCookieEncryption in fuses for ${context_name}`);
    }
    if (fuses["enableCookieEncryption"]) {
        throw new Error(
            `enableCookieEncryption must be false in ${context_name}, but got ${String(fuses["enableCookieEncryption"])}`,
        );
    }
}

export function assert_no_cookie_encryption(file_path: string): void {
    const content = readFileSync(file_path, "utf8");
    const fuses = parse_builder_fuses(content);
    assert_no_cookie_encryption_fuses(fuses, file_path);
}

export function parse_mac_identity(yaml_content: string): string | null | undefined {
    let in_mac = false;
    for (const line of yaml_content.split(/\r?\n/)) {
        if (/^mac:\s*$/.test(line)) {
            in_mac = true;
            continue;
        }
        if (in_mac) {
            if (/^[^\s]/.test(line)) break;
            const match = /^\s+identity:\s*(.+?)\s*$/.exec(line);
            if (match?.[1]) {
                const value = match[1];
                if (value === "null" || value === "~") return null;
                return value.replace(/^["']|["']$/g, "");
            }
        }
    }
    return undefined;
}

describe("t500 electron-builder fuses configuration", () => {
    it("parse_builder_fuses correctly extracts boolean fuses", () => {
        const sample = `
electronFuses:
    runAsNode: false
    enableCookieEncryption: true
    onlyLoadAppFromAsar: true
win:
    target: nsis
`;
        expect(parse_builder_fuses(sample)).toEqual({
            runAsNode: false,
            enableCookieEncryption: true,
            onlyLoadAppFromAsar: true,
        });
    });

    it("assert_no_cookie_encryption rejects enableCookieEncryption: true (AC-002)", () => {
        const sample_yml = `
electronFuses:
    enableCookieEncryption: true
`;
        const fuses = parse_builder_fuses(sample_yml);
        expect(() => {
            assert_no_cookie_encryption_fuses(fuses, "sample");
        }).toThrow("enableCookieEncryption must be false");
    });

    it("electron-builder.yml disables cookie encryption fuse (AC-001, AC-002)", () => {
        const path = resolve(REPO_ROOT, "electron-builder.yml");
        expect(() => {
            assert_no_cookie_encryption(path);
        }).not.toThrow();
        const content = readFileSync(path, "utf8");
        const fuses = parse_builder_fuses(content);
        expect(fuses["enableCookieEncryption"]).toBe(false);
    });

    it("electron-builder.test.yml disables cookie encryption fuse (AC-001, AC-002)", () => {
        const path = resolve(REPO_ROOT, "electron-builder.test.yml");
        expect(() => {
            assert_no_cookie_encryption(path);
        }).not.toThrow();
        const content = readFileSync(path, "utf8");
        const fuses = parse_builder_fuses(content);
        expect(fuses["enableCookieEncryption"]).toBe(false);
    });

    it("parse_mac_identity reads null and quoted values", () => {
        expect(parse_mac_identity("mac:\n    identity: null\nlinux:\n")).toBeNull();
        expect(parse_mac_identity('mac:\n    identity: "-"\n')).toBe("-");
        expect(parse_mac_identity("win:\n    target: nsis\n")).toBeUndefined();
    });

    it("electron-builder.yml pins mac.identity to null", () => {
        const content = readFileSync(resolve(REPO_ROOT, "electron-builder.yml"), "utf8");
        expect(parse_mac_identity(content)).toBeNull();
    });

    it("electron-builder.test.yml pins mac.identity to null", () => {
        const content = readFileSync(resolve(REPO_ROOT, "electron-builder.test.yml"), "utf8");
        expect(parse_mac_identity(content)).toBeNull();
    });
});
