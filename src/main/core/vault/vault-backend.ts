export interface VaultBackend {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    list_keys(prefix?: string): Promise<string[]>;
}
