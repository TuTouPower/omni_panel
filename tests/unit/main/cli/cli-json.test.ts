import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    cli_json_path,
    write_cli_json,
    type CliInstanceInfo,
} from "../../../../src/main/cli/cli-json";

let tmp: string | undefined;

afterEach(() => {
    if (tmp) {
        rmSync(tmp, { recursive: true, force: true });
        tmp = undefined;
    }
});

describe("cli_json", () => {
    it("cli_json_path 位于 dataRoot 下", () => {
        expect(cli_json_path("/tmp/data")).toBe("/tmp/data/cli.json");
    });

    it("write_cli_json 写入端口/URL/pid/时间戳，JSON 可解析", async () => {
        tmp = mkdtempSync(join(tmpdir(), "omni-cli-json-"));
        await write_cli_json(tmp, { port: 18263, url: "http://localhost:18263/", userData: tmp });

        const raw = readFileSync(cli_json_path(tmp), "utf8");
        const parsed = JSON.parse(raw) as CliInstanceInfo;
        expect(parsed.port).toBe(18263);
        expect(parsed.url).toBe("http://localhost:18263/");
        expect(parsed.userData).toBe(tmp);
        expect(parsed.pid).toBeGreaterThan(0);
        expect(new Date(parsed.startedAt).getTime()).not.toBeNaN();
    });

    it("重复写覆盖旧内容", async () => {
        tmp = mkdtempSync(join(tmpdir(), "omni-cli-json-"));
        await write_cli_json(tmp, { port: 1000, url: "u1", userData: tmp });
        await write_cli_json(tmp, { port: 2000, url: "u2", userData: tmp });
        const parsed = JSON.parse(readFileSync(cli_json_path(tmp), "utf8")) as CliInstanceInfo;
        expect(parsed.port).toBe(2000);
    });
});
