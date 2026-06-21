export enum ConnectorErrorCode {
    TIMEOUT = "TIMEOUT",
    PROCESS_KILLED = "PROCESS_KILLED",
    SCHEMA_FAILURE = "SCHEMA_FAILURE",
    NETWORK_ERROR = "NETWORK_ERROR",
    AUTH_FAILURE = "AUTH_FAILURE",
    RUNTIME_ERROR = "RUNTIME_ERROR",
}

export class ConnectorOutputParseError extends Error {
    constructor(
        message: string,
        public readonly raw: string,
        public readonly code: ConnectorErrorCode = ConnectorErrorCode.RUNTIME_ERROR,
    ) {
        super(message);
        this.name = "ConnectorOutputParseError";
    }
}

export class ConnectorSchemaError extends Error {
    constructor(
        message: string,
        public readonly issues: readonly unknown[],
        public readonly code: ConnectorErrorCode = ConnectorErrorCode.SCHEMA_FAILURE,
    ) {
        super(message);
        this.name = "ConnectorSchemaError";
    }
}

export class ConnectorExecutionError extends Error {
    constructor(
        message: string,
        public readonly exitCode: number,
        public readonly stderr: string,
        public readonly code: ConnectorErrorCode = ConnectorErrorCode.RUNTIME_ERROR,
    ) {
        super(message);
        this.name = "ConnectorExecutionError";
    }
}

export class ConnectorTimeoutError extends Error {
    constructor(
        public readonly timeoutMs: number,
        public readonly code: ConnectorErrorCode = ConnectorErrorCode.TIMEOUT,
    ) {
        super(`Connector execution timed out after ${String(timeoutMs)}ms`);
        this.name = "ConnectorTimeoutError";
    }
}
