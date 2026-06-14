export class ConnectorOutputParseError extends Error {
    constructor(
        message: string,
        public readonly raw: string,
    ) {
        super(message);
        this.name = "ConnectorOutputParseError";
    }
}

export class ConnectorSchemaError extends Error {
    constructor(
        message: string,
        public readonly issues: readonly unknown[],
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
    ) {
        super(message);
        this.name = "ConnectorExecutionError";
    }
}

export class ConnectorTimeoutError extends Error {
    constructor(public readonly timeoutMs: number) {
        super(`Connector execution timed out after ${String(timeoutMs)}ms`);
        this.name = "ConnectorTimeoutError";
    }
}
