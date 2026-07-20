/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture `use` callback, not React hook */
import { test as base, expect as baseExpect } from "@playwright/test";
import { AppFixture, type AppFixtureOptions } from "./app_fixture";

interface OmniFixtures {
    omni: AppFixture;
    omniOptions: AppFixtureOptions;
}
type ExtendedTest = ReturnType<typeof base.extend<OmniFixtures>>;

/**
 * Create an isolated test + expect pair with custom omniOptions (e.g. seeded plugins).
 * Usage in spec files:
 *
 *   const { test, expect } = createTestWithSetup({
 *       setupPlugins: (dir) => { ... },
 *   });
 *   test.describe("...", () => { ... });
 */
export function createTestWithSetup(options: AppFixtureOptions): {
    test: ExtendedTest;
    expect: typeof baseExpect;
} {
    const extended = base.extend<OmniFixtures>({
        omniOptions: async ({}, use) => {
            await use(options);
        },
        omni: async ({ omniOptions }, use) => {
            const omni = new AppFixture();
            omni.configure(omniOptions);
            await omni.start();
            await use(omni);
            await omni.stop();
        },
    });
    return { test: extended, expect: baseExpect };
}
