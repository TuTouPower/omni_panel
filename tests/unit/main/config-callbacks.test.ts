import { describe, it, expect, vi } from "vitest";
import { createOnConfigImported } from "../../../src/main/config-callbacks";

describe("createOnConfigImported", () => {
    it("calls refreshAll exactly once when the callback fires", () => {
        const refreshAll = vi.fn().mockResolvedValue(undefined);
        const log = { info: vi.fn(), error: vi.fn() };

        const callback = createOnConfigImported({ refreshAll }, log);
        callback({} as never);

        expect(refreshAll).toHaveBeenCalledTimes(1);
        expect(log.info).toHaveBeenCalledWith("Config imported - triggering global refresh");
        expect(log.error).not.toHaveBeenCalled();
    });

    it("logs and swallows a refreshAll rejection so a failed import-time refresh never escapes", async () => {
        const refreshAll = vi.fn().mockRejectedValue(new Error("upstream 429"));
        const log = { info: vi.fn(), error: vi.fn() };

        const callback = createOnConfigImported({ refreshAll }, log);
        callback({} as never);
        await vi.waitFor(() => {
            expect(log.error).toHaveBeenCalled();
        });

        expect(refreshAll).toHaveBeenCalledTimes(1);
        expect(log.error.mock.calls[0]?.[0]).toContain("upstream 429");
    });
});
