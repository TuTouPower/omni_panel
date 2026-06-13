import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

void ctx;

function main(): Observation[] {
    return [];
}

void main;
