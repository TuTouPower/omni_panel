import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../../../src/shared/lib/logger";
import { register_renderer_log_transport } from "../../../../src/renderer/lib/logger-transport";

describe("renderer logger transport", () => {
    it("forwards shared logger metadata to the preload log API", () => {
        const log = vi.fn();
        const remove_transport = register_renderer_log_transport({ log });

        try {
            createLogger("renderer:usage-colors").debug("bar fill color raw", {
                elapsed: 0.6,
                result: "var(--risk-yellow)",
            });

            expect(log).toHaveBeenCalledWith({
                level: "debug",
                module: "renderer:usage-colors",
                message: "bar fill color raw",
                meta: {
                    elapsed: 0.6,
                    result: "var(--risk-yellow)",
                },
            });
        } finally {
            remove_transport();
        }
    });
});
