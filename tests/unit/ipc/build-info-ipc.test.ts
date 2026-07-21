import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/generated/build-info", () => ({
    BUILD_INFO: { branch: "test_branch", commit: "test_commit" },
}));

import { handleBuildInfo } from "../../../src/main/ipc/build-info-ipc";

describe("build-info-ipc", () => {
    it("returns app version with embedded build info", () => {
        const result = handleBuildInfo("1.2.3");
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected ok");
        expect(result.data).toEqual({
            version: "1.2.3",
            branch: "test_branch",
            commit: "test_commit",
        });
    });
});
