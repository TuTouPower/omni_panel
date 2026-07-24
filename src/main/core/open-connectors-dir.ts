/**
 * 打开用户 connectors 脚本目录：确保目录存在，再交给系统文件管理器打开。
 *
 * 抽成纯函数 + 依赖注入，便于在单元测试中覆盖 mkdir/openPath 的成功与失败路径，
 * 而不触碰真实文件系统与 shell。IPC handler 在 src/main/index.ts 接线。
 */
export interface OpenConnectorsDirDeps {
    /** 目标目录绝对路径。 */
    readonly dir: string;
    /** 递归创建目录（等价 mkdir(p, { recursive: true })）。 */
    readonly mkdir: (path: string) => Promise<void>;
    /** 用系统文件管理器打开目录；返回非空字符串表示失败原因。 */
    readonly open_path: (path: string) => Promise<string>;
    /** 日志接收方，失败时记 warn。 */
    readonly log: { warn(message: string): void };
}

/**
 * 执行「确保目录 + 打开目录」。mkdir 失败时记 warn 但仍尝试打开
 * （目录可能已存在或由其它途径创建），openPath 失败再记 warn。
 */
export async function open_connectors_dir(deps: OpenConnectorsDirDeps): Promise<void> {
    try {
        await deps.mkdir(deps.dir);
    } catch (err) {
        // recursive:true 时 EEXIST 不抛；此处捕获到的均为真实失败（权限/磁盘）。
        deps.log.warn(`connectors dir create failed: ${String(err)}`);
    }
    const open_err = await deps.open_path(deps.dir);
    if (open_err) {
        deps.log.warn(`open connectors dir failed: ${open_err}`);
    }
}
