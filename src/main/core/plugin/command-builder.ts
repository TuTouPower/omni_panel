import type { AppLanguage } from "../../../shared/types/plugin";

export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
}

export function buildPluginCommand(
    executablePath: string,
    parameterValues: Record<string, string>,
    language: AppLanguage,
    nodePath: string,
): PluginCommand {
    const paramArgs: string[] = [];

    for (const [key, value] of Object.entries(parameterValues)) {
        if (value !== "") {
            paramArgs.push("--usageboard-param", `${key}=${value}`);
        }
    }

    paramArgs.push("--usageboard-param", `USAGEBOARD_LANGUAGE=${language}`);

    return {
        command: nodePath,
        args: [executablePath, ...paramArgs],
    };
}
