import { describe, expect, it, vi } from "vitest";
import { promises as fsp } from "node:fs";

// t340 AC-003：device_id 进程内缓存，同一运行期只读一次文件。
// 用 vi.resetModules + 动态 import 隔离 module 级 cached_device_id，
// 避免其它测试的默认 resolver 调用污染缓存。
describe("kimi make_default_get_device_id 缓存", () => {
    it("同一运行期只读一次文件（t340 AC-003）", async () => {
        vi.resetModules();
        const read_spy = vi.spyOn(fsp, "readFile").mockResolvedValue("cached-dev-id");
        const { make_default_get_device_id } =
            await import("../../../src/main/core/auth/kimi_oauth_manager");

        const get_id = make_default_get_device_id();
        const first = await get_id();
        const second = await get_id();

        expect(first).toBe("cached-dev-id");
        expect(second).toBe("cached-dev-id");
        expect(read_spy).toHaveBeenCalledTimes(1);
        read_spy.mockRestore();
    });

    it("读失败走生成分支并缓存生成值（t340 AC-003）", async () => {
        vi.resetModules();
        const read_spy = vi.spyOn(fsp, "readFile").mockRejectedValue(new Error("no file"));
        const write_spy = vi.spyOn(fsp, "writeFile").mockResolvedValue();
        const mkdir_spy = vi.spyOn(fsp, "mkdir").mockResolvedValue(undefined);
        const { make_default_get_device_id } =
            await import("../../../src/main/core/auth/kimi_oauth_manager");

        const get_id = make_default_get_device_id();
        const first = await get_id();
        const second = await get_id();

        expect(first).not.toBeNull();
        expect(second).toBe(first); // 第二次走缓存，不重新读/生成
        expect(read_spy).toHaveBeenCalledTimes(1);
        expect(write_spy).toHaveBeenCalledTimes(1);

        read_spy.mockRestore();
        write_spy.mockRestore();
        mkdir_spy.mockRestore();
    });
});
