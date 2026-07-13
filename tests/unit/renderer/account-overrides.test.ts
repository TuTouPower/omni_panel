import { describe, expect, it } from "vitest";

import * as account_overrides_module from "../../../src/renderer/lib/account-overrides";
import {
    add_account_override,
    remove_account_override,
} from "../../../src/renderer/lib/account-overrides";
import type { AccountOverrides } from "../../../src/shared/types/config";

// P0-3：删除 accountOverrides.disabled 字段。不变量 8 要求账号子行只做
// 显示调整；隐藏由 hidden 覆盖，disabled 越层（写"破坏性"状态），故删除。
// 这些测试锁定新契约：add_account_override / remove_account_override
// 只接受 "hidden" kind，AccountOverrides 类型不再含 disabled 字段。

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
        // 期望：删除 disabled 后，"disabled" 不再是合法 kind。
        // 此 @ts-expect-error 在删除前会被 TS 报"未使用的指令"（因为
        // 当前 kind 联合仍包含 "disabled"），即红；删除后才变绿。
        // @ts-expect-error -- "disabled" kind 已被删除
        add_account_override(undefined, "disabled", "claude", "default");
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

describe("AccountOverrides type", () => {
    it("does not export disable_account from account-overrides module", () => {
        // disable_account 是 PopupView 的本地闭包，account-overrides.ts
        // 不应导出该函数。
        expect(
            (account_overrides_module as Record<string, unknown>)["disable_account"],
        ).toBeUndefined();
    });

    it("does not accept a disabled field on AccountOverrides literals", () => {
        // 期望：删除 disabled 后，对象字面量不能含 disabled 字段。
        // @ts-expect-error -- AccountOverrides.disabled 已被删除
        const _o: AccountOverrides = { disabled: { claude: ["default"] } };
        void _o;
        expect(true).toBe(true);
    });
});
