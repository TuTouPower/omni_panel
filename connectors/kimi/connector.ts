import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

void ctx;

function main(): ScriptObservation[] {
    return [];
}

void main;
