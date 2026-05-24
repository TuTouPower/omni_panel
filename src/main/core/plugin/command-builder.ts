import type { AppLanguage } from "../../../shared/types/plugin";
import { dirname } from "node:path";

export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
}

const SHELL_META = /[&|`$<>!#;]/;

export function buildPluginCommand(
    executablePath: string,
    parameterValues: Record<string, string>,
    language: AppLanguage,
    pythonCommand = "python3",
): PluginCommand {
    const paramArgs: string[] = [];

    for (const [key, value] of Object.entries(parameterValues)) {
        if (value !== "") {
            if (SHELL_META.test(key) || SHELL_META.test(value)) {
                throw new Error(`Parameter key or value contains unsafe characters: ${key}`);
            }
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
