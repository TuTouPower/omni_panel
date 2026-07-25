import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFile, mkdir, rename, open } from "node:fs/promises";
import { writeJsonAtomic } from "../../../../src/main/core/storage/write-json";
import type { AppConfiguration } from "../../../../src/shared/types/config";

vi.mock("node:fs/promises");

describe("write-json atomic helpers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("fsyncs tmp file and closes handle before rename (prevents null-padding corruption)", async () => {
        const order: string[] = [];
        const filePath = "/tmp/omni/config.json";
        const payload: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
        };

        vi.mocked(mkdir).mockImplementation(() => {
            order.push("mkdir");
            return Promise.resolve("");
        });
        vi.mocked(writeFile).mockImplementation(() => {
            order.push("writeFile");
            return Promise.resolve();
        });

        const mockHandle = {
            sync: vi.fn().mockImplementation(() => {
                order.push("sync");
                return Promise.resolve();
            }),
            close: vi.fn().mockImplementation(() => {
                order.push("close");
                return Promise.resolve();
            }),
        };
        vi.mocked(open).mockImplementation((_path, mode) => {
            order.push(`open:${String(mode)}`);
            return Promise.resolve(mockHandle as unknown as Awaited<ReturnType<typeof open>>);
        });
        vi.mocked(rename).mockImplementation(() => {
            order.push("rename");
            return Promise.resolve();
        });

        await writeJsonAtomic(filePath, payload);

        expect(mkdir).toHaveBeenCalledTimes(1);
        expect(mkdir).toHaveBeenCalledWith("/tmp/omni", { recursive: true });

        expect(writeFile).toHaveBeenCalledTimes(1);
        const tmpPath = `${filePath}.tmp`;
        expect(writeFile).toHaveBeenCalledWith(tmpPath, JSON.stringify(payload, null, 2), "utf8");

        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith(tmpPath, "r+");

        expect(mockHandle.sync).toHaveBeenCalledTimes(1);
        expect(mockHandle.close).toHaveBeenCalledTimes(1);

        expect(rename).toHaveBeenCalledTimes(1);
        expect(rename).toHaveBeenCalledWith(tmpPath, filePath);

        const syncIdx = order.indexOf("sync");
        const closeIdx = order.indexOf("close");
        const renameIdx = order.indexOf("rename");
        expect(syncIdx).toBeLessThan(closeIdx);
        expect(closeIdx).toBeLessThan(renameIdx);
    });

    it("closes the file handle even when fsync throws", async () => {
        const filePath = "/tmp/omni/config.json";
        const payload: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
        };

        vi.mocked(mkdir).mockResolvedValue(undefined);
        vi.mocked(writeFile).mockResolvedValue(undefined);
        vi.mocked(rename).mockResolvedValue(undefined);

        const mockHandle = {
            sync: vi.fn().mockRejectedValue(new Error("fsync failed")),
            close: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(open).mockResolvedValue(
            mockHandle as unknown as Awaited<ReturnType<typeof open>>,
        );

        await expect(writeJsonAtomic(filePath, payload)).rejects.toThrow("fsync failed");

        expect(mockHandle.sync).toHaveBeenCalledTimes(1);
        expect(mockHandle.close).toHaveBeenCalledTimes(1);
        expect(rename).not.toHaveBeenCalled();
    });
});
