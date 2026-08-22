import { describe, it, expect } from "vitest";
import { normalize_user_display_text } from "../../../../../src/main/core/session-history/normalize_user_text";

describe("normalize_user_display_text (t436)", () => {
    it("drops isMeta regardless of text", () => {
        expect(
            normalize_user_display_text("Base directory for this skill: /x\n# task-create", {
                is_meta: true,
            }),
        ).toEqual({ keep: false });
    });

    it("extracts user_query inners and drops surrounding envelopes", () => {
        const text =
            "<system-reminder>skills</system-reminder>\n" +
            "<user_query>\n  hello world  \n</user_query>\n" +
            "<skill_information>meta</skill_information>";
        expect(normalize_user_display_text(text)).toEqual({ keep: true, text: "hello world" });
    });

    it("joins multiple user_query inners with newline", () => {
        const text = "<user_query>a</user_query><user_query>b</user_query>";
        expect(normalize_user_display_text(text)).toEqual({ keep: true, text: "a\nb" });
    });

    it("drops empty user_query without leaking tags (t436_code_f001)", () => {
        expect(normalize_user_display_text("<user_query></user_query>")).toEqual({ keep: false });
        expect(
            normalize_user_display_text(
                "<user_query>  </user_query><skill_information>x</skill_information>",
            ),
        ).toEqual({ keep: false });
        expect(normalize_user_display_text("<user_query></user_query>\nreal")).toEqual({
            keep: false,
        });
    });

    it("unwraps slash command-name and args", () => {
        const text =
            "<command-message>task-create</command-message>\n" +
            "<command-name>/task-create</command-name>\n" +
            "<command-args>自定义命令</command-args>";
        expect(normalize_user_display_text(text)).toEqual({
            keep: true,
            text: "/task-create 自定义命令",
        });
    });

    it("unwraps slash without args", () => {
        expect(normalize_user_display_text("<command-name>model</command-name>")).toEqual({
            keep: true,
            text: "/model",
        });
    });

    it("drops reminder-only and context envelopes", () => {
        expect(
            normalize_user_display_text(
                "<system-reminder>The previous turn was interrupted.</system-reminder>",
            ),
        ).toEqual({ keep: false });
        expect(
            normalize_user_display_text(
                "<user_info>OS linux</user_info><git_status>clean</git_status><rules>x</rules>",
            ),
        ).toEqual({ keep: false });
        expect(
            normalize_user_display_text(
                '<system-reminder>Note: The user opened the file "/x".</system-reminder>',
            ),
        ).toEqual({ keep: false });
    });

    it("drops interrupted literal only; keeps when mixed with other text", () => {
        expect(normalize_user_display_text("[Request interrupted by user]")).toEqual({
            keep: false,
        });
        expect(
            normalize_user_display_text("[Request interrupted by user]\nplease continue"),
        ).toEqual({ keep: true, text: "please continue" });
    });

    it("drops local-command envelopes", () => {
        expect(
            normalize_user_display_text(
                "<local-command-stdout>Set model to default</local-command-stdout>",
            ),
        ).toEqual({ keep: false });
        expect(
            normalize_user_display_text(
                "<local-command-caveat>Caveat: DO NOT respond</local-command-caveat>",
            ),
        ).toEqual({ keep: false });
    });

    it("keeps plain user text", () => {
        expect(normalize_user_display_text("帮我看看这个文件")).toEqual({
            keep: true,
            text: "帮我看看这个文件",
        });
    });
});
