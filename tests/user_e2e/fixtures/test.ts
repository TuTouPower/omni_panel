/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures, not React hooks */
import { test as base, expect as baseExpect } from "@playwright/test";
import { AppFixture } from "./app_fixture";

export const test = base.extend<{ omni: AppFixture }>({
    omni: async ({}, use) => {
        const omni = new AppFixture();
        await omni.start();
        await use(omni);
        await omni.stop();
    },
});

export const expect = baseExpect;
