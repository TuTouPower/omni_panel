import { test } from "../fixtures/test";

/**
 * Tray interaction cannot be tested in E2E mode.
 *
 * Reason: The app explicitly skips tray creation when E2E=1 (see src/main/index.ts).
 * In E2E mode the app auto-opens the popup window directly instead.
 * Testing real tray click/context-menu would require:
 *   1. Running without E2E=1 (fragile in CI, tray may crash in headless), or
 *   2. Adding a --with-tray flag to force tray creation in E2E mode (not yet implemented).
 *
 * Tray behavior is covered by manual QA and the unit-level window creation tests.
 */
test.describe.skip("tray interaction", () => {
    test("left-click toggles popup window", async () => {
        // Cannot automate: tray is skipped in E2E=1 mode.
    });

    test("right-click shows context menu with settings and quit", async () => {
        // Cannot automate: tray is skipped in E2E=1 mode.
    });
});
