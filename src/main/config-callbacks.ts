import type { AppConfiguration } from "../shared/types/config";

/** Minimal shapes the factory needs — keeps it unit-testable without Electron. */
export interface RefreshAllCapable {
    refreshAll(): Promise<void>;
}
export interface CallbackLogger {
    info(message: string): void;
    error(message: string): void;
}

/**
 * t045: callback fired after CONFIG_IMPORT succeeds. onConfigSaved has already
 * synchronously rebuilt the scheduler (new connectors registered) before this
 * fires, so one global refresh surfaces newly imported accounts on the panel
 * without waiting a full scheduler period (default 1800s). Extracted as a
 * factory so the wiring — that refreshAll is actually called — is unit-testable;
 * index.ts's Electron-main assembly line itself stays untested by project
 * convention (same as TRAY_REFRESH_ALL / onConfigSaved).
 */
export function createOnConfigImported(
    refreshService: RefreshAllCapable,
    log: CallbackLogger,
): (config: AppConfiguration) => void {
    return () => {
        log.info("Config imported - triggering global refresh");
        void refreshService.refreshAll().catch((err: unknown) => {
            log.error(
                `import refresh-all failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        });
    };
}
