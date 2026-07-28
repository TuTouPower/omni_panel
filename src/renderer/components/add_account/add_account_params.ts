import type { AddServiceId } from "../../lib/common-services";
import type { ResolvedAuthMethod } from "../../lib/auth-flow-registry";

export interface AddAccountParams {
    vendor_id: AddServiceId;
    source_instance_id?: string;
    oauth_source_instance_id?: string;
    /** t121: manifest id used by config.createInstance to spawn a new instance. */
    manifest_id?: string;
    account_name: string;
    auth_method: ResolvedAuthMethod;
    parameter_values: Record<string, string>;
    endpoint_overrides?: Record<string, string>;
    secrets: Record<string, string>;
}
