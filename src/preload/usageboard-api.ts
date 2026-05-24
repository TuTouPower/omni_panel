import type { UsageboardApi } from "../shared/types/ipc";

declare global {
    interface Window {
        usageboard: UsageboardApi;
    }
}
