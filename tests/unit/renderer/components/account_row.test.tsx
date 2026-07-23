import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AccountRow } from "../../../../src/renderer/components/AccountRow";

describe("AccountRow status text", () => {
    it("shows 未连接 for unknown status (not 正常)", () => {
        render(
            <AccountRow
                mode="direct"
                provider="deepseek"
                account_label="Test"
                enabled={true}
                status="unknown"
            />,
        );
        expect(screen.getByText("未连接")).toBeInTheDocument();
        expect(screen.queryByText("正常")).not.toBeInTheDocument();
    });

    it("shows 正常 for ok status", () => {
        render(
            <AccountRow
                mode="direct"
                provider="deepseek"
                account_label="Test"
                enabled={true}
                status="ok"
            />,
        );
        expect(screen.getByText("正常")).toBeInTheDocument();
    });

    it("shows 已关闭 when disabled", () => {
        render(
            <AccountRow
                mode="direct"
                provider="deepseek"
                account_label="Test"
                enabled={false}
                status="ok"
            />,
        );
        expect(screen.getByText("已关闭")).toBeInTheDocument();
    });
});
