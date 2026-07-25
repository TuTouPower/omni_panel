import { useDeviceLogin } from "./use-device-login";

/**
 * Kimi device-code login hook. Thin wrapper over the shared
 * `useDeviceLogin` (t118); behavior is identical to the previous
 * kimi-specific implementation.
 */
export type { UseDeviceLoginResult as UseKimiDeviceLoginResult } from "./use-device-login";

export function useKimiDeviceLogin(instance_id: string) {
    return useDeviceLogin("kimi", instance_id);
}
