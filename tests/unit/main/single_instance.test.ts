import { describe, expect, it, vi } from "vitest";

import {
    check_single_instance_lock,
    run_with_single_instance_lock,
} from "../../../src/main/bootstrap/single-instance";

describe("single_instance control (A3 / AC-001)", () => {
    it("check_single_instance_lock returns true and does not quit when lock is acquired", () => {
        const quit_spy = vi.fn();
        const acquired = check_single_instance_lock(() => true, quit_spy);

        expect(acquired).toBe(true);
        expect(quit_spy).not.toHaveBeenCalled();
    });

    it("check_single_instance_lock returns false and calls on_conflict when lock fails", () => {
        const quit_spy = vi.fn();
        const acquired = check_single_instance_lock(() => false, quit_spy);

        expect(acquired).toBe(false);
        expect(quit_spy).toHaveBeenCalledTimes(1);
    });

    it("run_with_single_instance_lock aborts initialization on lock conflict", async () => {
        const quit_spy = vi.fn();
        const init_fn = vi.fn().mockResolvedValue(undefined);

        const ok = await run_with_single_instance_lock(() => false, quit_spy, init_fn);

        expect(ok).toBe(false);
        expect(quit_spy).toHaveBeenCalledTimes(1);
        expect(init_fn).not.toHaveBeenCalled();
    });

    it("run_with_single_instance_lock executes initialization when lock is held", async () => {
        const quit_spy = vi.fn();
        const init_fn = vi.fn().mockResolvedValue(undefined);

        const ok = await run_with_single_instance_lock(() => true, quit_spy, init_fn);

        expect(ok).toBe(true);
        expect(quit_spy).not.toHaveBeenCalled();
        expect(init_fn).toHaveBeenCalledTimes(1);
    });
});
