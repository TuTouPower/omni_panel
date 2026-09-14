import { spawn } from "node:child_process";

/**
 * Command Code resume is intentionally a fixed executable/argument pair.
 * Session ids are data, never a shell command fragment.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export interface CommandCodeResumeResult {
    readonly command: string;
    readonly started: boolean;
}

export function commandcode_resume_command(session_id: string): string | null {
    if (!SESSION_ID_PATTERN.test(session_id)) return null;
    return `cmd --resume ${session_id}`;
}

/** Start Command Code detached without invoking a shell. */
export function execute_commandcode_resume(session_id: string): CommandCodeResumeResult {
    const command = commandcode_resume_command(session_id);
    if (command === null) throw new Error("invalid Command Code session id");

    const child = spawn("cmd", ["--resume", session_id], {
        detached: true,
        stdio: "ignore",
        shell: false,
    });
    // An asynchronously reported spawn error must not become an unhandled
    // EventEmitter error after the IPC/HTTP response has been sent.
    child.once("error", () => undefined);
    child.unref();
    return { command, started: true };
}
