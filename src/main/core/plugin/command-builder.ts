import type { AppLanguage } from "../../../shared/types/plugin";

export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
}

export function buildPluginCommand(
    executablePath: string,
    parameterValues: Record<string, string>,
    language: AppLanguage,
): PluginCommand {
    const paramArgs: string[] = [];

    for (const [key, value] of Object.entries(parameterValues)) {
        if (value !== "") {
            paramArgs.push(`--usageboard-param=${key}=${value}`);
        }
    }

    paramArgs.push(`--usageboard-param=USAGEBOARD_LANGUAGE=${language}`);

    if (executablePath.endsWith(".py")) {
        return {
            command: "python3",
            args: [executablePath, ...paramArgs],
        };
    }

    return {
        command: executablePath,
        args: paramArgs,
    };
}
