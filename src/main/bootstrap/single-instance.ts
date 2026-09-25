/**
 * 单实例锁安全检查与启动控制 (A3 / AC-001)。
 */
export function check_single_instance_lock(
    lock_requester: () => boolean,
    on_conflict: () => void,
): boolean {
    const got_lock = lock_requester();
    if (!got_lock) {
        on_conflict();
        return false;
    }
    return true;
}

/**
 * 执行受单实例锁保护的初始化流程。
 * 锁冲突时调用 on_conflict 并立即短路，不执行 init_callback。
 */
export async function run_with_single_instance_lock(
    lock_requester: () => boolean,
    on_conflict: () => void,
    init_callback: () => Promise<void> | void,
): Promise<boolean> {
    if (!check_single_instance_lock(lock_requester, on_conflict)) {
        return false;
    }
    await init_callback();
    return true;
}
