# p159 run_retention_prune 收紧循环空窗口提前 break，稀疏数据预算未达成

- 来源：t343 遗留（2026-08-13，t343_code_f003 + t343_test_f002 minor）
- 内容：`observation-retention.ts` 收紧循环 `if (additional === 0) break`：遇空 1 天窗口即提前停止，稀疏数据下 cacheMaxMb 行数预算可能未达成（虽有 cutoff\<now 90 步上限兜底）。改进方向：空窗口改为继续推进 cutoff（或按更大步长），直至预算达成或 cutoff 达 now。补「prune 返回 0 仍超预算 → break」分支测试。
- 处理：t398
