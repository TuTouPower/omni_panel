import { describe, expect, it } from "vitest";

import * as account_overrides_module from "../../../src/renderer/lib/account-overrides";
import {
    add_account_override,
    remove_account_override,
    add_watched_metric,
    remove_watched_metric,
} from "../../../src/renderer/lib/account-overrides";
import type { AccountOverrides } from "../../../src/shared/types/config";

// P0-3：删除 accountOverrides.disabled 字段。不变量 8 要求账号子行只做
// 显示调整；隐藏由 hidden 覆盖，disabled 越层（写"破坏性"状态），故删除。
// 这些测试锁定新契约：add_account_override / remove_account_override
// 只接受 "hidden" kind，AccountOverrides 类型不再含 disabled 字段。
// t043：account 级 upcomingResetOff 废弃，改 metric 级 upcomingResetWatched
// （add_watched_metric / remove_watched_metric，raw_label 维度）。

describe("add_account_override", () => {
    it("adds a hidden override into empty overrides", () => {
        const r = add_account_override(undefined, "hidden", "claude", "default");
        expect(r.hidden?.claude).toEqual(["default"]);
    });

    it("merges new account into an existing hidden list", () => {
        const r = add_account_override(
            { hidden: { claude: ["default"] } },
            "hidden",
            "claude",
            "auth-b",
        );
        expect(r.hidden?.claude).toEqual(["default", "auth-b"]);
    });

    it("rejects 'disabled' as a kind at the type level", () => {
        // @ts-expect-error -- "disabled" kind 已被删除
        add_account_override(undefined, "disabled", "claude", "default");
        expect(true).toBe(true);
    });

    it("rejects 'upcomingResetOff' as a kind at the type level (t043)", () => {
        // t043: account 级 upcomingResetOff 废弃，不再是合法 kind。
        // @ts-expect-error -- "upcomingResetOff" kind 已被删除
        add_account_override(undefined, "upcomingResetOff", "claude", "default");
        expect(true).toBe(true);
    });
});

describe("remove_account_override", () => {
    it("removes an account from a hidden override list", () => {
        const r = remove_account_override(
            { hidden: { claude: ["default", "auth-b"] } },
            "hidden",
            "claude",
            "default",
        );
        expect(r.hidden?.claude).toEqual(["auth-b"]);
    });

    it("drops the kind key when its last account is removed", () => {
        const r = remove_account_override(
            { hidden: { claude: ["default"] } },
            "hidden",
            "claude",
            "default",
        );
        expect(r.hidden).toBeUndefined();
        expect(Object.keys(r)).not.toContain("hidden");
    });

    it("rejects 'disabled' as a kind at the type level", () => {
        // @ts-expect-error -- "disabled" kind 已被删除
        remove_account_override({}, "disabled", "claude", "default");
        expect(true).toBe(true);
    });
});

describe("add_watched_metric (t043)", () => {
    it("adds a watched raw_label into empty overrides", () => {
        const r = add_watched_metric(undefined, "claude", "acct1", "5小时");
        expect(r.upcomingResetWatched?.claude?.["acct1"]).toEqual(["5小时"]);
    });

    it("merges new raw_label into an existing watched list", () => {
        const r = add_watched_metric(
            { upcomingResetWatched: { claude: { acct1: ["5小时"] } } },
            "claude",
            "acct1",
            "一周",
        );
        expect(r.upcomingResetWatched?.claude?.["acct1"]).toEqual(["5小时", "一周"]);
    });

    it("does not duplicate an already-watched raw_label", () => {
        const r = add_watched_metric(
            { upcomingResetWatched: { claude: { acct1: ["5小时"] } } },
            "claude",
            "acct1",
            "5小时",
        );
        expect(r.upcomingResetWatched?.claude?.["acct1"]).toEqual(["5小时"]);
    });
});

describe("remove_watched_metric (t043)", () => {
    it("removes a raw_label from a watched list", () => {
        const r = remove_watched_metric(
            { upcomingResetWatched: { claude: { acct1: ["5小时", "一周"] } } },
            "claude",
            "acct1",
            "5小时",
        );
        expect(r.upcomingResetWatched?.claude?.["acct1"]).toEqual(["一周"]);
    });

    it("drops the account key when its last raw_label is removed", () => {
        const r = remove_watched_metric(
            { upcomingResetWatched: { claude: { acct1: ["5小时"] } } },
            "claude",
            "acct1",
            "5小时",
        );
        expect(r.upcomingResetWatched?.claude?.["acct1"]).toBeUndefined();
    });

    it("drops the provider key when its last account is removed", () => {
        const r = remove_watched_metric(
            { upcomingResetWatched: { claude: { acct1: ["5小时"] } } },
            "claude",
            "acct1",
            "5小时",
        );
        expect(r.upcomingResetWatched?.claude).toBeUndefined();
    });
});

describe("AccountOverrides type", () => {
    it("does not export disable_account from account-overrides module", () => {
        expect(
            (account_overrides_module as Record<string, unknown>)["disable_account"],
        ).toBeUndefined();
    });

    it("does not accept a disabled field on AccountOverrides literals", () => {
        // @ts-expect-error -- AccountOverrides.disabled 已被删除
        const _o: AccountOverrides = { disabled: { claude: ["default"] } };
        void _o;
        expect(true).toBe(true);
    });

    it("does not accept an upcomingResetOff field on AccountOverrides literals (t043)", () => {
        // @ts-expect-error -- AccountOverrides.upcomingResetOff 已被删除（t043）
        const _o: AccountOverrides = { upcomingResetOff: { claude: ["default"] } };
        void _o;
        expect(true).toBe(true);
    });
});
