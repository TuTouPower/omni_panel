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

    it("t531 AC-004: account_label 为空时仅展示厂商名，不展示中点和空白或重复名", () => {
        render(
            <AccountRow
                mode="direct"
                provider="deepseek"
                account_label=""
                enabled={true}
                status="ok"
            />,
        );
        expect(screen.getByTestId("account-vendor")).toHaveTextContent("DeepSeek");
        expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });

    it("t531 AC-004: account_label 存在自定义备注时展示 厂商名 · 备注", () => {
        render(
            <AccountRow
                mode="direct"
                provider="deepseek"
                account_label="工作账号"
                enabled={true}
                status="ok"
            />,
        );
        expect(screen.getByTestId("account-vendor")).toHaveTextContent("DeepSeek");
        expect(screen.getByText("· 工作账号")).toBeInTheDocument();
    });
});
