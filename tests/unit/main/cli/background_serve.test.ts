import { describe, it, expect } from "vitest";
import {
    classify_poll_result,
    build_early_exit_msg,
} from "../../../../src/main/cli/background_serve";

interface CliInfo {
    port: number;
    url?: string;
    pid?: number;
}

describe("classify_poll_result", () => {
    it("子进程非0退出 → exited(原路径:立即失败,不空等)", () => {
        expect(classify_poll_result({ exitCode: 3, childPid: 10, cliInfo: null })).toEqual({
            kind: "exited",
            code: 3,
        });
    });

    it("子进程 code0 退出 → exited_code0(修复点:单实例锁冲突等静默早退也判失败,不再误判启动中空等)", () => {
        expect(classify_poll_result({ exitCode: 0, childPid: 10, cliInfo: null })).toEqual({
            kind: "exited_code0",
        });
    });

    it("code0 退出优先于 cli.json:即使 cliInfo 恰好 pid+url 匹配也判 exited_code0,不误判 ready(不变量:退出优先)", () => {
        const cliInfo: CliInfo = { port: 18263, url: "http://localhost:18263/", pid: 10 };
        expect(classify_poll_result({ exitCode: 0, childPid: 10, cliInfo })).toEqual({
            kind: "exited_code0",
        });
        expect(classify_poll_result({ exitCode: 3, childPid: 10, cliInfo })).toEqual({
            kind: "exited",
            code: 3,
        });
    });

    it("cli.json 写入且 pid 匹配 → ready(正常启动成功)", () => {
        const cliInfo: CliInfo = { port: 18263, url: "http://localhost:18263/", pid: 10 };
        expect(classify_poll_result({ exitCode: null, childPid: 10, cliInfo })).toEqual({
            kind: "ready",
            url: "http://localhost:18263/",
            port: 18263,
        });
    });

    it("cli.json 未写入或无 pid → continue(继续轮询)", () => {
        expect(classify_poll_result({ exitCode: null, childPid: 10, cliInfo: null })).toEqual({
            kind: "continue",
        });
    });

    it("cli.json 有内容但 pid 不匹配(旧实例残留)→ continue,不误判 ready", () => {
        const staleInfo: CliInfo = { port: 18263, url: "http://localhost:18263/", pid: 9999 };
        expect(classify_poll_result({ exitCode: null, childPid: 10, cliInfo: staleInfo })).toEqual({
            kind: "continue",
        });
    });

    it("cli.json 有 url 但无 pid → continue,不误判 ready", () => {
        const noPidInfo: CliInfo = { port: 18263, url: "http://localhost:18263/" };
        expect(classify_poll_result({ exitCode: null, childPid: 10, cliInfo: noPidInfo })).toEqual({
            kind: "continue",
        });
    });
});

describe("build_early_exit_msg", () => {
    it("code0 早退文案含锁冲突诊断与 serve 日志路径(AC-003)", () => {
        const msg = build_early_exit_msg({ kind: "exited_code0" }, "/tmp/serve.log");
        expect(msg).toContain("单实例锁冲突");
        expect(msg).toContain("另一实例正在启动或关闭");
        expect(msg).toContain("若刚执行过 quit 请稍候重试");
        expect(msg).toContain("启动即退出");
        expect(msg).toContain("/tmp/serve.log");
    });

    it("非0 早退文案含退出码与 serve 日志路径(AC-001)", () => {
        const msg = build_early_exit_msg({ kind: "exited", code: 3 }, "/tmp/serve.log");
        expect(msg).toContain("提前退出");
        expect(msg).toContain("code=3");
        expect(msg).toContain("/tmp/serve.log");
    });
});
