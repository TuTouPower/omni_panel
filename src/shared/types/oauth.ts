export interface GrokLoginResult {
    readonly saved: boolean;
    readonly token?: string;
    readonly refresh_token?: string;
    readonly expires_at?: string;
}

export interface KimiLoginResult {
    readonly saved: boolean;
    readonly token?: string;
    readonly refresh_token?: string;
    readonly expires_at?: string;
}
