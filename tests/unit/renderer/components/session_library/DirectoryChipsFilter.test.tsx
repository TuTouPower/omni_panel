import { describe, expect, it } from "vitest";
import {
    dir_name,
    parse_directories_input,
} from "../../../../../src/renderer/components/session-library/DirectoryChipsFilter";

/**
 * 目录 chips 输入解析：引号包裹的含空格路径视为单个目录；末级名兼容 Windows 分隔。
 */

describe("parse_directories_input", () => {
    it("空输入返回空数组", () => {
        expect(parse_directories_input("")).toEqual([]);
        expect(parse_directories_input("  ,， ")).toEqual([]);
    });

    it("逗号/空白分隔批量", () => {
        expect(parse_directories_input("/proj/a, /proj/c")).toEqual(["/proj/a", "/proj/c"]);
        expect(parse_directories_input("/proj/a，/proj/b /proj/c")).toEqual([
            "/proj/a",
            "/proj/b",
            "/proj/c",
        ]);
    });

    it("双引号包裹的含空格路径保持单个", () => {
        expect(parse_directories_input('"/home/u/My Docs" /proj/a')).toEqual([
            "/home/u/My Docs",
            "/proj/a",
        ]);
    });

    it("单引号包裹与引号内逗号保留", () => {
        expect(parse_directories_input("'C:\\My Docs\\proj',/proj/a")).toEqual([
            "C:\\My Docs\\proj",
            "/proj/a",
        ]);
        expect(parse_directories_input('"a,b"')).toEqual(["a,b"]);
    });

    it("未闭合引号视为延续到末尾", () => {
        expect(parse_directories_input('"/home/u/My Docs')).toEqual(["/home/u/My Docs"]);
    });
});

describe("dir_name", () => {
    it("POSIX 路径取末级", () => {
        expect(dir_name("~/dev/paygate")).toBe("paygate");
        expect(dir_name("/proj/a/")).toBe("a");
    });

    it("Windows 反斜杠路径取末级", () => {
        expect(dir_name("C:\\Users\\u\\proj")).toBe("proj");
        expect(dir_name("C:\\Users\\u\\My Docs")).toBe("My Docs");
    });
});
