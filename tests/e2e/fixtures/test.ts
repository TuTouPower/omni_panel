/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures, not React hooks */
import { test as base, expect as baseExpect } from "@playwright/test";
import { AppFixture, type AppFixtureOptions } from "./app_fixture";

export const test = base.extend<{ omni: AppFixture; omniOptions: AppFixtureOptions }>({
    omniOptions: async ({}, use) => {
        await use({});
    },
    omni: async ({ omniOptions }, use) => {
        const omni = new AppFixture();
        omni.configure(omniOptions);
        await omni.start();
        await use(omni);
        await omni.stop();
    },
});

export const expect = baseExpect;

/**
 * t280: e2e headless 门控。E2E_HEADLESS=1 时 app 侧窗口 show:false（不弹屏），
 * 依赖窗口可见性/焦点/真实渲染/尺寸度量的 spec 在此模式下断言失效，标「仅 headed」
 * 跳过（spec AC5：triage 标记清单）。
 */
export function is_e2e_headless(): boolean {
    return process.env["E2E_HEADLESS"] === "1";
}

/** 仅 headed spec 的统一跳过原因。 */
export function headless_skip_reason(feature: string): string {
    return `仅 headed（依赖窗口${feature}，headless 下 show:false 无可见窗口）`;
}
