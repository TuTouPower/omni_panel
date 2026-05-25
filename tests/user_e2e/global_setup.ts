async function globalSetup(): Promise<void> {
    // Build is expected to exist at .vite/build/index.js before running E2E tests.
    // Run `pnpm package` manually if it doesn't exist.
    // We don't run package here because it's slow (downloads Electron binary, creates asar etc.)
    // For CI: add `pnpm package` as a prerequisite step.
    console.log("[E2E global setup] Starting...");
    await Promise.resolve();
}

export default globalSetup;
