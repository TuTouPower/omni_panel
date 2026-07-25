import { useDeviceLogin } from "./use-device-login";

/**
 * Grok device-code login hook. Thin wrapper over the shared
 * `useDeviceLogin` (t118); behavior is identical to the previous
 * grok-specific implementation.
 */
export type { UseDeviceLoginResult as UseGrokDeviceLoginResult } from "./use-device-login";

export function useGrokDeviceLogin(instance_id: string) {
    return useDeviceLogin("grok", instance_id);
}
