import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AccountOverrides } from "../../../../src/shared/types/config";
import { use_watched_metric_toggler } from "../../../../src/renderer/hooks/use_watched_metric_toggler";

describe("use_watched_metric_toggler", () => {
    it("adds watched metric when not watched, then removes when watched", () => {
        const set_account_overrides = vi.fn();
        const patchConfig = vi.fn();
        const { result, rerender } = renderHook(
            ({ ov }: { ov: AccountOverrides | undefined }) =>
                use_watched_metric_toggler({
                    account_overrides: ov,
                    set_account_overrides,
                    patchConfig,
                }),
            { initialProps: { ov: undefined as AccountOverrides | undefined } },
        );

        // initial undefined → not watched → add
        act(() => {
            result.current({ provider: "claude", accountKey: "acct1", raw_label: "5小时" });
        });
        expect(set_account_overrides).toHaveBeenCalledTimes(1);
        expect(patchConfig).toHaveBeenCalledTimes(1);
        const add_call = set_account_overrides.mock.calls[0];
        if (!add_call) throw new Error("missing add call");
        const added = add_call[0] as AccountOverrides;
        expect(added.upcomingResetWatched?.claude?.["acct1"]).toEqual(["5小时"]);
        expect(patchConfig).toHaveBeenCalledWith({ accountOverrides: added });

        // rerender with watched state → now watched → remove
        rerender({ ov: added });
        act(() => {
            result.current({ provider: "claude", accountKey: "acct1", raw_label: "5小时" });
        });
        expect(set_account_overrides).toHaveBeenCalledTimes(2);
        expect(patchConfig).toHaveBeenCalledTimes(2);
        const remove_call = set_account_overrides.mock.calls[1];
        if (!remove_call) throw new Error("missing remove call");
        const removed = remove_call[0] as AccountOverrides;
        expect(removed.upcomingResetWatched).toBeUndefined();
    });
});
