export const CLI_COMMANDS: ReadonlySet<string>;

export type LauncherMode = "help" | "gui" | "cli" | "invalid";

export interface LauncherTranslation {
    mode: LauncherMode;
    forwardArgs: string[];
}

export function translate_launcher_args(args: readonly string[]): LauncherTranslation;
