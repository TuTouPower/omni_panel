import { test } from "../fixtures/test_web";

/**
 * Web e2e：per-account error badge（T027）。
 * ProviderAccountRow error badge UI 已实现（.error-badge CSS + title={error}）。
 * MetricRecord.error 当前无数据（connector 脚本不记 per-account error，T028 后置），
 * synthetic fixture 无 error MetricRecord → .error-badge 不渲染 → skip。
 * T028 改进 connector script 记 error 后移除 skip。
 */
test.describe("account error badge (web)", () => {
    test.skip(true, "T028 connector script per-account error 待实现；T027 UI 已就绪，待数据验证");
});
