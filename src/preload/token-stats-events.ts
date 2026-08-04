import { IPC_CHANNELS } from "../shared/types/ipc";

interface IpcRendererLike {
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

/**
 * t202/p035: onUpdated 事件版本转发粘合。main 发 `TOKEN_STATS_UPDATED(data_version)`
 * （number），preload 解析为 number 后回调；非 number 载荷归 0（web 构建无推送
 * 通道的既有约定）。抽成纯函数供 ipc/preload 层测试捕获版本转发不丢失不错位。
 */
export function create_on_updated_subscriber(
    ipc: IpcRendererLike,
): (callback: (dataVersion: number) => void) => () => void {
    return (callback) => {
        const listener = (_event: unknown, dataVersion: unknown) => {
            callback(typeof dataVersion === "number" ? dataVersion : 0);
        };
        ipc.on(IPC_CHANNELS.TOKEN_STATS_UPDATED, listener);
        return () => {
            ipc.removeListener(IPC_CHANNELS.TOKEN_STATS_UPDATED, listener);
        };
    };
}
