import { describe, expect, it, vi } from "vitest";
import { open_connectors_dir } from "../../../src/main/core/open-connectors-dir";

function make_deps(
    overrides: {
        mkdir?: (p: string) => Promise<void>;
        open_path?: (p: string) => Promise<string>;
    } = {},
) {
    const log = { warn: vi.fn() };
    return {
        dir: "/fake/connectors",
        mkdir: overrides.mkdir ?? vi.fn().mockResolvedValue(undefined),
        open_path: overrides.open_path ?? vi.fn().mockResolvedValue(""),
        log,
    };
}

describe("open_connectors_dir (t094)", () => {
    it("creates dir then opens it on success", async () => {
        const mkdir = vi.fn().mockResolvedValue(undefined);
        const open_path = vi.fn().mockResolvedValue("");
        const deps = make_deps({ mkdir, open_path });

        await open_connectors_dir(deps);

        expect(mkdir).toHaveBeenCalledWith("/fake/connectors");
        expect(open_path).toHaveBeenCalledWith("/fake/connectors");
        expect(deps.log.warn).not.toHaveBeenCalled();
    });

    it("logs warn and still attempts open when mkdir fails", async () => {
        const mkdir = vi.fn().mockRejectedValue(new Error("EACCES"));
        const open_path = vi.fn().mockResolvedValue("");
        const deps = make_deps({ mkdir, open_path });

        await open_connectors_dir(deps);

        expect(deps.log.warn).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
        expect(open_path).toHaveBeenCalledWith("/fake/connectors");
    });

    it("logs warn when open_path returns a non-empty error string", async () => {
        const open_path = vi.fn().mockResolvedValue("Failed to open");
        const deps = make_deps({ open_path });

        await open_connectors_dir(deps);

        expect(deps.log.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to open"));
    });
});
