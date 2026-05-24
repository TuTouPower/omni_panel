export class PluginOutputParseError extends Error {
    constructor(message: string, public readonly raw: string) {
        super(message);
        this.name = "PluginOutputParseError";
    }
}

export class PluginSchemaError extends Error {
    constructor(message: string, public readonly issues: readonly unknown[]) {
        super(message);
        this.name = "PluginSchemaError";
    }
}

export class MetadataParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MetadataParseError";
    }
}

export class PluginExecutionError extends Error {
    constructor(
        message: string,
        public readonly exitCode: number,
        public readonly stderr: string,
    ) {
        super(message);
        this.name = "PluginExecutionError";
    }
}

export class PluginTimeoutError extends Error {
    constructor(public readonly timeoutMs: number) {
        super(`Plugin execution timed out after ${timeoutMs}ms`);
        this.name = "PluginTimeoutError";
    }
}
