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
