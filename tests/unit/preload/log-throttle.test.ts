import { describe, expect, it } from "vitest";
import { create_renderer_log_throttle } from "../../../src/preload/log-throttle";

describe("create_renderer_log_throttle", () => {
    it("drops logs after the window limit and reports dropped count when window rolls", () => {
        const throttle = create_renderer_log_throttle({ limit: 2, window_ms: 1000 });

        expect(throttle.accept(0)).toEqual({ accepted: true });
        expect(throttle.accept(1)).toEqual({ accepted: true });
        expect(throttle.accept(2)).toEqual({ accepted: false });
        expect(throttle.flush_notice(3)).toBeNull();
        expect(throttle.flush_notice(1000)).toEqual({ dropped_count: 1 });
        expect(throttle.flush_notice(1001)).toBeNull();
        expect(throttle.accept(1001)).toEqual({ accepted: true });
    });
});
