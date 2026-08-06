export interface VaultBackend {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    list_keys(prefix?: string): Promise<string[]>;
    /** 原子整体替换 vault 内容：单次加密全量、单次写盘，失败时磁盘与镜像均保持旧态。 */
    replaceAll(entries: Record<string, string>): Promise<void>;
}
