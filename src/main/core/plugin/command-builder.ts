import type { AppLanguage } from "../../../shared/types/plugin";
import { dirname } from "node:path";

export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
}

export function buildPluginCommand(
    executablePath: string,
    parameterValues: Record<string, string>,
    language: AppLanguage,
    pythonCommand = "python3",
): PluginCommand {
    const paramArgs: string[] = [];

    for (const [key, value] of Object.entries(parameterValues)) {
        if (value !== "") {
            paramArgs.push("--usageboard-param", `${key}=${value}`);
        }
    }

    paramArgs.push("--usageboard-param", `USAGEBOARD_LANGUAGE=${language}`);

    if (executablePath.endsWith(".py")) {
        return {
            command: pythonCommand,
            args: [executablePath, ...paramArgs],
            env: { PYTHONPATH: dirname(executablePath) },
        };
    }

    return {
        command: executablePath,
        args: paramArgs,
    };
}
