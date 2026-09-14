import { randomUUID } from "node:crypto";
import type {
    DevPanelConfiguration,
    DevPanelScanStart,
    DevPanelScanResult,
    DevPanelState,
} from "../../../shared/types/dev-panel";
import { scan_git_roots } from "./git-scanner";

export interface DevPanelScanManager {
    start(configuration: DevPanelConfiguration): DevPanelScanStart;
    get_status(): DevPanelState;
    cancel(): void;
}

export function create_dev_panel_scan_manager(): DevPanelScanManager {
    let data_version = 0;
    let controller: AbortController | null = null;
    let state: DevPanelState = {
        status: "idle",
        scan_id: null,
        started_at: null,
        result: null,
        error: null,
    };

    function start(configuration: DevPanelConfiguration): DevPanelScanStart {
        if (controller !== null && state.status === "running" && state.scan_id) {
            return { scan_id: state.scan_id, status: "running", reused: true };
        }
        const scan_id = randomUUID();
        const next_controller = new AbortController();
        controller = next_controller;
        state = {
            status: "running",
            scan_id,
            started_at: new Date().toISOString(),
            result: state.result,
            error: null,
        };
        void scan_git_roots(configuration, scan_id, data_version + 1, next_controller.signal).then(
            (result) => {
                if (controller !== next_controller) return;
                data_version = result.data_version;
                state = {
                    status: result.status,
                    scan_id,
                    started_at: state.started_at,
                    result,
                    error: result.status === "failed" ? "未找到可读取的 Git 仓库" : null,
                };
                controller = null;
            },
            (error: unknown) => {
                if (controller !== next_controller) return;
                const cancelled = next_controller.signal.aborted;
                const result: DevPanelScanResult = {
                    scan_id,
                    status: cancelled ? "cancelled" : "failed",
                    scanned_at: new Date().toISOString(),
                    data_version: data_version + 1,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
                    scan_roots: configuration.scanRoots,
                    cutoff: configuration.commitCutoff,
                    current_user_only: configuration.currentUserOnly,
                    effective_current_user_only: false,
                    daily: [],
                    repositories: [],
                    errors: cancelled
                        ? []
                        : [
                              {
                                  root: configuration.scanRoots[0] ?? "",
                                  message: error instanceof Error ? error.message : String(error),
                              },
                          ],
                };
                data_version = result.data_version;
                state = {
                    status: result.status,
                    scan_id,
                    started_at: state.started_at,
                    result,
                    error: cancelled ? null : (result.errors[0]?.message ?? "Git 扫描失败"),
                };
                controller = null;
            },
        );
        return { scan_id, status: "running", reused: false };
    }

    function cancel(): void {
        if (controller !== null && state.status === "running") controller.abort();
    }

    return { start, get_status: () => state, cancel };
}
