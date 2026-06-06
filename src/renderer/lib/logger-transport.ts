import { addTransport } from "../../shared/lib/logger";
import type { UsageboardApi } from "../../shared/types/ipc";

export function register_renderer_log_transport(api: Pick<UsageboardApi, "log">): () => void {
    return addTransport({
        write(level, module, message, meta) {
            api.log({ level, module, message, meta });
        },
    });
}
