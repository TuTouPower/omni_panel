import { describe, expect, it } from "vitest";
import { decide_settings_close } from "../../../src/main/core/settings-close-action";

describe("decide_settings_close", () => {
    it("hides when the app is still running (persistent window)", () => {
        expect(decide_settings_close(false)).toBe("hide");
    });

    it("lets the close proceed during quit so before-quit can destroy", () => {
        expect(decide_settings_close(true)).toBe("proceed");
    });
});
