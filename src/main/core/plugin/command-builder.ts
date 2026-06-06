import type { AppLanguage } from "../../../shared/types/plugin";

export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly stdin?: string;
}

export function buildPluginCommand(
    executablePath: string,
    parameterValues: Record<string, string>,
    language: AppLanguage,
    nodePath: string,
): PluginCommand {
    const params = Object.fromEntries(
        Object.entries(parameterValues).filter(([, value]) => value !== ""),
    );
    params["USAGEBOARD_LANGUAGE"] = language;

    return {
        command: nodePath,
        args: [executablePath],
        stdin: JSON.stringify({ params }),
    };
}
